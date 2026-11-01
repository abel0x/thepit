/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Wheel 54 — pure Big Six wheel engine
   A money wheel of fifty-four segments: 24 of $1, 15 of $2, 7 of $5,
   4 of $10, 2 of $20, a Joker and the pit's logo. A bet on a symbol
   pays its number to one when the wheel stops on it, and the Joker
   and the logo pay 40 to 1. No DOM, storage, network, or third-party
   dependencies.
   Exposed as window.BigSixEngine and CommonJS for tests.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory(root && root.crypto);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BigSixEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (cryptoSource) {
  "use strict";

  var UINT32_RANGE = 0x100000000;

  // Every bet on the layout, by the symbol it stands on, and what it pays to one.
  var BETS = ["one", "two", "five", "ten", "twenty", "joker", "logo"];
  var PAYS = { one: 1, two: 2, five: 5, ten: 10, twenty: 20, joker: 40, logo: 40 };

  // The segments clockwise from the Joker, which starts under the pointer.
  // Each value is spread around the wheel and no two segments side by side
  // show the same symbol but the $1.
  var SEGMENTS = [
    "joker", "two", "one", "five", "one", "two", "ten", "one", "two", "one", "one", "five", "two", "twenty",
    "one", "two", "one", "one", "five", "two", "ten", "one", "one", "two", "one", "one", "five", "logo",
    "two", "one", "two", "one", "one", "ten", "five", "two", "one", "two", "one", "one", "twenty", "two",
    "five", "one", "two", "one", "one", "ten", "two", "five", "one", "two", "one", "one"
  ];

  // Table maximum for each bet, so that no bet can win more than $5,000.
  var LIMITS = { one: 5000, two: 2500, five: 1000, ten: 500, twenty: 250, joker: 125, logo: 125 };

  /* ---------------- The wheel ---------------- */
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

  // The segment the wheel stops on, every one of the 54 as likely.
  function spin(source) {
    return randomInt(SEGMENTS.length, source);
  }

  function isSegment(value) {
    return Number.isInteger(value) && value >= 0 && value < SEGMENTS.length;
  }

  function symbolAt(segment) {
    return SEGMENTS[segment];
  }

  /* ---------------- The bets ---------------- */
  function isBet(key) {
    return BETS.indexOf(key) !== -1;
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

  function maxBet(key) {
    return isBet(key) ? LIMITS[key] : 0;
  }

  // Why a bet cannot take more chips, or null when it can.
  function canAdd(key, bets) {
    if (!isBet(key)) return "unknown";
    if (((bets && bets[key]) || 0) >= maxBet(key)) return "limit";
    return null;
  }

  function isLegalLayout(bets) {
    return Object.keys(bets).every(function (key) { return bets[key] <= maxBet(key); });
  }

  /* ---------------- A spin ---------------- */
  // Everything one spin does to the bets: the bet on the symbol that comes
  // up wins its pay with its stake back, every other bet is lost.
  function resolve(bets, segment) {
    bets = normalizeBets(bets);
    var symbol = symbolAt(segment);
    var lines = Object.keys(bets).map(function (key) {
      var amount = bets[key];
      return key === symbol
        ? { key: key, amount: amount, result: "win", profit: amount * PAYS[key], returned: amount * (PAYS[key] + 1) }
        : { key: key, amount: amount, result: "lose", profit: 0, returned: 0 };
    });
    var returned = lines.reduce(function (sum, line) { return sum + line.returned; }, 0);
    var lost = lines.reduce(function (sum, line) { return sum + (line.result === "lose" ? line.amount : 0); }, 0);
    return { segment: segment, symbol: symbol, lines: lines, stake: totalStake(bets), returned: returned, lost: lost };
  }

  /* ---------------- The house edge ---------------- */
  // How many of the 54 segments show a symbol.
  function countOf(key) {
    return SEGMENTS.filter(function (symbol) { return symbol === key; }).length;
  }

  // The exact house edge of a bet, from every segment the wheel can stop on.
  function houseEdge(key) {
    var returned = 0;
    SEGMENTS.forEach(function (symbol) { if (symbol === key) returned += PAYS[key] + 1; });
    return 1 - returned / SEGMENTS.length;
  }

  return {
    BETS: BETS,
    PAYS: PAYS,
    SEGMENTS: SEGMENTS,
    LIMITS: LIMITS,
    randomInt: randomInt,
    spin: spin,
    isSegment: isSegment,
    symbolAt: symbolAt,
    isBet: isBet,
    wholeAmount: wholeAmount,
    normalizeBets: normalizeBets,
    totalStake: totalStake,
    maxBet: maxBet,
    canAdd: canAdd,
    isLegalLayout: isLegalLayout,
    resolve: resolve,
    countOf: countOf,
    houseEdge: houseEdge
  };
});
