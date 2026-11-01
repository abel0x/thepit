/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Keno 80 — pure keno engine
   Eighty numbers, one to ten of them marked by the player, twenty
   drawn by the machine, and a pay table for every count of marks.
   The return of each count follows exactly from the hypergeometric
   odds of the draw. No DOM, storage, network, or third-party
   dependencies.
   Exposed as window.KenoEngine and CommonJS for tests.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory(root && root.crypto);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.KenoEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (cryptoSource) {
  "use strict";

  var UINT32_RANGE = 0x100000000;
  var NUMBERS = 80;
  var DRAWN = 20;
  var MIN_SPOTS = 1;
  var MAX_SPOTS = 10;

  // What a game returns, for every dollar bet, by the number of spots marked
  // and the number of them caught. Wins include the bet: 15 for 1.
  var PAYS = {
    1: { 1: 3 },
    2: { 2: 15 },
    3: { 2: 2, 3: 47 },
    4: { 2: 2, 3: 5, 4: 91 },
    5: { 3: 3, 4: 12, 5: 810 },
    6: { 3: 1, 4: 9, 5: 97, 6: 1800 },
    7: { 3: 1, 4: 4, 5: 20, 6: 300, 7: 6000 },
    8: { 4: 2, 5: 15, 6: 118, 7: 1000, 8: 10000 },
    9: { 4: 1, 5: 6, 6: 44, 7: 350, 8: 4500, 9: 10000 },
    10: { 0: 2, 5: 3, 6: 24, 7: 145, 8: 1000, 9: 5000, 10: 10000 }
  };

  // The bet on a game is chosen with a chip.
  var BETS = [1, 5, 10, 25, 50, 100];

  /* ---------------- Randomness ---------------- */
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

  // `count` different numbers from 1 to 80, in the order they come out: the
  // first steps of a Fisher–Yates shuffle of the eighty balls.
  function pickNumbers(count, source) {
    var balls = [];
    for (var n = 1; n <= NUMBERS; n++) balls.push(n);
    for (var i = 0; i < count; i++) {
      var j = i + randomInt(NUMBERS - i, source);
      var swap = balls[i];
      balls[i] = balls[j];
      balls[j] = swap;
    }
    return balls.slice(0, count);
  }

  // The twenty balls of a game, in the order they are drawn.
  function draw(source) {
    return pickNumbers(DRAWN, source);
  }

  // Marks chosen at random, lowest first, for a quick pick.
  function quickPick(count, source) {
    return pickNumbers(count, source).sort(function (a, b) { return a - b; });
  }

  function isNumber(value) {
    return Number.isInteger(value) && value >= 1 && value <= NUMBERS;
  }

  function distinct(list) {
    return new Set(list).size === list.length;
  }

  // Marks a ticket can hold: one to ten different numbers from 1 to 80.
  function isPicks(picks) {
    return Array.isArray(picks) && picks.length >= MIN_SPOTS && picks.length <= MAX_SPOTS && picks.every(isNumber) && distinct(picks);
  }

  function isDraw(balls) {
    return Array.isArray(balls) && balls.length === DRAWN && balls.every(isNumber) && distinct(balls);
  }

  function isBet(value) {
    return BETS.indexOf(value) !== -1;
  }

  /* ---------------- Pays ---------------- */
  // The marks the draw caught, in the order they were drawn.
  function catches(picks, balls) {
    return balls.filter(function (ball) { return picks.indexOf(ball) !== -1; });
  }

  // What one dollar returns with `spots` marked and `hits` of them caught.
  function payFor(spots, hits) {
    return (PAYS[spots] && PAYS[spots][hits]) || 0;
  }

  // The whole result of a game.
  function settle(picks, balls, bet) {
    var hit = catches(picks, balls);
    var times = payFor(picks.length, hit.length);
    var returned = times * bet;
    return { spots: picks.length, hits: hit.length, caught: hit, times: times, stake: bet, returned: returned, net: returned - bet };
  }

  /* ---------------- The return ---------------- */
  function binomial(n, k) {
    if (k < 0 || k > n) return 0;
    var result = 1;
    for (var i = 1; i <= k; i++) result = result * (n - k + i) / i;
    return Math.round(result);
  }

  // The chance that `hits` of `spots` marks are among the twenty drawn.
  function hitChance(spots, hits) {
    return binomial(spots, hits) * binomial(NUMBERS - spots, DRAWN - hits) / binomial(NUMBERS, DRAWN);
  }

  // The exact long-run return of a ticket with `spots` marks.
  function returnFor(spots) {
    var total = 0;
    for (var hits = 0; hits <= spots; hits++) total += hitChance(spots, hits) * payFor(spots, hits);
    return total;
  }

  return {
    NUMBERS: NUMBERS,
    DRAWN: DRAWN,
    MIN_SPOTS: MIN_SPOTS,
    MAX_SPOTS: MAX_SPOTS,
    PAYS: PAYS,
    BETS: BETS,
    randomInt: randomInt,
    draw: draw,
    quickPick: quickPick,
    isNumber: isNumber,
    isPicks: isPicks,
    isDraw: isDraw,
    isBet: isBet,
    catches: catches,
    payFor: payFor,
    settle: settle,
    binomial: binomial,
    hitChance: hitChance,
    returnFor: returnFor
  };
});
