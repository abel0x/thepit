/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 37 — pure single-zero roulette engine
   Wheel, every standard bet, announced bets and settlement.
   No DOM, storage, network, or third-party dependencies.
   Exposed as window.RouletteEngine and CommonJS for tests.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory(root && root.crypto);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RouletteEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (cryptoSource) {
  "use strict";

  // Clockwise pocket order of a European single-zero wheel.
  var WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  var POCKETS = WHEEL.length;
  var RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  var UINT32_RANGE = 0x100000000;

  // Profit paid per unit staked, i.e. "35 to 1".
  var PAYOUTS = {
    straight: 35,
    split: 17,
    street: 11,
    trio: 11,
    corner: 8,
    firstFour: 8,
    sixLine: 5,
    column: 2,
    dozen: 2,
    red: 1,
    black: 1,
    odd: 1,
    even: 1,
    low: 1,
    high: 1
  };

  // Table maximum per bet, as a multiple of the straight-up maximum. Inside
  // bets scale with the numbers they cover, like the limits on a real table.
  var LIMIT_UNITS = {
    straight: 1,
    split: 2,
    street: 3,
    trio: 3,
    corner: 4,
    firstFour: 4,
    sixLine: 6,
    column: 10,
    dozen: 10,
    red: 20,
    black: 20,
    odd: 20,
    even: 20,
    low: 20,
    high: 20
  };

  var EVEN_MONEY = ["red", "black", "odd", "even", "low", "high"];

  var isRedTable = {};
  RED_NUMBERS.forEach(function (n) { isRedTable[n] = true; });
  var wheelIndex = {};
  WHEEL.forEach(function (n, index) { wheelIndex[n] = index; });

  function isNumber(n) {
    return typeof n === "number" && n % 1 === 0 && n >= 0 && n <= 36;
  }

  function colorOf(n) {
    if (!isNumber(n)) throw new RangeError("Not a roulette number: " + n);
    if (n === 0) return "green";
    return isRedTable[n] ? "red" : "black";
  }

  function describe(n) {
    var color = colorOf(n);
    if (n === 0) return { number: 0, color: color, parity: null, range: null, dozen: null, column: null };
    return {
      number: n,
      color: color,
      parity: n % 2 ? "odd" : "even",
      range: n <= 18 ? "low" : "high",
      dozen: Math.ceil(n / 12),
      column: ((n - 1) % 3) + 1
    };
  }

  /* ---------------- Bet catalogue ---------------- */
  var BETS = {};
  var BET_LIST = [];

  function range(from, to) {
    var out = [];
    for (var n = from; n <= to; n++) out.push(n);
    return out;
  }

  function insideKey(type, numbers) {
    return type + ":" + numbers.join("-");
  }

  function addBet(key, type, numbers) {
    var bet = {
      key: key,
      type: type,
      numbers: numbers.slice().sort(function (a, b) { return a - b; }),
      payout: PAYOUTS[type],
      inside: !(type === "column" || type === "dozen" || EVEN_MONEY.indexOf(type) !== -1),
      evenMoney: EVEN_MONEY.indexOf(type) !== -1,
      limitUnits: LIMIT_UNITS[type]
    };
    Object.freeze(bet.numbers);
    Object.freeze(bet);
    BETS[key] = bet;
    BET_LIST.push(bet);
  }

  function addInside(type, numbers) {
    numbers = numbers.slice().sort(function (a, b) { return a - b; });
    addBet(insideKey(type, numbers), type, numbers);
  }

  (function buildCatalogue() {
    var n;
    for (n = 0; n <= 36; n++) addInside("straight", [n]);
    addInside("split", [0, 1]);
    addInside("split", [0, 2]);
    addInside("split", [0, 3]);
    for (n = 1; n <= 36; n++) {
      if (n % 3 !== 0) addInside("split", [n, n + 1]);   // same column, next row
      if (n <= 33) addInside("split", [n, n + 3]);       // same row, next column
    }
    for (n = 1; n <= 34; n += 3) addInside("street", [n, n + 1, n + 2]);
    addInside("trio", [0, 1, 2]);
    addInside("trio", [0, 2, 3]);
    for (n = 1; n <= 32; n++) {
      if (n % 3 !== 0) addInside("corner", [n, n + 1, n + 3, n + 4]);
    }
    addInside("firstFour", [0, 1, 2, 3]);
    for (n = 1; n <= 31; n += 3) addInside("sixLine", range(n, n + 5));

    [1, 2, 3].forEach(function (column) {
      addBet("column:" + column, "column", range(1, 36).filter(function (x) { return ((x - 1) % 3) + 1 === column; }));
    });
    [1, 2, 3].forEach(function (dozen) {
      addBet("dozen:" + dozen, "dozen", range((dozen - 1) * 12 + 1, dozen * 12));
    });
    addBet("red", "red", RED_NUMBERS);
    addBet("black", "black", range(1, 36).filter(function (x) { return !isRedTable[x]; }));
    addBet("odd", "odd", range(1, 36).filter(function (x) { return x % 2 === 1; }));
    addBet("even", "even", range(1, 36).filter(function (x) { return x % 2 === 0; }));
    addBet("low", "low", range(1, 18));
    addBet("high", "high", range(19, 36));
  })();
  Object.freeze(BETS);
  Object.freeze(BET_LIST);

  function getBet(key) {
    return Object.prototype.hasOwnProperty.call(BETS, key) ? BETS[key] : null;
  }

  // Finds the inside bet that covers exactly these numbers, if there is one.
  function betForNumbers(numbers) {
    if (!Array.isArray(numbers) || numbers.length === 0) return null;
    var sorted = numbers.slice().sort(function (a, b) { return a - b; });
    var types = { 1: ["straight"], 2: ["split"], 3: ["street", "trio"], 4: ["corner", "firstFour"], 6: ["sixLine"] }[sorted.length];
    if (!types) return null;
    for (var i = 0; i < types.length; i++) {
      var bet = getBet(insideKey(types[i], sorted));
      if (bet) return bet;
    }
    return null;
  }

  function maxStake(key, straightMax) {
    var bet = getBet(key);
    if (!bet) throw new RangeError("Unknown bet: " + key);
    return bet.limitUnits * straightMax;
  }

  /* ---------------- Announced (call) bets ---------------- */
  // Each entry is [bet key, units]. Payout is per component bet.
  var ANNOUNCED = {
    voisins: [["trio:0-2-3", 2], ["split:4-7", 1], ["split:12-15", 1], ["split:18-21", 1],
      ["split:19-22", 1], ["corner:25-26-28-29", 2], ["split:32-35", 1]],
    tiers: [["split:5-8", 1], ["split:10-11", 1], ["split:13-16", 1], ["split:23-24", 1],
      ["split:27-30", 1], ["split:33-36", 1]],
    orphelins: [["straight:1", 1], ["split:6-9", 1], ["split:14-17", 1], ["split:17-20", 1],
      ["split:31-34", 1]],
    zero: [["split:0-3", 1], ["split:12-15", 1], ["split:32-35", 1], ["straight:26", 1]]
  };
  var ANNOUNCED_NAMES = Object.keys(ANNOUNCED);

  function announcedNumbers(name) {
    var seen = {};
    (ANNOUNCED[name] || []).forEach(function (part) {
      getBet(part[0]).numbers.forEach(function (n) { seen[n] = true; });
    });
    return WHEEL.filter(function (n) { return seen[n]; });
  }

  function announcedUnits(name) {
    return (ANNOUNCED[name] || []).reduce(function (sum, part) { return sum + part[1]; }, 0);
  }

  // Expands a call bet into the layout bets a croupier would place.
  function announcedBets(name, unit) {
    if (!ANNOUNCED[name]) throw new RangeError("Unknown announced bet: " + name);
    unit = wholeAmount(unit);
    return ANNOUNCED[name].map(function (part) {
      return { key: part[0], amount: part[1] * unit };
    });
  }

  function neighbours(number, count) {
    if (!isNumber(number)) throw new RangeError("Not a roulette number: " + number);
    count = Math.max(0, Math.min(18, Math.floor(Number(count)) || 0));
    var centre = wheelIndex[number];
    var out = [];
    for (var offset = -count; offset <= count; offset++) {
      out.push(WHEEL[(centre + offset + POCKETS) % POCKETS]);
    }
    return out;
  }

  function neighbourBets(number, count, unit) {
    unit = wholeAmount(unit);
    return neighbours(number, count).map(function (n) {
      return { key: "straight:" + n, amount: unit };
    });
  }

  /* ---------------- Amounts & settlement ---------------- */
  function wholeAmount(value) {
    value = Math.floor(Number(value));
    return isFinite(value) && value > 0 ? Math.min(value, Number.MAX_SAFE_INTEGER) : 0;
  }

  // Normalizes a { key: amount } layout: unknown keys and empty stakes vanish.
  function normalizeBets(bets) {
    var out = {};
    if (!bets || typeof bets !== "object") return out;
    Object.keys(bets).forEach(function (key) {
      if (!getBet(key)) return;
      var amount = wholeAmount(bets[key]);
      if (amount > 0) out[key] = amount;
    });
    return out;
  }

  function totalStake(bets) {
    var sum = 0;
    Object.keys(bets || {}).forEach(function (key) { sum += wholeAmount(bets[key]); });
    return sum;
  }

  // options.laPartage: an even-money bet loses only half when zero wins.
  // Half of an odd stake rounds down to whole money.
  function settle(bets, result, options) {
    if (!isNumber(result)) throw new RangeError("Not a roulette number: " + result);
    options = options || {};
    var layout = normalizeBets(bets);
    var lines = [];
    var stake = 0;
    var returned = 0;
    Object.keys(layout).forEach(function (key) {
      var bet = BETS[key];
      var amount = layout[key];
      var line = { key: key, amount: amount, outcome: "lose", returned: 0 };
      if (bet.numbers.indexOf(result) !== -1) {
        line.outcome = "win";
        line.returned = amount * (bet.payout + 1);
      } else if (options.laPartage && result === 0 && bet.evenMoney) {
        line.outcome = "partage";
        line.returned = Math.floor(amount / 2);
      }
      stake += amount;
      returned += line.returned;
      lines.push(line);
    });
    if (!Number.isSafeInteger(stake) || !Number.isSafeInteger(returned)) {
      throw new RangeError("Stake exceeds the safe table limit");
    }
    return { result: result, stake: stake, returned: returned, net: returned - stake, lines: lines };
  }

  /* ---------------- Randomness ---------------- */
  function randomInt(maxExclusive, fallbackRandom) {
    maxExclusive = Math.floor(Number(maxExclusive));
    if (!isFinite(maxExclusive) || maxExclusive <= 0 || maxExclusive > UINT32_RANGE) {
      throw new RangeError("maxExclusive must be between 1 and 2^32");
    }
    if (cryptoSource && typeof cryptoSource.getRandomValues === "function") {
      // Rejection sampling keeps every outcome exactly equiprobable.
      var limit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
      var buffer = new Uint32Array(1);
      var value;
      do {
        cryptoSource.getRandomValues(buffer);
        value = buffer[0];
      } while (value >= limit);
      return value % maxExclusive;
    }
    var random = typeof fallbackRandom === "function" ? fallbackRandom : Math.random;
    var sample = Number(random());
    if (!isFinite(sample) || sample < 0 || sample >= 1) {
      throw new RangeError("random source must return a number from 0 up to, but not including, 1");
    }
    return Math.floor(sample * maxExclusive);
  }

  // The winning number. The wheel animation is choreographed to land on it.
  function spin(fallbackRandom) {
    return WHEEL[randomInt(POCKETS, fallbackRandom)];
  }

  /* ---------------- History statistics ---------------- */
  function summarize(history, sample) {
    var list = Array.isArray(history) ? history.filter(isNumber) : [];
    if (sample) list = list.slice(-sample);
    var counts = [];
    var lastSeen = [];
    for (var n = 0; n <= 36; n++) { counts.push(0); lastSeen.push(null); }
    var tally = { red: 0, black: 0, green: 0, odd: 0, even: 0, low: 0, high: 0, dozens: [0, 0, 0], columns: [0, 0, 0] };
    list.forEach(function (value, index) {
      counts[value]++;
      lastSeen[value] = list.length - 1 - index;
      var info = describe(value);
      tally[info.color]++;
      if (info.parity) tally[info.parity]++;
      if (info.range) tally[info.range]++;
      if (info.dozen) tally.dozens[info.dozen - 1]++;
      if (info.column) tally.columns[info.column - 1]++;
    });
    var numbers = range(0, 36);
    // Ties break toward the most recent hit (hot) and the longest absence (cold).
    var hot = numbers.filter(function (x) { return counts[x] > 0; }).sort(function (a, b) {
      return counts[b] - counts[a] || lastSeen[a] - lastSeen[b] || a - b;
    });
    var cold = numbers.slice().sort(function (a, b) {
      var sa = lastSeen[a] == null ? Infinity : lastSeen[a];
      var sb = lastSeen[b] == null ? Infinity : lastSeen[b];
      return counts[a] - counts[b] || sb - sa || a - b;
    });
    return { spins: list.length, counts: counts, lastSeen: lastSeen, tally: tally, hot: hot, cold: cold };
  }

  return {
    WHEEL: Object.freeze(WHEEL.slice()),
    POCKETS: POCKETS,
    RED_NUMBERS: Object.freeze(RED_NUMBERS.slice()),
    PAYOUTS: Object.freeze(PAYOUTS),
    LIMIT_UNITS: Object.freeze(LIMIT_UNITS),
    ANNOUNCED_NAMES: Object.freeze(ANNOUNCED_NAMES.slice()),
    BETS: BETS,
    BET_LIST: BET_LIST,
    isNumber: isNumber,
    colorOf: colorOf,
    describe: describe,
    wheelIndexOf: function (n) {
      if (!isNumber(n)) throw new RangeError("Not a roulette number: " + n);
      return wheelIndex[n];
    },
    getBet: getBet,
    betForNumbers: betForNumbers,
    maxStake: maxStake,
    announcedBets: announcedBets,
    announcedNumbers: announcedNumbers,
    announcedUnits: announcedUnits,
    neighbours: neighbours,
    neighbourBets: neighbourBets,
    wholeAmount: wholeAmount,
    normalizeBets: normalizeBets,
    totalStake: totalStake,
    settle: settle,
    randomInt: randomInt,
    spin: spin,
    summarize: summarize
  };
});
