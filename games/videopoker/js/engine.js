/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Poker 11 — pure Jacks or Better engine
   The deck, the ranking of five-card hands, the hold and the draw, the
   pays of both pay tables and the exact value of every hold. No DOM,
   storage, network, or third-party dependencies.
   Exposed as window.VideoPokerEngine and CommonJS for tests.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory(root && root.crypto);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VideoPokerEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (cryptoSource) {
  "use strict";

  var RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  var SUITS = ["♠", "♥", "♦", "♣"];
  var SUIT_CODES = { "♠": "S", "♥": "H", "♦": "D", "♣": "C" };
  var UINT32_RANGE = 0x100000000;

  // Five cards are dealt; a bet is one to five coins of one value, and the
  // values are the chips of the machine's tray.
  var HAND_SIZE = 5;
  var MAX_COINS = 5;
  var DENOMINATIONS = [1, 5, 10, 25, 100, 500];

  // Paying hands, weakest first, after the hand that pays nothing.
  var CATEGORIES = ["nothing", "jacksOrBetter", "twoPair", "trips", "straight", "flush", "fullHouse", "quads", "straightFlush", "royalFlush"];

  // What each hand returns for every coin bet, the coin included. The two
  // pay tables differ only in the full house and the flush. A royal flush
  // pays 250 a coin, and 800 a coin when all five coins are bet.
  var PAY_TABLES = ["nineSix", "eightFive"];
  var PAYS = {
    nineSix: { nothing: 0, jacksOrBetter: 1, twoPair: 2, trips: 3, straight: 4, flush: 6, fullHouse: 9, quads: 25, straightFlush: 50, royalFlush: 250 },
    eightFive: { nothing: 0, jacksOrBetter: 1, twoPair: 2, trips: 3, straight: 4, flush: 5, fullHouse: 8, quads: 25, straightFlush: 50, royalFlush: 250 }
  };
  var ROYAL_MAX_COINS = 800;
  // The long-run return of each pay table in percent, with the best play on
  // every hand and five coins bet (an exhaustive count in the tests).
  var RETURN_PERCENT = { nineSix: 99.54, eightFive: 97.30 };

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

  // A card as a number from 0 to 51: the suit times 13 plus the rank, the
  // two as 0 and the ace as 12.
  function indexOf(c) {
    return SUITS.indexOf(c.suit) * 13 + RANKS.indexOf(c.rank);
  }

  function fromIndex(index) {
    return card(RANKS[index % 13], SUITS[Math.floor(index / 13)]);
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

  // The five cards dealt and the five that wait under them for the draw,
  // taken from the top of one shuffled deck.
  function deal(deck) {
    return { hand: deck.slice(0, HAND_SIZE), draws: deck.slice(HAND_SIZE, HAND_SIZE * 2) };
  }

  // Ten different cards: a deal and its draws could come from one deck.
  function isLegalDeal(hand, draws) {
    if (!Array.isArray(hand) || !Array.isArray(draws) || hand.length !== HAND_SIZE || draws.length !== HAND_SIZE) return false;
    var seen = {};
    return hand.concat(draws).every(function (c) {
      if (!c || seen[c.id]) return false;
      seen[c.id] = true;
      return true;
    });
  }

  // A hold as five true or false values, one for each position.
  function isHold(held) {
    return Array.isArray(held) && held.length === HAND_SIZE && held.every(function (h) { return h === true || h === false; });
  }

  // The hand after the draw: held cards stay where they are, and each card
  // let go is replaced, left to right, by the next card of the draws.
  function draw(hand, held, draws) {
    var next = 0;
    return hand.map(function (c, i) { return held[i] ? c : draws[next++]; });
  }

  // A hold as a five-bit number, position 0 as the lowest bit.
  function holdMask(held) {
    return held.reduce(function (mask, h, i) { return h ? mask | (1 << i) : mask; }, 0);
  }

  function holdFromMask(mask) {
    var held = [];
    for (var i = 0; i < HAND_SIZE; i++) held.push((mask & (1 << i)) !== 0);
    return held;
  }

  /* ---------------- Hands ---------------- */
  // Rank bits, two as bit 0 and ace as bit 12.
  var JACKS_UP = 0xF << 9;   // jack, queen, king, ace
  var ROYAL = 0x1F << 8;     // ten to ace
  var WHEEL = 0x100F;        // ace, two, three, four, five

  // For five different ranks: true when they run in a row.
  var STRAIGHT = new Uint8Array(1 << 13);
  for (var low = 0; low <= 8; low++) STRAIGHT[0x1F << low] = 1;
  STRAIGHT[WHEEL] = 1;

  // The category of five cards, from their rank counts. distinct is the
  // number of ranks, squares the sum of each rank's count squared, pairs
  // the bits of ranks held twice or more, ranks the bits of every rank
  // held and flush whether the five share a suit.
  function categoryOf(distinct, squares, pairs, ranks, flush) {
    if (distinct === 5) {
      var straight = STRAIGHT[ranks] === 1;
      if (straight && flush) return ranks === ROYAL ? 9 : 8;
      if (flush) return 5;
      return straight ? 4 : 0;
    }
    if (distinct === 4) return pairs & JACKS_UP ? 1 : 0;
    if (distinct === 3) return squares === 9 ? 2 : 3;
    return squares === 13 ? 6 : 7;
  }

  // Ranks five cards. category names the hand; pairRank is the rank of a
  // paying pair (for "Pair of Jacks"), or null.
  function evaluate(cards) {
    var counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var distinct = 0, squares = 0, pairs = 0, ranks = 0;
    cards.forEach(function (c) {
      var r = RANKS.indexOf(c.rank);
      if (counts[r] === 0) distinct++;
      if (counts[r] === 1) pairs |= 1 << r;
      squares += 2 * counts[r] + 1;
      counts[r]++;
      ranks |= 1 << r;
    });
    var flush = cards.every(function (c) { return c.suit === cards[0].suit; });
    var category = CATEGORIES[categoryOf(distinct, squares, pairs, ranks, flush)];
    var pairRank = category === "jacksOrBetter" ? RANKS[31 - Math.clz32(pairs)] : null;
    return { category: category, pairRank: pairRank };
  }

  /* ---------------- Pays ---------------- */
  function normalizePayTable(payTable) {
    return PAY_TABLES.indexOf(payTable) !== -1 ? payTable : "nineSix";
  }

  // What a hand returns for each coin with this many coins bet.
  function payPerCoin(category, payTable, coins) {
    if (category === "royalFlush" && coins === MAX_COINS) return ROYAL_MAX_COINS;
    return PAYS[normalizePayTable(payTable)][category] || 0;
  }

  function wholeAmount(value) {
    value = Number(value);
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  }

  // A bet: a coin value the machine offers and one to five coins.
  function normalizeBet(bet) {
    if (!bet || typeof bet !== "object") return null;
    if (DENOMINATIONS.indexOf(bet.denomination) === -1) return null;
    if (!Number.isSafeInteger(bet.coins) || bet.coins < 1 || bet.coins > MAX_COINS) return null;
    return { denomination: bet.denomination, coins: bet.coins };
  }

  function stakeOf(bet) {
    return bet.denomination * bet.coins;
  }

  // Everything a hand settles to: its ranking, the stake and the whole
  // dollars it returns, the stake included.
  function settle(bet, cards, payTable) {
    var hand = evaluate(cards);
    var stake = stakeOf(bet);
    var returned = bet.denomination * bet.coins * payPerCoin(hand.category, payTable, bet.coins);
    return { hand: hand, stake: stake, returned: returned, net: returned - stake };
  }

  /* ---------------- The value of every hold ---------------- */
  function binomial(n, k) {
    if (k < 0 || k > n) return 0;
    var result = 1;
    for (var i = 1; i <= k; i++) result = result * (n - k + i) / i;
    return Math.round(result);
  }

  // For each of the 32 holds of a dealt hand, how many of the possible draws
  // end in each category: counts[mask * 10 + category]. Every draw from the
  // 47 unseen cards is counted, 2,598,960 final hands in all.
  function holdCounts(hand) {
    var dealt = hand.map(indexOf);
    var unseen = [];
    for (var i = 0; i < 52; i++) if (dealt.indexOf(i) === -1) unseen.push(i);
    var counts = new Float64Array(32 * CATEGORIES.length);

    // The running shape of the cards held so far.
    var rankCount = new Int8Array(13), suitCount = new Int8Array(4);
    var distinct = 0, squares = 0, pairs = 0, ranks = 0, size = 0, base = 0;

    function add(index) {
      var r = index % 13, c = rankCount[r];
      if (c === 0) { distinct++; ranks |= 1 << r; }
      if (c === 1) pairs |= 1 << r;
      squares += 2 * c + 1;
      rankCount[r] = c + 1;
      suitCount[(index - r) / 13]++;
      size++;
    }

    function remove(index) {
      var r = index % 13, c = rankCount[r] - 1;
      rankCount[r] = c;
      if (c === 0) { distinct--; ranks &= ~(1 << r); }
      if (c === 1) pairs &= ~(1 << r);
      squares -= 2 * c + 1;
      suitCount[(index - r) / 13]--;
      size--;
    }

    // Draws the cards still missing from position start of the unseen
    // cards onward, and counts each finished hand.
    function drawFrom(start) {
      if (size === HAND_SIZE) {
        var flush = suitCount[0] === 5 || suitCount[1] === 5 || suitCount[2] === 5 || suitCount[3] === 5;
        counts[base + categoryOf(distinct, squares, pairs, ranks, flush)]++;
        return;
      }
      for (var j = start; j <= unseen.length - (HAND_SIZE - size); j++) {
        add(unseen[j]);
        drawFrom(j + 1);
        remove(unseen[j]);
      }
    }

    for (var mask = 0; mask < 32; mask++) {
      base = mask * CATEGORIES.length;
      for (var p = 0; p < HAND_SIZE; p++) if (mask & (1 << p)) add(dealt[p]);
      drawFrom(0);
      for (p = 0; p < HAND_SIZE; p++) if (mask & (1 << p)) remove(dealt[p]);
    }
    return counts;
  }

  // Every hold of a dealt hand with its exact value: the total returned per
  // coin over all of its draws, and the number of draws. The value per
  // coin is total / draws.
  function holdValues(hand, payTable, coins) {
    var counts = holdCounts(hand);
    var values = [];
    for (var mask = 0; mask < 32; mask++) {
      var total = 0;
      CATEGORIES.forEach(function (category, c) { total += counts[mask * CATEGORIES.length + c] * payPerCoin(category, payTable, coins); });
      var kept = 0;
      for (var p = 0; p < HAND_SIZE; p++) if (mask & (1 << p)) kept++;
      values.push({ mask: mask, total: total, draws: binomial(47, HAND_SIZE - kept) });
    }
    return values;
  }

  // The hold that returns the most on average. Values are compared exactly,
  // as fractions; between holds worth the same, the lower mask is taken.
  function bestHold(hand, payTable, coins) {
    var best = null;
    holdValues(hand, payTable, coins).forEach(function (value) {
      if (!best || value.total * best.draws > best.total * value.draws) best = value;
    });
    return { held: holdFromMask(best.mask), mask: best.mask, value: best.total / best.draws };
  }

  return {
    RANKS: RANKS,
    SUITS: SUITS,
    HAND_SIZE: HAND_SIZE,
    MAX_COINS: MAX_COINS,
    DENOMINATIONS: DENOMINATIONS,
    CATEGORIES: CATEGORIES,
    PAY_TABLES: PAY_TABLES,
    PAYS: PAYS,
    ROYAL_MAX_COINS: ROYAL_MAX_COINS,
    RETURN_PERCENT: RETURN_PERCENT,
    card: card,
    code: code,
    fromCode: fromCode,
    indexOf: indexOf,
    fromIndex: fromIndex,
    randomInt: randomInt,
    buildDeck: buildDeck,
    newDeck: newDeck,
    deal: deal,
    isLegalDeal: isLegalDeal,
    isHold: isHold,
    draw: draw,
    holdMask: holdMask,
    holdFromMask: holdFromMask,
    categoryOf: categoryOf,
    evaluate: evaluate,
    normalizePayTable: normalizePayTable,
    payPerCoin: payPerCoin,
    wholeAmount: wholeAmount,
    normalizeBet: normalizeBet,
    stakeOf: stakeOf,
    settle: settle,
    binomial: binomial,
    holdCounts: holdCounts,
    holdValues: holdValues,
    bestHold: bestHold
  };
});
