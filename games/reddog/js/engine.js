/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 13 — pure Red Dog engine
   The eight-deck shoe, the spread between the first two cards, the
   Raise, the settlement of the Ante and the Raise, and the exact return
   of the game. No DOM, storage, network, or third-party dependencies.
   Exposed as window.RedDogEngine and CommonJS for tests.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory(root && root.crypto);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RedDogEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (cryptoSource) {
  "use strict";

  var RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  var SUITS = ["♠", "♥", "♦", "♣"];
  var SUIT_CODES = { "♠": "S", "♥": "H", "♦": "D", "♣": "C" };
  var UINT32_RANGE = 0x100000000;

  // Eight decks, shuffled together for every hand.
  var DECKS = 8;
  // The Ante is the only bet placed before the deal; the Raise, made after
  // seeing the spread, always equals it.
  var BETS = ["ante"];
  var DECISIONS = ["raise", "call"];
  // Table maximum for the Ante; the minimum is the smallest chip.
  var LIMITS = { ante: 2500 };

  // A card that falls between the first two wins at these odds, by the
  // spread: the number of ranks strictly between them. A spread of 4 to 11
  // pays even money.
  var SPREAD_PAYS = { 1: 5, 2: 4, 3: 2, 4: 1 };
  var MAX_SPREAD = 11;
  // A pair that the third card makes three of a kind.
  var TRIPS_PAY = 11;
  // The Raise is worth making only when the third card is more likely to
  // fall between than not, which from eight decks starts at a spread of 7.
  var RAISE_FROM = 7;

  /* ---------------- Cards ---------------- */
  function colorOf(suit) {
    return suit === "♥" || suit === "♦" ? "red" : "black";
  }

  function card(rank, suit) {
    return { rank: rank, suit: suit, color: colorOf(suit), id: rank + SUIT_CODES[suit] };
  }

  // Compact form for saving a hand: "AS", "10H", "QD".
  function code(c) {
    return c.rank + SUIT_CODES[c.suit];
  }

  function fromCode(text) {
    var match = /^(A|[2-9]|10|J|Q|K)([SHDC])$/.exec(String(text));
    if (!match) return null;
    var suit = Object.keys(SUIT_CODES).filter(function (s) { return SUIT_CODES[s] === match[2]; })[0];
    return card(match[1], suit);
  }

  // 2 to 14: the ace is always high.
  function rankValue(rank) {
    return RANKS.indexOf(rank) + 2;
  }

  /* ---------------- Randomness and the shoe ---------------- */
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

  function buildShoe() {
    var cards = [];
    for (var deck = 0; deck < DECKS; deck++) {
      SUITS.forEach(function (suit) {
        RANKS.forEach(function (rank) { cards.push(card(rank, suit)); });
      });
    }
    return cards;
  }

  // The whole shoe, shuffled again for every hand (Fisher–Yates).
  function newShoe(source) {
    var cards = buildShoe();
    for (var i = cards.length - 1; i > 0; i--) {
      var j = randomInt(i + 1, source);
      var swap = cards[i];
      cards[i] = cards[j];
      cards[j] = swap;
    }
    return cards;
  }

  // Every hand takes three cards from the top: the two that set the spread
  // and the one that decides it. All three are drawn, and saved, before the
  // first is shown, so the decision can never change the third card.
  function deal(draw) {
    return [draw(), draw(), draw()];
  }

  // Three real cards. Eight decks hold eight of every card, so any three can
  // come from the shoe.
  function isLegalDeal(cards) {
    return Array.isArray(cards) && cards.length === 3 && cards.every(function (c) {
      return !!c && RANKS.indexOf(c.rank) !== -1 && SUITS.indexOf(c.suit) !== -1;
    });
  }

  /* ---------------- The spread ---------------- */
  // What the first two cards make: a pair, two ranks in a row, or a spread
  // of 1 to 11 ranks between them.
  function classify(first, second) {
    var a = rankValue(first.rank), b = rankValue(second.rank);
    if (a === b) return { kind: "pair", spread: 0, low: a, high: a };
    var spread = Math.abs(a - b) - 1;
    return { kind: spread ? "spread" : "consecutive", spread: spread, low: Math.min(a, b), high: Math.max(a, b) };
  }

  // Only a spread waits for the player: a pair always draws its third card
  // and two ranks in a row are a push without one.
  function needsDecision(cards) {
    return classify(cards[0], cards[1]).kind === "spread";
  }

  // Strictly between the first two cards; a card of either rank is out.
  function isBetween(third, first, second) {
    var hand = classify(first, second);
    var value = rankValue(third.rank);
    return value > hand.low && value < hand.high;
  }

  // What a win on a spread pays, to 1.
  function spreadPays(spread) {
    return SPREAD_PAYS[Math.min(spread, 4)] || 0;
  }

  function shouldRaise(cards) {
    var hand = classify(cards[0], cards[1]);
    return hand.kind === "spread" && hand.spread >= RAISE_FROM;
  }

  /* ---------------- Settlement ---------------- */
  function wholeAmount(value) {
    value = Number(value);
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  }

  // Keeps only real bets with whole, positive amounts.
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

  // Everything a hand settles to. cards are the first, the second and the
  // third card; decision is "raise" or "call" for a spread and is ignored
  // otherwise. Each line is one bet: its stake and the whole dollars it
  // returns, stake included.
  //   outcome "push"   two ranks in a row, or a pair the third card misses
  //           "trips"  a pair the third card makes three of a kind: 11 to 1
  //           "win"    the third card falls between: paid by the spread
  //           "lose"   the third card is out
  function settle(bets, cards, decision) {
    bets = normalizeBets(bets);
    var ante = bets.ante || 0;
    var hand = classify(cards[0], cards[1]);
    var raised = hand.kind === "spread" && decision === "raise";
    var outcome, pays = 0;
    if (hand.kind === "consecutive") {
      outcome = "push";
    } else if (hand.kind === "pair") {
      outcome = cards[2].rank === cards[0].rank ? "trips" : "push";
      if (outcome === "trips") pays = TRIPS_PAY;
    } else if (isBetween(cards[2], cards[0], cards[1])) {
      outcome = "win";
      pays = spreadPays(hand.spread);
    } else {
      outcome = "lose";
    }
    function back(amount) { return outcome === "push" ? amount : amount * (pays ? pays + 1 : 0); }
    var lines = [{ key: "ante", amount: ante, returned: back(ante) }];
    if (raised) lines.push({ key: "raise", amount: ante, returned: back(ante) });
    lines.forEach(function (line) {
      line.result = line.returned > line.amount ? "win" : line.returned === line.amount ? "push" : "lose";
    });
    var stake = lines.reduce(function (sum, line) { return sum + line.amount; }, 0);
    var returned = lines.reduce(function (sum, line) { return sum + line.returned; }, 0);
    return {
      lines: lines,
      stake: stake,
      returned: returned,
      net: returned - stake,
      kind: hand.kind,
      spread: hand.spread,
      raised: raised,
      pays: pays,
      outcome: outcome
    };
  }

  /* ---------------- The return ---------------- */
  // The house's share of the Ante over every deal of three cards from a full
  // shoe, when the player raises every spread of raiseFrom or more (the
  // best strategy raises from RAISE_FROM; 12 never raises). Counted by rank:
  // each three ranks are weighed by the number of deals of the shoe's 416
  // cards that show them, so the weights add up to 416 × 415 × 414.
  function dealsByRank(visit) {
    var perRank = 4 * DECKS;
    RANKS.forEach(function (a) {
      RANKS.forEach(function (b) {
        RANKS.forEach(function (c) {
          var weight = perRank * (perRank - (b === a ? 1 : 0)) * (perRank - (c === a ? 1 : 0) - (c === b ? 1 : 0));
          visit([card(a, "♠"), card(b, "♥"), card(c, "♦")], weight);
        });
      });
    });
  }

  function houseEdge(raiseFrom) {
    if (raiseFrom == null) raiseFrom = RAISE_FROM;
    var net = 0, deals = 0;
    dealsByRank(function (cards, weight) {
      var hand = classify(cards[0], cards[1]);
      var decision = hand.kind === "spread" && hand.spread >= raiseFrom ? "raise" : "call";
      net += weight * settle({ ante: 1 }, cards, decision).net;
      deals += weight;
    });
    return -net / deals;
  }

  return {
    RANKS: RANKS,
    SUITS: SUITS,
    DECKS: DECKS,
    BETS: BETS,
    DECISIONS: DECISIONS,
    LIMITS: LIMITS,
    SPREAD_PAYS: SPREAD_PAYS,
    MAX_SPREAD: MAX_SPREAD,
    TRIPS_PAY: TRIPS_PAY,
    RAISE_FROM: RAISE_FROM,
    card: card,
    code: code,
    fromCode: fromCode,
    rankValue: rankValue,
    randomInt: randomInt,
    buildShoe: buildShoe,
    newShoe: newShoe,
    deal: deal,
    isLegalDeal: isLegalDeal,
    classify: classify,
    needsDecision: needsDecision,
    isBetween: isBetween,
    spreadPays: spreadPays,
    shouldRaise: shouldRaise,
    wholeAmount: wholeAmount,
    normalizeBets: normalizeBets,
    totalStake: totalStake,
    settle: settle,
    dealsByRank: dealsByRank,
    houseEdge: houseEdge
  };
});
