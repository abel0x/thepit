/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 2 — pure Casino Hold'em engine
   The deck, the ranking of poker hands from five to seven cards, the
   dealer's qualifier and the Ante, Call and AA Bonus settlements. No
   DOM, storage, network, or third-party dependencies.
   Exposed as window.HoldemEngine and CommonJS for tests.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory(root && root.crypto);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HoldemEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (cryptoSource) {
  "use strict";

  var RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  var SUITS = ["♠", "♥", "♦", "♣"];
  var SUIT_CODES = { "♠": "S", "♥": "H", "♦": "D", "♣": "C" };
  var UINT32_RANGE = 0x100000000;

  // The bets placed before the deal; the Call is made after the flop and is
  // always twice the Ante.
  var BETS = ["aaBonus", "ante"];
  var LIMITS = { ante: 1000, aaBonus: 500 };
  var CALL_TIMES = 2;

  // Poker hands, weakest first.
  var CATEGORIES = ["high", "pair", "twoPair", "trips", "straight", "flush", "fullHouse", "quads", "straightFlush", "royalFlush"];
  // What a winning Ante pays, by the player's hand; anything else pays 1 to 1.
  var ANTE_PAYS = { royalFlush: 100, straightFlush: 20, quads: 10, fullHouse: 3, flush: 2 };
  // The AA Bonus pays on the player's two cards and the flop: a pair of aces
  // or better.
  var AA_PAYS = { royalFlush: 100, straightFlush: 50, quads: 40, fullHouse: 30, flush: 20, straight: 7, trips: 7, twoPair: 7, pair: 7 };

  /* ---------------- Cards ---------------- */
  function colorOf(suit) {
    return suit === "♥" || suit === "♦" ? "red" : "black";
  }

  function card(rank, suit) {
    return { rank: rank, suit: suit, color: colorOf(suit), id: rank + SUIT_CODES[suit] };
  }

  function code(c) {
    return c.rank + SUIT_CODES[c.suit];
  }

  function fromCode(text) {
    var match = /^(A|[2-9]|10|J|Q|K)([SHDC])$/.exec(String(text));
    if (!match) return null;
    var suit = Object.keys(SUIT_CODES).filter(function (s) { return SUIT_CODES[s] === match[2]; })[0];
    return card(match[1], suit);
  }

  function rankValue(rank) {
    return RANKS.indexOf(rank) + 2;
  }

  // 2 to 14 by rank, the ace high.
  var RANK_VALUES = {};
  RANKS.forEach(function (rank) { RANK_VALUES[rank] = rankValue(rank); });

  /* ---------------- Randomness and the deck ---------------- */
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

  function buildDeck() {
    var cards = [];
    SUITS.forEach(function (suit) {
      RANKS.forEach(function (rank) { cards.push(card(rank, suit)); });
    });
    return cards;
  }

  // One deck, shuffled again for every hand (Fisher–Yates).
  function newDeck(source) {
    var cards = buildDeck();
    for (var i = cards.length - 1; i > 0; i--) {
      var j = randomInt(i + 1, source);
      var swap = cards[i];
      cards[i] = cards[j];
      cards[j] = swap;
    }
    return cards;
  }

  // Two cards to the player and two to the dealer, one at a time, then the
  // five cards of the board: the flop, the turn and the river.
  function deal(draw) {
    var player = [], dealer = [], board = [];
    for (var i = 0; i < 2; i++) {
      player.push(draw());
      dealer.push(draw());
    }
    for (var j = 0; j < 5; j++) board.push(draw());
    return { player: player, dealer: dealer, board: board };
  }

  // Nine different cards from one deck.
  function isLegalDeal(hands) {
    if (!hands || !Array.isArray(hands.player) || !Array.isArray(hands.dealer) || !Array.isArray(hands.board)) return false;
    if (hands.player.length !== 2 || hands.dealer.length !== 2 || hands.board.length !== 5) return false;
    var seen = {};
    return hands.player.concat(hands.dealer, hands.board).every(function (c) {
      if (!c || seen[c.id]) return false;
      seen[c.id] = true;
      return true;
    });
  }

  /* ---------------- Hands ---------------- */
  // Hands compare by category, then by their deciding ranks in order.
  function scoreOf(category, ranks) {
    var score = CATEGORIES.indexOf(category);
    for (var i = 0; i < 5; i++) score = score * 15 + (ranks[i] || 0);
    return score;
  }

  // Ranks exactly five cards. ranks lists the deciding cards, most important
  // first: the quads before the kicker, the pairs high then low, a straight
  // by its top card (five for A-2-3-4-5).
  function evaluate5(cards) {
    var values = [0, 0, 0, 0, 0], suit = cards[0].suit, flush = true;
    for (var i = 0; i < 5; i++) {
      var v = RANK_VALUES[cards[i].rank];
      // Insertion keeps the five values sorted high to low.
      var j = i;
      while (j > 0 && values[j - 1] < v) { values[j] = values[j - 1]; j--; }
      values[j] = v;
      if (cards[i].suit !== suit) flush = false;
    }
    // Runs of equal ranks: [how many, rank], biggest group first, then highest.
    var groups = [];
    for (var k = 0; k < 5;) {
      var end = k + 1;
      while (end < 5 && values[end] === values[k]) end++;
      groups.push([end - k, values[k]]);
      k = end;
    }
    groups.sort(function (a, b) { return b[0] - a[0] || b[1] - a[1]; });
    var byGroup = groups.map(function (g) { return g[1]; });
    var unique = groups.length === 5;
    var wheel = unique && values[0] === 14 && values[1] === 5;
    var straight = unique && (values[0] - values[4] === 4 || wheel);
    var top = wheel ? 5 : values[0];
    var most = groups[0][0], next = groups.length > 1 ? groups[1][0] : 0;
    var category, ranks;
    if (straight && flush) { category = top === 14 ? "royalFlush" : "straightFlush"; ranks = [top]; }
    else if (most === 4) { category = "quads"; ranks = byGroup; }
    else if (most === 3 && next === 2) { category = "fullHouse"; ranks = byGroup; }
    else if (flush) { category = "flush"; ranks = values; }
    else if (straight) { category = "straight"; ranks = [top]; }
    else if (most === 3) { category = "trips"; ranks = byGroup; }
    else if (most === 2 && next === 2) { category = "twoPair"; ranks = byGroup; }
    else if (most === 2) { category = "pair"; ranks = byGroup; }
    else { category = "high"; ranks = values; }
    return { category: category, ranks: ranks, score: scoreOf(category, ranks) };
  }

  // The best five cards of five to seven.
  function evaluate(cards) {
    var best = null;
    var five = [];
    (function choose(start) {
      if (five.length === 5) {
        var hand = evaluate5(five);
        if (!best || hand.score > best.score) {
          best = hand;
          best.cards = five.slice();
        }
        return;
      }
      for (var i = start; i <= cards.length - (5 - five.length); i++) {
        five.push(cards[i]);
        choose(i + 1);
        five.pop();
      }
    })(0);
    return best;
  }

  // The dealer plays with a pair of fours or better.
  function qualifies(hand) {
    var level = CATEGORIES.indexOf(hand.category);
    return level > 1 || (level === 1 && hand.ranks[0] >= 4);
  }

  // A pair of aces or better among the player's cards and the flop.
  function aaQualifies(hand) {
    var level = CATEGORIES.indexOf(hand.category);
    return level > 1 || (level === 1 && hand.ranks[0] === 14);
  }

  function compare(a, b) {
    return a.score > b.score ? 1 : a.score < b.score ? -1 : 0;
  }

  /* ---------------- Settlement ---------------- */
  function wholeAmount(value) {
    value = Number(value);
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  }

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

  // Everything a hand settles to. decision is "call" or "fold". Each line is
  // one bet: its stake and the whole dollars it returns, stake included. The
  // AA Bonus is settled on the player's cards and the flop, call or fold.
  function settle(bets, hands, decision) {
    bets = normalizeBets(bets);
    var ante = bets.ante || 0;
    var called = decision === "call";
    var flop = hands.player.concat(hands.board.slice(0, 3));
    var mine = evaluate(hands.player.concat(hands.board));
    var theirs = evaluate(hands.dealer.concat(hands.board));
    var qualified = qualifies(theirs);
    var versus = compare(mine, theirs);
    var lines = [];

    if (bets.aaBonus) {
      var aaHand = evaluate5(flop);
      var aaPay = aaQualifies(aaHand) ? AA_PAYS[aaHand.category] : 0;
      lines.push({ key: "aaBonus", amount: bets.aaBonus, returned: aaPay ? bets.aaBonus * (aaPay + 1) : 0, hand: aaHand });
    }
    if (ante) {
      var call = ante * CALL_TIMES;
      var antePay = ANTE_PAYS[mine.category] || 1;
      var anteReturn = 0, callReturn = 0;
      if (called) {
        if (!qualified) { anteReturn = ante * (antePay + 1); callReturn = call; }
        else if (versus > 0) { anteReturn = ante * (antePay + 1); callReturn = call * 2; }
        else if (versus === 0) { anteReturn = ante; callReturn = call; }
      }
      lines.push({ key: "ante", amount: ante, returned: anteReturn });
      if (called) lines.push({ key: "call", amount: call, returned: callReturn });
    }
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
      player: mine,
      dealer: theirs,
      called: called,
      qualified: qualified,
      outcome: !called ? "fold" : !qualified ? "noQualify" : versus > 0 ? "win" : versus < 0 ? "lose" : "tie"
    };
  }

  // The category and deciding ranks a score was made from, or null.
  function fromScore(score) {
    score = Number(score);
    if (!Number.isSafeInteger(score) || score < 0) return null;
    var ranks = [];
    for (var i = 0; i < 5; i++) {
      ranks.unshift(score % 15);
      score = Math.floor(score / 15);
    }
    var category = CATEGORIES[score];
    if (!category || !(ranks[0] >= 2)) return null;
    var count = { high: 5, flush: 5, pair: 4, twoPair: 3, trips: 3, fullHouse: 2, quads: 2 }[category] || 1;
    ranks = ranks.slice(0, count);
    if (ranks.some(function (rank) { return rank < 2 || rank > 14; })) return null;
    return { category: category, ranks: ranks };
  }

  return {
    RANKS: RANKS,
    SUITS: SUITS,
    BETS: BETS,
    LIMITS: LIMITS,
    CALL_TIMES: CALL_TIMES,
    CATEGORIES: CATEGORIES,
    ANTE_PAYS: ANTE_PAYS,
    AA_PAYS: AA_PAYS,
    card: card,
    code: code,
    fromCode: fromCode,
    rankValue: rankValue,
    randomInt: randomInt,
    buildDeck: buildDeck,
    newDeck: newDeck,
    deal: deal,
    isLegalDeal: isLegalDeal,
    scoreOf: scoreOf,
    evaluate5: evaluate5,
    evaluate: evaluate,
    qualifies: qualifies,
    aaQualifies: aaQualifies,
    compare: compare,
    fromScore: fromScore,
    wholeAmount: wholeAmount,
    normalizeBets: normalizeBets,
    totalStake: totalStake,
    settle: settle
  };
});
