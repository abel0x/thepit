/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/videopoker/js/engine.js");

// "AS KS QS JS 10S" → five cards.
function hand(text) {
  return text.split(" ").map(function (code) {
    var c = Engine.fromCode(code);
    assert.ok(c, code);
    return c;
  });
}

function category(text) {
  return Engine.evaluate(hand(text)).category;
}

function heldCodes(text, payTable, coins) {
  var cards = hand(text);
  var best = Engine.bestHold(cards, payTable || "nineSix", coins || 5);
  return cards.filter(function (c, i) { return best.held[i]; }).map(Engine.code).join(" ");
}

/* ---------------- Every hand and every deal ----------------
   Each set of up to five cards gets a number (the combinatorial number
   system), and for each pay table T[set] adds up what every five-card
   hand containing that set pays. The value of a hold then follows by
   inclusion and exclusion over the cards let go:
   value(hold) = Σ over sets S from hold to the whole deal of (−1)^|S \ hold| · T[S],
   divided by the number of draws. */
var C = [];
for (var n = 0; n <= 52; n++) {
  C.push([]);
  for (var k = 0; k <= 6; k++) C[n].push(Engine.binomial(n, k));
}
var OFFSET = [0];
for (k = 1; k <= 6; k++) OFFSET.push(OFFSET[k - 1] + C[52][k - 1]);

// The numbers of the 32 subsets of five cards given in increasing order.
var subset = new Int32Array(32);
function numberSubsets(cards) {
  subset[0] = 0;
  for (var mask = 1; mask < 32; mask++) {
    var top = 31 - Math.clz32(mask), rest = mask & ~(1 << top), size = 0;
    for (var bits = mask; bits; bits &= bits - 1) size++;
    subset[mask] = (rest ? subset[rest] - OFFSET[size - 1] : 0) + C[cards[top]][size] + OFFSET[size];
  }
}

// Five card numbers in increasing order → category index.
var rankCount = new Int8Array(13);
function categoryIndex(cards) {
  rankCount.fill(0);
  var suits = [0, 0, 0, 0], distinct = 0, squares = 0, pairs = 0, ranks = 0;
  cards.forEach(function (index) {
    var r = index % 13, c = rankCount[r];
    if (c === 0) { distinct++; ranks |= 1 << r; }
    if (c === 1) pairs |= 1 << r;
    squares += 2 * c + 1;
    rankCount[r] = c + 1;
    suits[(index - r) / 13]++;
  });
  return Engine.categoryOf(distinct, squares, pairs, ranks, suits.indexOf(5) !== -1);
}

function eachHand(visit) {
  var h = [0, 0, 0, 0, 0];
  for (h[0] = 0; h[0] < 52; h[0]++)
    for (h[1] = h[0] + 1; h[1] < 52; h[1]++)
      for (h[2] = h[1] + 1; h[2] < 52; h[2]++)
        for (h[3] = h[2] + 1; h[3] < 52; h[3]++)
          for (h[4] = h[3] + 1; h[4] < 52; h[4]++) visit(h);
}

var GAMES = [["nineSix", 5], ["eightFive", 5], ["nineSix", 1]];
var PAY = GAMES.map(function (game) {
  return Engine.CATEGORIES.map(function (name) { return Engine.payPerCoin(name, game[0], game[1]); });
});
var TOTALS = GAMES.map(function () { return new Float64Array(OFFSET[6]); });
var COUNTS = new Array(Engine.CATEGORIES.length).fill(0);
eachHand(function (h) {
  var c = categoryIndex(h);
  COUNTS[c]++;
  numberSubsets(h);
  GAMES.forEach(function (game, g) {
    var pay = PAY[g][c];
    if (pay) for (var mask = 0; mask < 32; mask++) TOTALS[g][subset[mask]] += pay;
  });
});

var SIZE = new Int8Array(32);
for (var m = 0; m < 32; m++) for (var b = m; b; b &= b - 1) SIZE[m]++;

// The total returned per coin by each hold of a deal, over all its draws.
var values = new Float64Array(32);
function holdTotals(sorted, g) {
  numberSubsets(sorted);
  for (var mask = 0; mask < 32; mask++) values[mask] = TOTALS[g][subset[mask]];
  for (var bit = 1; bit < 32; bit <<= 1) {
    for (mask = 0; mask < 32; mask++) if (!(mask & bit)) values[mask] -= values[mask | bit];
  }
  return values;
}

test("every five-card hand of one deck, by the machine's categories", function () {
  var counts = {};
  Engine.CATEGORIES.forEach(function (name, i) { counts[name] = COUNTS[i]; });
  assert.deepEqual(counts, {
    nothing: 2062860, jacksOrBetter: 337920, twoPair: 123552, trips: 54912, straight: 10200,
    flush: 5108, fullHouse: 3744, quads: 624, straightFlush: 36, royalFlush: 4
  });
});

test("hands are named as the machine pays them", function () {
  assert.equal(category("AS KS QS JS 10S"), "royalFlush");
  assert.equal(category("9H KH QH JH 10H"), "straightFlush");
  assert.equal(category("AD 2D 3D 4D 5D"), "straightFlush", "the ace plays low in a wheel");
  assert.equal(category("AS 2D 3C 4H 5S"), "straight");
  assert.equal(category("QS KD AC 2H 3S"), "nothing", "no straight runs round the corner");
  assert.equal(category("7S 7D 7C 7H 2S"), "quads");
  assert.equal(category("7S 7D 7C 2H 2S"), "fullHouse");
  assert.equal(category("2C 7C 9C JC KC"), "flush");
  assert.equal(category("7S 7D 7C 2H 3S"), "trips");
  assert.equal(category("7S 7D 2C 2H 3S"), "twoPair");
  assert.deepEqual(Engine.evaluate(hand("JS JD 2C 5H 9S")), { category: "jacksOrBetter", pairRank: "J" });
  assert.deepEqual(Engine.evaluate(hand("AS AD 2C 5H 9S")), { category: "jacksOrBetter", pairRank: "A" });
  assert.equal(category("10S 10D 2C 5H 9S"), "nothing", "a pair of tens pays nothing");
});

test("the pays of both tables, and the royal flush at five coins", function () {
  assert.deepEqual(Engine.PAY_TABLES, ["nineSix", "eightFive"]);
  assert.deepEqual(Engine.PAYS.eightFive, Object.assign({}, Engine.PAYS.nineSix, { fullHouse: 8, flush: 5 }));
  assert.equal(Engine.payPerCoin("royalFlush", "nineSix", 4), 250);
  assert.equal(Engine.payPerCoin("royalFlush", "nineSix", 5), 800);
  assert.equal(Engine.payPerCoin("straightFlush", "nineSix", 5), 50);
  assert.equal(Engine.payPerCoin("fullHouse", "other", 1), 9, "an unknown table pays as 9/6");

  var royal = Engine.settle({ denomination: 1, coins: 5 }, hand("AS KS QS JS 10S"), "nineSix");
  assert.deepEqual([royal.stake, royal.returned, royal.net], [5, 4000, 3995]);
  var short = Engine.settle({ denomination: 1, coins: 4 }, hand("AS KS QS JS 10S"), "nineSix");
  assert.equal(short.returned, 1000);
  var full = Engine.settle({ denomination: 25, coins: 3 }, hand("7S 7D 7C 2H 2S"), "eightFive");
  assert.deepEqual([full.stake, full.returned], [75, 600]);
  var jacks = Engine.settle({ denomination: 5, coins: 2 }, hand("JS JD 2C 5H 9S"), "nineSix");
  assert.deepEqual([jacks.returned, jacks.net], [10, 0], "Jacks or better gives the bet back");
  var nothing = Engine.settle({ denomination: 5, coins: 2 }, hand("10S 10D 2C 5H 9S"), "nineSix");
  assert.deepEqual([nothing.returned, nothing.net], [0, -10]);
});

test("a bet is a coin the machine offers and one to five coins", function () {
  assert.deepEqual(Engine.normalizeBet({ denomination: 25, coins: 5 }), { denomination: 25, coins: 5 });
  [{ denomination: 2, coins: 1 }, { denomination: 25, coins: 6 }, { denomination: 25, coins: 0 },
    { denomination: 25, coins: 1.5 }, { denomination: "25", coins: 1 }, null].forEach(function (bet) {
    assert.equal(Engine.normalizeBet(bet), null, JSON.stringify(bet));
  });
  assert.equal(Engine.stakeOf({ denomination: 500, coins: 5 }), 2500);
});

test("the deal is the top five cards; the draw replaces the cards let go from the next five, in order", function () {
  var deck = Engine.newDeck(function () { return 0; });
  var dealt = Engine.deal(deck);
  assert.deepEqual(dealt.hand, deck.slice(0, 5));
  assert.deepEqual(dealt.draws, deck.slice(5, 10));
  assert.ok(Engine.isLegalDeal(dealt.hand, dealt.draws));
  assert.equal(Engine.isLegalDeal(hand("AS KS QS JS 10S"), hand("AS 2D 3C 4H 5S")), false);

  var final = Engine.draw(hand("AS 2D KS 3C QS"), [true, false, true, false, true], hand("JS 10S 9H 8H 7H"));
  assert.deepEqual(final.map(Engine.code), ["AS", "JS", "KS", "10S", "QS"]);
  assert.equal(Engine.isHold([true, false, true, false, true]), true);
  assert.equal(Engine.isHold([true, false, true, false]), false);
  assert.equal(Engine.isHold([1, 0, 1, 0, 1]), false);
  assert.equal(Engine.holdMask([true, false, true, false, true]), 21);
  assert.deepEqual(Engine.holdFromMask(21), [true, false, true, false, true]);
});

test("an exhaustive count of all 2,598,960 deals with the best hold gives 99.54% for 9/6 and 97.30% for 8/5", function () {
  var sums = GAMES.map(function () { return 0; });
  var deals = 0;
  eachHand(function (h) {
    deals++;
    GAMES.forEach(function (game, g) {
      var totals = holdTotals(h, g);
      var best = 0;
      for (var mask = 0; mask < 32; mask++) best = Math.max(best, totals[mask] / C[47][5 - SIZE[mask]]);
      sums[g] += best;
    });
  });
  assert.equal(deals, 2598960);
  var percent = sums.map(function (sum) { return (sum / deals * 100).toFixed(4); });
  assert.deepEqual(percent, ["99.5439", "97.2984", "98.3735"], "9/6 and 8/5 with five coins, 9/6 with one");
  assert.equal(Engine.RETURN_PERCENT.nineSix.toFixed(2), (sums[0] / deals * 100).toFixed(2));
  assert.equal(Engine.RETURN_PERCENT.eightFive.toFixed(2), (sums[1] / deals * 100).toFixed(2));
});

test("the machine's own count of every hold agrees with the exhaustive tables, value for value", function () {
  var deals = ["AS KS QS JS 9S", "JH JD 3C 7S 9D", "2C 4D 7H 9S 3H", "10H JH QH 2S 2D", "5C 6D 7H 8S KC"];
  for (var i = 0; i < 12; i++) deals.push(Engine.newDeck().slice(0, 5).map(Engine.code).join(" "));
  deals.forEach(function (text) {
    var cards = hand(text);
    // The exhaustive tables take the cards in increasing order.
    var order = cards.map(Engine.indexOf).map(function (index, position) { return { index: index, position: position }; })
      .sort(function (a, b) { return a.index - b.index; });
    GAMES.forEach(function (game, g) {
      var mine = Engine.holdValues(cards, game[0], game[1]);
      var totals = holdTotals(order.map(function (o) { return o.index; }), g);
      mine.forEach(function (value) {
        var sortedMask = 0;
        order.forEach(function (o, s) { if (value.mask & (1 << o.position)) sortedMask |= 1 << s; });
        assert.equal(value.total, totals[sortedMask], text + " " + game.join("/") + " hold " + value.mask);
        assert.equal(value.draws, C[47][5 - SIZE[value.mask]]);
      });
    });
  });
});

test("the best hold of textbook hands", function () {
  assert.equal(heldCodes("AS KS QS JS 10S"), "AS KS QS JS 10S", "a royal flush stands");
  assert.equal(heldCodes("AS KS QS JS 9S"), "AS KS QS JS", "four to a royal break a flush");
  assert.equal(heldCodes("AS KS QS JS 9S", "nineSix", 1), "AS KS QS JS", "even at 250 a coin");
  assert.equal(heldCodes("JH JD 3C 7S 9D"), "JH JD");
  assert.equal(heldCodes("8S 8D 5C 5H KD"), "8S 8D 5C 5H", "two pair draw one");
  assert.equal(heldCodes("7S 7D 7C 2H KS"), "7S 7D 7C");
  assert.equal(heldCodes("4S 4D 9C KH 2S"), "4S 4D", "a low pair beats a lone high card");
  assert.equal(heldCodes("2C 7C 9C JC KC"), "2C 7C 9C JC KC", "a flush stands");
  assert.equal(heldCodes("2C 4D 7H 9S 3H"), "", "nothing worth keeping: five new cards");
  var best = Engine.bestHold(hand("AS KS QS JS 9S"), "nineSix", 5);
  assert.equal(best.mask, 15);
  assert.ok(best.value > 18 && best.value < 19, String(best.value));
});
