/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Poker 11 — pure video poker engine
   The deck, the ranking of five-card hands under Jacks or Better,
   Double Bonus and Deuces Wild, the hold and the draw, the pays of every
   pay table and the exact value of every hold. No DOM, storage, network,
   or third-party dependencies.
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

  // Every hand the machine names. The first ten are the hands of Jacks or
  // Better, weakest first; the rest belong to Double Bonus (fours split by
  // rank) and Deuces Wild (where the four twos are wild). Saved statistics
  // keep a hand as its place in this list, so new hands go at the end.
  var CATEGORIES = [
    "nothing", "jacksOrBetter", "twoPair", "trips", "straight", "flush", "fullHouse", "quads", "straightFlush", "royalFlush",
    "quadsLow", "quadAces", "fiveOfAKind", "wildRoyal", "fourDeuces"
  ];
  // The same hands from weakest to strongest, for the best hand drawn.
  var STRENGTH = [
    "nothing", "jacksOrBetter", "twoPair", "trips", "straight", "flush", "fullHouse", "quads", "quadsLow", "quadAces",
    "straightFlush", "fiveOfAKind", "wildRoyal", "fourDeuces", "royalFlush"
  ];

  // The pay tables, and the game each one is played by.
  var PAY_TABLES = ["nineSix", "eightFive", "doubleBonus", "deucesWild"];
  var GAME_OF = { nineSix: "jacks", eightFive: "jacks", doubleBonus: "bonus", deucesWild: "deuces" };

  // What each hand returns for every coin bet, the coin included; a hand
  // a table does not list pays nothing. The two Jacks or Better tables
  // differ only in the full house and the flush. Double Bonus is the 9/7/5
  // table, and Deuces Wild the one known as "Not So Ugly Ducks". In every
  // game a natural royal flush pays 250 a coin, and 800 a coin when all
  // five coins are bet.
  var PAYS = {
    nineSix: { jacksOrBetter: 1, twoPair: 2, trips: 3, straight: 4, flush: 6, fullHouse: 9, quads: 25, straightFlush: 50, royalFlush: 250 },
    eightFive: { jacksOrBetter: 1, twoPair: 2, trips: 3, straight: 4, flush: 5, fullHouse: 8, quads: 25, straightFlush: 50, royalFlush: 250 },
    doubleBonus: {
      jacksOrBetter: 1, twoPair: 1, trips: 3, straight: 5, flush: 7, fullHouse: 9,
      quads: 50, quadsLow: 80, quadAces: 160, straightFlush: 50, royalFlush: 250
    },
    deucesWild: {
      trips: 1, straight: 2, flush: 3, fullHouse: 4, quads: 4, straightFlush: 10,
      fiveOfAKind: 16, wildRoyal: 25, fourDeuces: 200, royalFlush: 250
    }
  };
  // The rows of each pay table, best first, as the machine prints them.
  var PAY_ROWS = {};
  PAY_TABLES.forEach(function (table) {
    PAY_ROWS[table] = STRENGTH.filter(function (name) { return PAYS[table][name]; }).reverse();
  });
  var ROYAL_MAX_COINS = 800;
  // The long-run return of each pay table in percent, with the best play on
  // every hand and five coins bet (an exhaustive count in the tests).
  var RETURN_PERCENT = { nineSix: 99.54, eightFive: 97.30, doubleBonus: 99.11, deucesWild: 99.73 };

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
  var DEUCE = 0, ACE = 12;

  var CAT = {};
  CATEGORIES.forEach(function (name, index) { CAT[name] = index; });

  // For five different ranks: true when they run in a row.
  var STRAIGHT = new Uint8Array(1 << 13);
  // For the ranks of the cards beside the deuces in Deuces Wild: true when
  // the deuces can fill them out to a straight.
  var WILD_STRAIGHT = new Uint8Array(1 << 13);
  (function () {
    var windows = [WHEEL];
    for (var low = 0; low <= 8; low++) windows.push(0x1F << low);
    windows.forEach(function (window) { STRAIGHT[window] = 1; });
    for (var ranks = 0; ranks < 1 << 13; ranks++) {
      WILD_STRAIGHT[ranks] = windows.some(function (window) { return (ranks & ~window) === 0; }) ? 1 : 0;
    }
  })();

  // The category of five cards in Jacks or Better, from their rank counts.
  // distinct is the number of ranks, squares the sum of each rank's count
  // squared, pairs the bits of ranks held twice or more, ranks the bits of
  // every rank held and flush whether the five share a suit.
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

  /* The running shape of up to five cards: what each game needs to name
     the hand, kept up to date one card at a time, so that the count of
     every draw costs only a few steps a hand. */
  function Shape() {
    this.rankCount = new Int8Array(13);
    this.suitCount = new Int8Array(4);
    // The suits of the cards that are not deuces.
    this.naturalSuits = new Int8Array(4);
    this.size = 0;
    this.distinct = 0;
    this.squares = 0;
    this.pairs = 0;
    this.ranks = 0;
  }

  Shape.prototype.add = function (index) {
    var r = index % 13, s = (index - r) / 13, c = this.rankCount[r];
    if (c === 0) { this.distinct++; this.ranks |= 1 << r; }
    if (c === 1) this.pairs |= 1 << r;
    this.squares += 2 * c + 1;
    this.rankCount[r] = c + 1;
    this.suitCount[s]++;
    if (r !== DEUCE) this.naturalSuits[s]++;
    this.size++;
  };

  Shape.prototype.remove = function (index) {
    var r = index % 13, s = (index - r) / 13, c = this.rankCount[r] - 1;
    this.rankCount[r] = c;
    if (c === 0) { this.distinct--; this.ranks &= ~(1 << r); }
    if (c === 1) this.pairs &= ~(1 << r);
    this.squares -= 2 * c + 1;
    this.suitCount[s]--;
    if (r !== DEUCE) this.naturalSuits[s]--;
    this.size--;
  };

  function sameSuit(counts, size) {
    return counts[0] === size || counts[1] === size || counts[2] === size || counts[3] === size;
  }

  // Jacks or Better, and Double Bonus, which pays a four of a kind by its
  // rank: aces most, then twos, threes and fours, then the rest.
  function jacksCategory(shape, bonus) {
    var category = categoryOf(shape.distinct, shape.squares, shape.pairs, shape.ranks, sameSuit(shape.suitCount, 5));
    if (category !== CAT.quads || !bonus) return category;
    var counts = shape.rankCount;
    if (counts[ACE] === 4) return CAT.quadAces;
    if (counts[0] === 4 || counts[1] === 4 || counts[2] === 4) return CAT.quadsLow;
    return category;
  }

  // Deuces Wild: every two stands for whatever card makes the best hand. A
  // pair or two pair pays nothing; three of a kind is the smallest hand.
  function deucesCategory(shape) {
    var deuces = shape.rankCount[DEUCE];
    if (deuces === 0) {
      var natural = categoryOf(shape.distinct, shape.squares, shape.pairs, shape.ranks, sameSuit(shape.suitCount, 5));
      return natural <= 2 ? 0 : natural;
    }
    if (deuces === 4) return CAT.fourDeuces;
    // The cards beside the deuces: how many, how many ranks, the most of
    // any one rank, and which ranks.
    var size = 5 - deuces;
    var distinct = shape.distinct - 1;
    var squares = shape.squares - deuces * deuces;
    var most;
    if (distinct === size) most = 1;
    else if (distinct === 1) most = size;
    else if (size - distinct === 1) most = 2;
    else most = squares === 8 ? 2 : 3;   // four cards of two ranks
    var ranks = shape.ranks & ~1;
    var flush = sameSuit(shape.naturalSuits, size);
    var straight = distinct === size && WILD_STRAIGHT[ranks] === 1;

    if (flush && straight && (ranks & ~ROYAL) === 0) return CAT.wildRoyal;
    if (most + deuces >= 5) return CAT.fiveOfAKind;
    if (flush && straight) return CAT.straightFlush;
    if (most + deuces >= 4) return CAT.quads;
    if (deuces === 1 && distinct === 2 && squares === 8) return CAT.fullHouse;
    if (flush) return CAT.flush;
    if (straight) return CAT.straight;
    if (most + deuces >= 3) return CAT.trips;
    return 0;
  }

  // The category of a full shape of five cards, as a place in CATEGORIES.
  function classify(shape, game) {
    if (game === "deuces") return deucesCategory(shape);
    return jacksCategory(shape, game === "bonus");
  }

  function normalizePayTable(payTable) {
    return PAY_TABLES.indexOf(payTable) !== -1 ? payTable : "nineSix";
  }

  function gameOf(payTable) {
    return GAME_OF[normalizePayTable(payTable)];
  }

  // Ranks five cards by the game of a pay table (Jacks or Better when none
  // is given). category names the hand; pairRank is the rank of a paying
  // pair (for "Pair of Jacks"), or null.
  function evaluate(cards, payTable) {
    var shape = new Shape();
    cards.forEach(function (c) { shape.add(indexOf(c)); });
    var category = CATEGORIES[classify(shape, gameOf(payTable))];
    var pairRank = category === "jacksOrBetter" ? RANKS[31 - Math.clz32(shape.pairs)] : null;
    return { category: category, pairRank: pairRank };
  }

  // The better of two hands, by STRENGTH.
  function stronger(a, b) {
    return STRENGTH.indexOf(a) >= STRENGTH.indexOf(b) ? a : b;
  }

  /* ---------------- Pays ---------------- */
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
    var hand = evaluate(cards, payTable);
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
  // end in each category of the pay table's game:
  // counts[mask * CATEGORIES.length + category]. Every draw from the 47
  // unseen cards is counted, 2,598,960 final hands in all.
  function holdCounts(hand, payTable) {
    var game = gameOf(payTable);
    var dealt = hand.map(indexOf);
    var unseen = [];
    for (var i = 0; i < 52; i++) if (dealt.indexOf(i) === -1) unseen.push(i);
    var counts = new Float64Array(32 * CATEGORIES.length);
    var shape = new Shape();
    var base = 0;

    // Draws the cards still missing from position start of the unseen
    // cards onward, and counts each finished hand.
    function drawFrom(start) {
      if (shape.size === HAND_SIZE) {
        counts[base + classify(shape, game)]++;
        return;
      }
      for (var j = start; j <= unseen.length - (HAND_SIZE - shape.size); j++) {
        shape.add(unseen[j]);
        drawFrom(j + 1);
        shape.remove(unseen[j]);
      }
    }

    for (var mask = 0; mask < 32; mask++) {
      base = mask * CATEGORIES.length;
      for (var p = 0; p < HAND_SIZE; p++) if (mask & (1 << p)) shape.add(dealt[p]);
      drawFrom(0);
      for (p = 0; p < HAND_SIZE; p++) if (mask & (1 << p)) shape.remove(dealt[p]);
    }
    return counts;
  }

  // Every hold of a dealt hand with its exact value: the total returned per
  // coin over all of its draws, and the number of draws. The value per
  // coin is total / draws.
  function holdValues(hand, payTable, coins) {
    var counts = holdCounts(hand, payTable);
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

  // a × d is compared with b × c rather than a / b with c / d, so equal
  // values stay equal.
  function compareValues(a, b) {
    return b.total * a.draws - a.total * b.draws;
  }

  // All 32 holds, the one that returns the most first. Values are compared
  // exactly, as fractions; between holds worth the same, the lower mask
  // comes first. Each hold is marked best when no other returns more.
  function rankHolds(hand, payTable, coins) {
    var ranked = holdValues(hand, payTable, coins).sort(function (a, b) {
      return compareValues(a, b) || a.mask - b.mask;
    });
    return ranked.map(function (value) {
      return {
        mask: value.mask,
        held: holdFromMask(value.mask),
        value: value.total / value.draws,
        total: value.total,
        draws: value.draws,
        best: compareValues(value, ranked[0]) === 0
      };
    });
  }

  // The hold that returns the most on average.
  function bestHold(hand, payTable, coins) {
    var best = rankHolds(hand, payTable, coins)[0];
    return { held: best.held, mask: best.mask, value: best.value };
  }

  return {
    RANKS: RANKS,
    SUITS: SUITS,
    HAND_SIZE: HAND_SIZE,
    MAX_COINS: MAX_COINS,
    DENOMINATIONS: DENOMINATIONS,
    CATEGORIES: CATEGORIES,
    STRENGTH: STRENGTH,
    PAY_TABLES: PAY_TABLES,
    GAME_OF: GAME_OF,
    PAYS: PAYS,
    PAY_ROWS: PAY_ROWS,
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
    stronger: stronger,
    normalizePayTable: normalizePayTable,
    gameOf: gameOf,
    payPerCoin: payPerCoin,
    wholeAmount: wholeAmount,
    normalizeBet: normalizeBet,
    stakeOf: stakeOf,
    settle: settle,
    binomial: binomial,
    holdCounts: holdCounts,
    holdValues: holdValues,
    rankHolds: rankHolds,
    bestHold: bestHold
  };
});
