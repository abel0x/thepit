/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 3 — pure Three Card Poker engine
   The deck, the ranking of three-card hands, the dealer's qualifier,
   the Ante, Play, Ante Bonus and Pair Plus settlements under either Pair
   Plus pay table. No DOM,
   storage, network, or third-party dependencies.
   Exposed as window.ThreeCardEngine and CommonJS for tests.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory(root && root.crypto);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ThreeCardEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (cryptoSource) {
  "use strict";

  var RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  var SUITS = ["♠", "♥", "♦", "♣"];
  var SUIT_CODES = { "♠": "S", "♥": "H", "♦": "D", "♣": "C" };
  var UINT32_RANGE = 0x100000000;

  // The bets a player places before the deal; the Play bet is made after
  // seeing the cards and always equals the Ante.
  var BETS = ["pairPlus", "ante"];
  // Table maximum for each bet; the minimum is the smallest chip.
  var LIMITS = { ante: 2500, pairPlus: 500 };

  // Three-card hands, weakest first. With three cards a straight is rarer
  // than a flush, so it ranks above it.
  var CATEGORIES = ["high", "pair", "flush", "straight", "trips", "straightFlush"];
  // Pair Plus pays on the player's hand alone, whatever the dealer holds.
  // The table offers two pay tables; they differ only in the flush.
  var PAY_TABLES = ["standard", "lowFlush"];
  var PAIR_PLUS = {
    standard: { straightFlush: 40, trips: 30, straight: 6, flush: 4, pair: 1 },
    lowFlush: { straightFlush: 40, trips: 30, straight: 6, flush: 3, pair: 1 }
  };
  // The Ante Bonus pays a hand that is played, whatever the dealer holds.
  var ANTE_BONUS = { straightFlush: 5, trips: 4, straight: 1 };

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

  // 2 to 14, the ace high.
  function rankValue(rank) {
    return RANKS.indexOf(rank) + 2;
  }

  /* ---------------- Randomness and the deck ---------------- */
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

  // Deals one card at a time, the player first: player, dealer, player,
  // dealer, player, dealer.
  function deal(draw) {
    var player = [], dealer = [];
    for (var i = 0; i < 3; i++) {
      player.push(draw());
      dealer.push(draw());
    }
    return { player: player, dealer: dealer };
  }

  // Two hands of three cards that could come from one deck.
  function isLegalDeal(player, dealer) {
    if (!Array.isArray(player) || !Array.isArray(dealer) || player.length !== 3 || dealer.length !== 3) return false;
    var seen = {};
    return player.concat(dealer).every(function (c) {
      if (!c || seen[c.id]) return false;
      seen[c.id] = true;
      return true;
    });
  }

  /* ---------------- Hands ---------------- */
  // Ranks a hand. The score orders every hand: a higher score wins and equal
  // scores tie, as suits never break a tie. ranks lists the deciding cards,
  // most important first (a pair before its kicker, a straight by its top).
  function evaluate(cards) {
    var values = cards.map(function (c) { return rankValue(c.rank); }).sort(function (a, b) { return b - a; });
    var flush = cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit;
    var wheel = values[0] === 14 && values[1] === 3 && values[2] === 2;
    var run = values[0] - values[1] === 1 && values[1] - values[2] === 1;
    var straight = run || wheel;
    var category, ranks;
    if (values[0] === values[2]) {
      category = "trips"; ranks = [values[0]];
    } else if (straight) {
      category = flush ? "straightFlush" : "straight";
      // A-2-3 is the lowest straight; its top card is the three.
      ranks = [wheel ? 3 : values[0]];
    } else if (flush) {
      category = "flush"; ranks = values;
    } else if (values[0] === values[1] || values[1] === values[2]) {
      category = "pair"; ranks = [values[1], values[0] === values[1] ? values[2] : values[0]];
    } else {
      category = "high"; ranks = values;
    }
    return { category: category, ranks: ranks, high: values[0], score: scoreOf(category, ranks) };
  }

  // Hands compare by category, then by their deciding ranks in order.
  function scoreOf(category, ranks) {
    var padded = ranks.concat([0, 0, 0]).slice(0, 3);
    return ((CATEGORIES.indexOf(category) * 15 + padded[0]) * 15 + padded[1]) * 15 + padded[2];
  }

  // The category and deciding ranks a score was made from, or null for a
  // number no hand scores (the best-hand statistic is kept as a score).
  function fromScore(score) {
    score = Number(score);
    if (!Number.isSafeInteger(score) || score < 0) return null;
    var ranks = [Math.floor(score / 225) % 15, Math.floor(score / 15) % 15, score % 15];
    var category = CATEGORIES[Math.floor(score / 3375)];
    if (!category || !(ranks[0] >= 2)) return null;
    var count = { high: 3, flush: 3, pair: 2 }[category] || 1;
    ranks = ranks.slice(0, count);
    if (ranks.some(function (rank) { return rank < 2 || rank > 14; })) return null;
    return { category: category, ranks: ranks, score: score };
  }

  // The dealer plays only with queen high or better; Q-3-2 is the weakest
  // such hand.
  var QUALIFY_SCORE = scoreOf("high", [12, 3, 2]);
  // The player's best strategy: play queen-six-four or better, fold below.
  var PLAY_SCORE = scoreOf("high", [12, 6, 4]);

  function qualifies(hand) {
    return hand.score >= QUALIFY_SCORE;
  }

  function shouldPlay(hand) {
    return hand.score >= PLAY_SCORE;
  }

  // 1 when a beats b, -1 when b beats a, 0 for a tie.
  function compare(a, b) {
    return a.score > b.score ? 1 : a.score < b.score ? -1 : 0;
  }

  /* ---------------- Settlement ---------------- */
  function wholeAmount(value) {
    value = Number(value);
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  }

  // Keeps only real bets with whole, positive amounts, in table order.
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

  // The Pair Plus pays of a pay table; an unknown name gets the standard one.
  function pairPlusPays(payTable) {
    return PAIR_PLUS[PAY_TABLES.indexOf(payTable) !== -1 ? payTable : "standard"];
  }

  // Everything a hand settles to. decision is "play" or "fold"; payTable
  // names the Pair Plus pay table the hand was dealt under. Each line
  // is one bet: its stake and the whole dollars it returns, stake included.
  // The Ante Bonus has no stake of its own; it is paid on the Ante.
  function settle(bets, player, dealer, decision, payTable) {
    bets = normalizeBets(bets);
    var ante = bets.ante || 0;
    var pairPlus = bets.pairPlus || 0;
    var mine = evaluate(player), theirs = evaluate(dealer);
    var played = decision === "play";
    var qualified = qualifies(theirs);
    var versus = compare(mine, theirs);
    var lines = [];

    if (pairPlus) {
      // Folding gives up the Pair Plus with the Ante.
      var pairPay = played ? pairPlusPays(payTable)[mine.category] || 0 : 0;
      lines.push({ key: "pairPlus", amount: pairPlus, returned: pairPay ? pairPlus * (pairPay + 1) : 0 });
    }
    if (ante) {
      var anteReturn, playReturn;
      if (!played) { anteReturn = 0; playReturn = 0; }
      else if (!qualified) { anteReturn = ante * 2; playReturn = ante; }
      else if (versus > 0) { anteReturn = ante * 2; playReturn = ante * 2; }
      else if (versus < 0) { anteReturn = 0; playReturn = 0; }
      else { anteReturn = ante; playReturn = ante; }
      lines.push({ key: "ante", amount: ante, returned: anteReturn });
      if (played) {
        lines.push({ key: "play", amount: ante, returned: playReturn });
        var bonus = ANTE_BONUS[mine.category] || 0;
        if (bonus) lines.push({ key: "anteBonus", amount: 0, returned: ante * bonus });
      }
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
      played: played,
      qualified: qualified,
      // Who holds the better hand, when the hands were compared.
      outcome: !played ? "fold" : !qualified ? "noQualify" : versus > 0 ? "win" : versus < 0 ? "lose" : "tie"
    };
  }

  return {
    RANKS: RANKS,
    SUITS: SUITS,
    BETS: BETS,
    LIMITS: LIMITS,
    CATEGORIES: CATEGORIES,
    PAY_TABLES: PAY_TABLES,
    PAIR_PLUS: PAIR_PLUS,
    ANTE_BONUS: ANTE_BONUS,
    QUALIFY_SCORE: QUALIFY_SCORE,
    PLAY_SCORE: PLAY_SCORE,
    card: card,
    code: code,
    fromCode: fromCode,
    rankValue: rankValue,
    randomInt: randomInt,
    buildDeck: buildDeck,
    newDeck: newDeck,
    deal: deal,
    isLegalDeal: isLegalDeal,
    evaluate: evaluate,
    scoreOf: scoreOf,
    fromScore: fromScore,
    qualifies: qualifies,
    shouldPlay: shouldPlay,
    compare: compare,
    pairPlusPays: pairPlusPays,
    wholeAmount: wholeAmount,
    normalizeBets: normalizeBets,
    totalStake: totalStake,
    settle: settle
  };
});
