/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 18 — pure Sic Bo engine
   Three dice and every bet on the layout: Small and Big, Odd and
   Even, the totals, the triples, the doubles, the two-dice
   combinations and the single numbers. Every bet is decided by the
   one roll it was made for. No DOM, storage, network, or third-party
   dependencies.
   Exposed as window.SicBoEngine and CommonJS for tests.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory(root && root.crypto);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SicBoEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (cryptoSource) {
  "use strict";

  var UINT32_RANGE = 0x100000000;
  var FACES = [1, 2, 3, 4, 5, 6];
  var DICE = 3;

  // What a winning total pays, to one: the rarer the total, the more.
  var TOTAL_PAYS = { 4: 60, 5: 30, 6: 17, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 17, 16: 30, 17: 60 };
  var TOTALS = Object.keys(TOTAL_PAYS).map(Number);
  // The other bets, to one. A single number pays once for every die that shows it.
  var PAYS = { even: 1, triple: 180, anyTriple: 30, double: 10, combo: 5 };

  // The fifteen pairs of different numbers, low first: [1, 2], [1, 3] … [5, 6].
  var COMBOS = [];
  FACES.forEach(function (a) { FACES.forEach(function (b) { if (a < b) COMBOS.push([a, b]); }); });

  // Every bet on the layout, by the key the table and its saved state use.
  var BETS = ["small", "big", "odd", "even"]
    .concat(TOTALS.map(function (n) { return "total" + n; }))
    .concat(FACES.map(function (n) { return "triple" + n; }))
    .concat(["anyTriple"])
    .concat(FACES.map(function (n) { return "double" + n; }))
    .concat(COMBOS.map(function (pair) { return "combo" + pair[0] + pair[1]; }))
    .concat(FACES.map(function (n) { return "single" + n; }));

  // Table maximum for each kind of bet, so that no single bet can win more
  // than the house is willing to pay on one roll.
  var LIMITS = { even: 5000, single: 2500, combo: 1000, double: 500, total: 500, anyTriple: 500, triple: 100 };

  /* ---------------- Dice ---------------- */
  // An unbiased integer in [0, n) from crypto.getRandomValues, with rejection
  // sampling so that no value is favoured by the 2^32 range.
  function randomInt(n, source) {
    if (!(n >= 1) || n > UINT32_RANGE || Math.floor(n) !== n) throw new RangeError("Bad range: " + n);
    if (typeof source === "function") {
      var sample = source();
      if (!(sample >= 0 && sample < 1)) throw new RangeError("Bad random source value");
      return Math.floor(sample * n);
    }
    var crypto = cryptoSource;
    if (!crypto || typeof crypto.getRandomValues !== "function") throw new Error("No secure random source");
    var limit = UINT32_RANGE - (UINT32_RANGE % n);
    var buffer = new Uint32Array(1);
    do { crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
    return buffer[0] % n;
  }

  function rollDice(source) {
    return [randomInt(6, source) + 1, randomInt(6, source) + 1, randomInt(6, source) + 1];
  }

  function isDice(dice) {
    return Array.isArray(dice) && dice.length === DICE && dice.every(function (die) { return Number.isInteger(die) && die >= 1 && die <= 6; });
  }

  /* ---------------- The bets ---------------- */
  // What kind of bet a key is.
  function kindOf(key) {
    if (key === "small" || key === "big" || key === "odd" || key === "even") return "even";
    if (/^total(\d+)$/.test(key) && TOTAL_PAYS[Number(key.slice(5))]) return "total";
    if (/^triple[1-6]$/.test(key)) return "triple";
    if (key === "anyTriple") return "anyTriple";
    if (/^double[1-6]$/.test(key)) return "double";
    if (/^combo[1-6][1-6]$/.test(key) && key[5] < key[6]) return "combo";
    if (/^single[1-6]$/.test(key)) return "single";
    return null;
  }

  // The numbers a bet names: total11 → [11], combo25 → [2, 5], small → [].
  function numbersOf(key) {
    if (kindOf(key) === "combo") return [Number(key[5]), Number(key[6])];
    var match = /(\d+)$/.exec(key);
    return match ? [Number(match[1])] : [];
  }

  function wholeAmount(value) {
    value = Number(value);
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  }

  // Keeps only real bets with whole, positive amounts, in layout order.
  function normalizeBets(bets) {
    var out = {};
    if (!bets || typeof bets !== "object") return out;
    BETS.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(bets, key)) {
        var amount = wholeAmount(bets[key]);
        if (amount) out[key] = amount;
      }
    });
    return out;
  }

  function totalStake(bets) {
    return Object.keys(bets).reduce(function (sum, key) { return sum + bets[key]; }, 0);
  }

  // The largest amount a bet may hold.
  function maxBet(key) {
    var kind = kindOf(key);
    return kind ? LIMITS[kind] : 0;
  }

  // Why a bet cannot take more chips, or null when it can.
  function canAdd(key, bets) {
    if (!kindOf(key)) return "unknown";
    if (((bets && bets[key]) || 0) >= maxBet(key)) return "limit";
    return null;
  }

  // Whether every bet stays within its table maximum.
  function isLegalLayout(bets) {
    return Object.keys(bets).every(function (key) { return bets[key] <= maxBet(key); });
  }

  /* ---------------- A roll ---------------- */
  // How many dice show each face, indexed 1 to 6.
  function countFaces(dice) {
    var counts = [0, 0, 0, 0, 0, 0, 0];
    dice.forEach(function (die) { counts[die] += 1; });
    return counts;
  }

  function isTriple(dice) {
    return dice[0] === dice[1] && dice[1] === dice[2];
  }

  // What one dollar on a bet wins on these dice, to one; 0 when it loses.
  // Small, Big, Odd and Even all lose to any triple.
  function payFor(key, dice) {
    var total = dice[0] + dice[1] + dice[2];
    var counts = countFaces(dice);
    var triple = isTriple(dice);
    var numbers = numbersOf(key);
    switch (kindOf(key)) {
      case "even":
        if (triple) return 0;
        if (key === "small") return total >= 4 && total <= 10 ? PAYS.even : 0;
        if (key === "big") return total >= 11 && total <= 17 ? PAYS.even : 0;
        if (key === "odd") return total % 2 === 1 ? PAYS.even : 0;
        return total % 2 === 0 ? PAYS.even : 0;
      case "total": return total === numbers[0] ? TOTAL_PAYS[total] : 0;
      case "triple": return counts[numbers[0]] === 3 ? PAYS.triple : 0;
      case "anyTriple": return triple ? PAYS.anyTriple : 0;
      case "double": return counts[numbers[0]] >= 2 ? PAYS.double : 0;
      case "combo": return counts[numbers[0]] >= 1 && counts[numbers[1]] >= 1 ? PAYS.combo : 0;
      case "single": return counts[numbers[0]];
      default: return 0;
    }
  }

  // Every bet on the layout that these dice win, in layout order.
  function winners(dice) {
    return BETS.filter(function (key) { return payFor(key, dice) > 0; });
  }

  // Everything one roll does to the bets on the layout. Each line says what
  // happened to one bet: a winner gets back its stake and `profit`; a loser
  // is gone. Every bet is decided, so the layout is clear afterwards.
  function resolve(bets, dice) {
    bets = normalizeBets(bets);
    var lines = Object.keys(bets).map(function (key) {
      var amount = bets[key];
      var times = payFor(key, dice);
      return times
        ? { key: key, amount: amount, result: "win", times: times, profit: amount * times, returned: amount * (times + 1) }
        : { key: key, amount: amount, result: "lose", times: 0, profit: 0, returned: 0 };
    });
    var sum = function (field) { return lines.reduce(function (total, line) { return total + line[field]; }, 0); };
    var lost = lines.reduce(function (total, line) { return total + (line.result === "lose" ? line.amount : 0); }, 0);
    return {
      dice: dice.slice(),
      total: dice[0] + dice[1] + dice[2],
      triple: isTriple(dice),
      lines: lines,
      stake: totalStake(bets),
      returned: sum("returned"),
      profit: sum("profit"),
      lost: lost
    };
  }

  /* ---------------- The house edge ---------------- */
  // The exact house edge of a bet, from every one of the 216 ways three dice
  // can land: what a dollar loses on average, as a fraction of the dollar.
  function houseEdge(key) {
    var returned = 0;
    FACES.forEach(function (a) {
      FACES.forEach(function (b) {
        FACES.forEach(function (c) {
          var times = payFor(key, [a, b, c]);
          if (times) returned += times + 1;
        });
      });
    });
    return 1 - returned / 216;
  }

  /* ---------------- Statistics ---------------- */
  // What the table charts about its last rolls: every total, every face,
  // and Small, Big, Odd, Even and the triples, each with its exact chance
  // from the 216 ways three dice can land.
  function chanceOf(test) {
    var ways = 0;
    FACES.forEach(function (a) {
      FACES.forEach(function (b) {
        FACES.forEach(function (c) { if (test([a, b, c])) ways++; });
      });
    });
    return ways / 216;
  }

  function sumOf(dice) { return dice[0] + dice[1] + dice[2]; }

  function statSpecs() {
    function spec(key, test) { return { key: key, test: test, chance: chanceOf(test) }; }
    var totals = [];
    for (var total = 3; total <= 18; total++) {
      totals.push(spec(total, (function (n) { return function (dice) { return sumOf(dice) === n; }; })(total)));
    }
    var faces = FACES.map(function (face) {
      return spec(face, function (dice) { return dice.indexOf(face) !== -1; });
    });
    var groups = [
      spec("small", function (dice) { return !isTriple(dice) && sumOf(dice) <= 10; }),
      spec("big", function (dice) { return !isTriple(dice) && sumOf(dice) >= 11; }),
      spec("odd", function (dice) { return !isTriple(dice) && sumOf(dice) % 2 === 1; }),
      spec("even", function (dice) { return !isTriple(dice) && sumOf(dice) % 2 === 0; }),
      spec("triple", isTriple)
    ];
    return { totals: totals, faces: faces, groups: groups };
  }

  return {
    FACES: FACES,
    DICE: DICE,
    TOTAL_PAYS: TOTAL_PAYS,
    TOTALS: TOTALS,
    PAYS: PAYS,
    COMBOS: COMBOS,
    BETS: BETS,
    LIMITS: LIMITS,
    randomInt: randomInt,
    rollDice: rollDice,
    isDice: isDice,
    kindOf: kindOf,
    numbersOf: numbersOf,
    wholeAmount: wholeAmount,
    normalizeBets: normalizeBets,
    totalStake: totalStake,
    maxBet: maxBet,
    canAdd: canAdd,
    isLegalLayout: isLegalLayout,
    countFaces: countFaces,
    isTriple: isTriple,
    payFor: payFor,
    winners: winners,
    resolve: resolve,
    houseEdge: houseEdge,
    statSpecs: statSpecs
  };
});
