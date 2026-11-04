/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Drop 16 — pure peg board engine
   The boards of 8, 12 and 16 rows of pegs, the pay tables of three
   risks, the path of a ball bouncing left or right at every row, the
   slot it lands in and what it pays, and the exact return of every
   board. No DOM, storage, network, or third-party dependencies.
   Exposed as window.PegboardEngine and CommonJS for tests.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory(root && root.crypto);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PegboardEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (cryptoSource) {
  "use strict";

  var UINT32_RANGE = 0x100000000;
  var ROWS = [8, 12, 16];
  var RISKS = ["low", "medium", "high"];
  // Balls dropped in one round, each with the same bet.
  var BALLS = [1, 5, 10, 20];
  // A bet on one ball is a whole number of tens of dollars, so a multiplier
  // with one decimal always pays whole dollars.
  var BET_UNIT = 10;
  var MAX_BET = 5000;

  // What each slot pays, as a multiple of the bet, from the edge slot to the
  // centre one; the other half of the board mirrors it. Every board returns
  // about 97%; the risk spreads the same return from many small pays to a
  // few large ones. returnFor() gives each return exactly.
  var HALVES = {
    8: {
      low: [6, 1.4, 1.2, 1, 0.5],
      medium: [16, 3, 1.3, 0.6, 0.4],
      high: [32, 4, 1.3, 0.3, 0.2]
    },
    12: {
      low: [12, 3, 1.6, 1.2, 1.1, 1, 0.5],
      medium: [40, 11, 4, 2, 1, 0.6, 0.3],
      high: [240, 30, 7, 1.6, 0.5, 0.3, 0.2]
    },
    16: {
      low: [16, 4, 2, 1.5, 1.3, 1.1, 1.1, 1, 0.5],
      medium: [260, 50, 14, 5, 2.4, 1.4, 0.8, 0.6, 0.4],
      high: [1000, 190, 40, 10, 3, 1, 0.5, 0.2, 0.2]
    }
  };

  function isRows(rows) { return ROWS.indexOf(rows) !== -1; }
  function isRisk(risk) { return RISKS.indexOf(risk) !== -1; }

  // The multipliers of every slot of a board, left to right.
  function pays(rows, risk) {
    var half = HALVES[rows][risk];
    return half.concat(half.slice(0, -1).reverse());
  }

  // The same in tenths, the unit every payout is counted in.
  function tenths(rows, risk) {
    return pays(rows, risk).map(function (multiplier) { return Math.round(multiplier * 10); });
  }

  /* ---------------- Randomness and the path ---------------- */
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

  // A ball's way down: at every row it bounces left ("L") or right ("R"),
  // each with an even chance.
  function drop(rows, source) {
    var path = "";
    for (var row = 0; row < rows; row++) path += randomInt(2, source) ? "R" : "L";
    return path;
  }

  function isPath(path, rows) {
    return typeof path === "string" && path.length === rows && /^[LR]*$/.test(path);
  }

  // The slot a path ends in, 0 at the left edge to rows at the right: one
  // slot to the right for every bounce to the right.
  function slotOf(path) {
    return path.split("").filter(function (step) { return step === "R"; }).length;
  }

  /* ---------------- Bets and settlement ---------------- */
  // A bet on one ball: a whole multiple of the unit within the limit, or 0.
  function normalizeBet(value) {
    value = Number(value);
    return Number.isSafeInteger(value) && value > 0 && value % BET_UNIT === 0 && value <= MAX_BET ? value : 0;
  }

  // What one ball pays, stake included, in whole dollars.
  function payout(bet, rows, risk, path) {
    return bet * tenths(rows, risk)[slotOf(path)] / 10;
  }

  // Everything a round settles to: every ball's slot, multiplier and payout,
  // the stake of all the balls, what came back and the net.
  function settle(bet, rows, risk, paths) {
    var balls = paths.map(function (path) {
      var slot = slotOf(path);
      return { path: path, slot: slot, multiplier: pays(rows, risk)[slot], returned: payout(bet, rows, risk, path) };
    });
    var stake = bet * paths.length;
    var returned = balls.reduce(function (sum, ball) { return sum + ball.returned; }, 0);
    return { balls: balls, stake: stake, returned: returned, net: returned - stake };
  }

  /* ---------------- The return ---------------- */
  // Ways down to each slot: the binomial coefficients of the row count.
  function waysTo(rows) {
    var ways = [1];
    for (var k = 1; k <= rows; k++) ways.push(ways[k - 1] * (rows - k + 1) / k);
    return ways;
  }

  // The exact return of a board as a fraction of the 2^rows paths, in tenths:
  // { tenths, paths }, the long-run return being tenths / 10 / paths.
  function exactReturn(rows, risk) {
    var ways = waysTo(rows), pay = tenths(rows, risk);
    var sum = 0;
    for (var slot = 0; slot <= rows; slot++) sum += ways[slot] * pay[slot];
    return { tenths: sum, paths: Math.pow(2, rows) };
  }

  function returnFor(rows, risk) {
    var exact = exactReturn(rows, risk);
    return exact.tenths / 10 / exact.paths;
  }

  return {
    ROWS: ROWS,
    RISKS: RISKS,
    BALLS: BALLS,
    BET_UNIT: BET_UNIT,
    MAX_BET: MAX_BET,
    HALVES: HALVES,
    isRows: isRows,
    isRisk: isRisk,
    pays: pays,
    tenths: tenths,
    randomInt: randomInt,
    drop: drop,
    isPath: isPath,
    slotOf: slotOf,
    normalizeBet: normalizeBet,
    payout: payout,
    settle: settle,
    waysTo: waysTo,
    exactReturn: exactReturn,
    returnFor: returnFor
  };
});
