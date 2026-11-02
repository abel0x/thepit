/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 21 side bets
   Pure and dependency-free. Perfect Pairs is judged on the player's
   first two cards, 21+3 on those two and the dealer's up-card, both the
   moment the opening cards are out. The pays, the outcomes and the exact
   odds off the top of a full shoe, covered by tests/blackjack/sidebets.test.js.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SideBets = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // "pairs" is Perfect Pairs, "trio" is 21+3.
  var BETS = ["pairs", "trio"];
  // A shoe of fewer decks makes the pairs too rare to offer at these pays.
  var MIN_DECKS = 6;

  // What each outcome pays to one, the stake returned besides.
  var PAYS = {
    pairs: { perfect: 25, coloured: 12, mixed: 6 },
    trio: { suitedTrips: 100, straightFlush: 40, trips: 30, straight: 10, flush: 5 }
  };
  // The outcomes of each bet, best first.
  var OUTCOMES = {
    pairs: ["perfect", "coloured", "mixed"],
    trio: ["suitedTrips", "straightFlush", "trips", "straight", "flush"]
  };

  var RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  var SUITS = ["♠", "♥", "♦", "♣"];
  var RED = { "♥": true, "♦": true };

  function offered(decks) {
    return decks >= MIN_DECKS;
  }

  /* ---------------- Outcomes ---------------- */
  // Perfect Pairs: the same card twice, the same rank in the same colour,
  // or the same rank in both colours. Ten, Jack, Queen and King are
  // different ranks here.
  function pairsOutcome(first, second) {
    if (first.rank !== second.rank) return null;
    if (first.suit === second.suit) return "perfect";
    return !!RED[first.suit] === !!RED[second.suit] ? "coloured" : "mixed";
  }

  // 21+3: the three cards as a poker hand. An ace runs high (Q K A) or low
  // (A 2 3), never round the corner (K A 2).
  function trioOutcome(first, second, third) {
    var cards = [first, second, third];
    var order = cards.map(function (c) { return RANKS.indexOf(c.rank); }).sort(function (a, b) { return a - b; });
    var flush = first.suit === second.suit && second.suit === third.suit;
    var trips = order[0] === order[2];
    if (trips) return flush ? "suitedTrips" : "trips";
    var distinct = order[0] !== order[1] && order[1] !== order[2];
    var straight = distinct && (order[2] - order[0] === 2 || (order[0] === 0 && order[1] === 11 && order[2] === 12));
    if (straight) return flush ? "straightFlush" : "straight";
    return flush ? "flush" : null;
  }

  function outcomeOf(bet, player, up) {
    return bet === "pairs" ? pairsOutcome(player[0], player[1]) : trioOutcome(player[0], player[1], up);
  }

  /* ---------------- Stakes ---------------- */
  function wholeStake(value) {
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  }

  // The side bets as saved and staked: { pairs, trio } in whole dollars,
  // a bet not placed as 0.
  function normalizeStakes(value) {
    value = value && typeof value === "object" ? value : {};
    return { pairs: wholeStake(value.pairs), trio: wholeStake(value.trio) };
  }

  function totalStake(stakes) {
    return stakes.pairs + stakes.trio;
  }

  /* ---------------- Settlement ---------------- */
  // Settles both side bets on the player's first two cards and the dealer's
  // up-card. Each line: { bet, stake, outcome, returned }, returned being
  // the stake and its pay together, 0 for a loss. Bets not placed are left
  // out.
  function settle(stakes, player, up) {
    stakes = normalizeStakes(stakes);
    var lines = [];
    var returned = 0;
    BETS.forEach(function (bet) {
      var stake = stakes[bet];
      if (!stake) return;
      var outcome = outcomeOf(bet, player, up);
      var paid = outcome ? stake * (PAYS[bet][outcome] + 1) : 0;
      returned += paid;
      lines.push({ bet: bet, stake: stake, outcome: outcome, returned: paid });
    });
    return { lines: lines, stake: totalStake(stakes), returned: returned };
  }

  // The most a settlement can return for these stakes: a check on saved
  // rounds.
  function maxReturn(stakes) {
    stakes = normalizeStakes(stakes);
    return stakes.pairs * (PAYS.pairs.perfect + 1) + stakes.trio * (PAYS.trio.suitedTrips + 1);
  }

  /* ---------------- Exact odds ---------------- */
  // The chance of every outcome off the top of a full shoe of this many
  // decks, as { outcome: [ways, total] } over ordered draws, every card of
  // the shoe a separate card.
  function outcomeWays(bet, decks) {
    var kinds = [];
    SUITS.forEach(function (suit) { RANKS.forEach(function (rank) { kinds.push({ rank: rank, suit: suit }); }); });
    var size = kinds.length * decks;
    var ways = {};
    var total = 0;
    function count(outcome, n) {
      total += n;
      if (outcome) ways[outcome] = (ways[outcome] || 0) + n;
    }
    kinds.forEach(function (a, i) {
      kinds.forEach(function (b, j) {
        var two = decks * (decks - (i === j ? 1 : 0));
        if (bet === "pairs") { count(pairsOutcome(a, b), two); return; }
        kinds.forEach(function (c, k) {
          var left = decks - (k === i ? 1 : 0) - (k === j ? 1 : 0);
          if (left > 0) count(trioOutcome(a, b, c), two * left);
        });
      });
    });
    var draws = bet === "pairs" ? size * (size - 1) : size * (size - 1) * (size - 2);
    if (total !== draws) throw new Error("Lost count of the draws");
    var result = {};
    OUTCOMES[bet].forEach(function (outcome) { result[outcome] = [ways[outcome] || 0, draws]; });
    return result;
  }

  // The house edge of a side bet in percent off the top of the shoe.
  function houseEdge(bet, decks) {
    var ways = outcomeWays(bet, decks);
    var expected = -1;
    OUTCOMES[bet].forEach(function (outcome) {
      expected += ways[outcome][0] / ways[outcome][1] * (PAYS[bet][outcome] + 1);
    });
    return -expected * 100;
  }

  return {
    BETS: BETS,
    MIN_DECKS: MIN_DECKS,
    PAYS: PAYS,
    OUTCOMES: OUTCOMES,
    offered: offered,
    pairsOutcome: pairsOutcome,
    trioOutcome: trioOutcome,
    outcomeOf: outcomeOf,
    normalizeStakes: normalizeStakes,
    totalStake: totalStake,
    settle: settle,
    maxReturn: maxReturn,
    outcomeWays: outcomeWays,
    houseEdge: houseEdge
  };
});
