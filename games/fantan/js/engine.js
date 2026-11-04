/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 4 — pure Fan-Tan engine
   The pile of beads counted off in fours, the thirty-eight bets of the
   layout, their 5% commission, the box that keeps the change a whole
   dollar payout leaves, and the exact house edge of every bet. No DOM,
   storage, network, or third-party dependencies.
   Exposed as window.FanTanEngine and CommonJS for tests.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory(root && root.crypto);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FanTanEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (cryptoSource) {
  "use strict";

  var UINT32_RANGE = 0x100000000;
  var NUMBERS = [1, 2, 3, 4];
  // The croupier's pile holds 41 to 104 beads: sixty-four counts, sixteen of
  // them for each of the four remainders, so every number has the same chance.
  var MIN_BEADS = 41;
  var BEAD_COUNTS = 64;
  // Amounts in the box are counted in 120ths of a dollar: every net pay of
  // every bet on a whole-dollar stake is a whole number of them.
  var UNITS = 120;
  // The house keeps 5% of what a bet wins: a win pays 19/20 of its odds.
  var KEEP_NUM = 19, KEEP_DEN = 20;

  /* ---------------- The bets ---------------- */
  // Each bet wins on some numbers, is returned on some and loses on the
  // rest; a win pays num to den before the commission.
  var KINDS = {
    fan: { num: 3, den: 1, limit: 2500 },
    nim: { num: 2, den: 1, limit: 2500 },
    pair: { num: 1, den: 1, limit: 5000 },
    tan: { num: 1, den: 2, limit: 5000 },
    ssh: { num: 1, den: 3, limit: 5000 }
  };
  var DEFS = {};
  var BETS = [];
  function define(key, kind, wins, push) {
    DEFS[key] = { key: key, kind: kind, wins: wins, push: push || [] };
    BETS.push(key);
  }
  // Fan: one number.
  NUMBERS.forEach(function (n) { define("fan" + n, "fan", [n]); });
  // Kwok: the two numbers at a corner of the square, and Odd and Even, the
  // two pairs across it.
  [[1, 2], [2, 3], [3, 4], [4, 1]].forEach(function (pair) { define("kwok" + pair.join(""), "pair", pair); });
  define("odd", "pair", [1, 3]);
  define("even", "pair", [2, 4]);
  // Sheh Sam Hong: three numbers, every one but the fourth.
  [[1, 2, 3], [2, 3, 4], [3, 4, 1], [4, 1, 2]].forEach(function (three) { define("ssh" + three.join(""), "ssh", three); });
  // Nim: one number wins and a second is returned.
  NUMBERS.forEach(function (a) {
    NUMBERS.forEach(function (b) { if (a !== b) define("nim" + a + b, "nim", [a], [b]); });
  });
  // Nga Tan: two numbers win and a third is returned; by the number
  // returned, the three pairs of the other numbers.
  NUMBERS.forEach(function (c) {
    [[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]].forEach(function (pair) {
      if (pair.indexOf(c) === -1) define("tan" + pair.join("") + c, "tan", pair, [c]);
    });
  });

  function isBet(key) { return Object.prototype.hasOwnProperty.call(DEFS, key); }
  function kindOf(key) { return DEFS[key].kind; }
  function maxBet(key) { return isBet(key) ? KINDS[kindOf(key)].limit : 0; }

  /* ---------------- Randomness and the beads ---------------- */
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

  // What the beads leave when they are taken away four at a time: 1 to 4.
  function remainderOf(beads) {
    return ((beads - 1) % 4) + 1;
  }

  function isBeads(beads) {
    return Number.isSafeInteger(beads) && beads >= MIN_BEADS && beads < MIN_BEADS + BEAD_COUNTS;
  }

  // The croupier's double handful.
  function drawBeads(source) {
    return MIN_BEADS + randomInt(BEAD_COUNTS, source);
  }

  /* ---------------- Settlement ---------------- */
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

  function withinLimits(bets) {
    return Object.keys(bets).every(function (key) { return bets[key] <= maxBet(key); });
  }

  // What one bet comes to on a result: "win", "push" or "lose".
  function resultOf(key, result) {
    var def = DEFS[key];
    if (def.wins.indexOf(result) !== -1) return "win";
    if (def.push.indexOf(result) !== -1) return "push";
    return "lose";
  }

  // What a winning stake brings back beside itself, less the commission,
  // in units: stake × odds × 19/20 × 120.
  function netWinUnits(key, amount) {
    var kind = KINDS[kindOf(key)];
    return amount * kind.num * KEEP_NUM * (UNITS / KEEP_DEN) / kind.den;
  }

  // What the box holds between rounds: units of change owed to the player,
  // less than a dollar.
  function normalizeBox(value) {
    value = Number(value);
    return Number.isInteger(value) && value >= 0 && value < UNITS ? value : 0;
  }

  // Settles the bets on a result against the box. Each line is one bet:
  // its stake, what it comes to and what it returns, in units, stake
  // included. The round pays the whole dollars of what the bets return and
  // the box held; the change stays in the box for a later win, so every bet
  // is paid exactly its odds less 5%.
  function settle(bets, result, box) {
    bets = normalizeBets(bets);
    var lines = Object.keys(bets).map(function (key) {
      var amount = bets[key];
      var outcome = resultOf(key, result);
      var units = outcome === "win" ? amount * UNITS + netWinUnits(key, amount) : outcome === "push" ? amount * UNITS : 0;
      return { key: key, amount: amount, result: outcome, units: units };
    });
    var stake = totalStake(bets);
    var returnedUnits = lines.reduce(function (sum, line) { return sum + line.units; }, 0);
    var held = normalizeBox(box) + returnedUnits;
    var paid = Math.floor(held / UNITS);
    return {
      lines: lines,
      result: result,
      stake: stake,
      returnedUnits: returnedUnits,
      paid: paid,
      box: held - paid * UNITS,
      net: paid - stake
    };
  }

  /* ---------------- The odds ---------------- */
  // The house's share of a bet over the four results, each as likely.
  function houseEdge(key) {
    var units = 0;
    NUMBERS.forEach(function (result) {
      var outcome = resultOf(key, result);
      units += outcome === "win" ? UNITS + netWinUnits(key, 1) : outcome === "push" ? UNITS : 0;
    });
    return 1 - units / 4 / UNITS;
  }

  return {
    NUMBERS: NUMBERS,
    MIN_BEADS: MIN_BEADS,
    BEAD_COUNTS: BEAD_COUNTS,
    UNITS: UNITS,
    KINDS: KINDS,
    BETS: BETS,
    DEFS: DEFS,
    isBet: isBet,
    kindOf: kindOf,
    maxBet: maxBet,
    randomInt: randomInt,
    remainderOf: remainderOf,
    isBeads: isBeads,
    drawBeads: drawBeads,
    wholeAmount: wholeAmount,
    normalizeBets: normalizeBets,
    totalStake: totalStake,
    withinLimits: withinLimits,
    resultOf: resultOf,
    netWinUnits: netWinUnits,
    normalizeBox: normalizeBox,
    settle: settle,
    houseEdge: houseEdge
  };
});
