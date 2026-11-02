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

function category(text, payTable) {
  return Engine.evaluate(hand(text), payTable).category;
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

var GAMES = [["nineSix", 5], ["eightFive", 5], ["nineSix", 1], ["doubleBonus", 5], ["deucesWild", 5]];
var PAY = GAMES.map(function (game) {
  return Engine.CATEGORIES.map(function (name) { return Engine.payPerCoin(name, game[0], game[1]); });
});
var TOTALS = GAMES.map(function () { return new Float64Array(OFFSET[6]); });
// Every hand counted by category, in Jacks or Better (by the test's own
// count of ranks) and by the engine under Double Bonus and Deuces Wild.
var COUNTS = { jacks: {}, bonus: {}, deuces: {} };
function tally(game, name) { COUNTS[game][name] = (COUNTS[game][name] || 0) + 1; }
var CAT = {};
Engine.CATEGORIES.forEach(function (name, i) { CAT[name] = i; });
eachHand(function (h) {
  var jacks = categoryIndex(h);
  var cards = h.map(Engine.fromIndex);
  var bonus = CAT[Engine.evaluate(cards, "doubleBonus").category];
  var deuces = CAT[Engine.evaluate(cards, "deucesWild").category];
  tally("jacks", Engine.CATEGORIES[jacks]);
  tally("bonus", Engine.CATEGORIES[bonus]);
  tally("deuces", Engine.CATEGORIES[deuces]);
  numberSubsets(h);
  GAMES.forEach(function (game, g) {
    var c = game[0] === "doubleBonus" ? bonus : game[0] === "deucesWild" ? deuces : jacks;
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

test("every five-card hand of one deck, by the machine's categories in each game", function () {
  var jacks = {
    nothing: 2062860, jacksOrBetter: 337920, twoPair: 123552, trips: 54912, straight: 10200,
    flush: 5108, fullHouse: 3744, quads: 624, straightFlush: 36, royalFlush: 4
  };
  assert.deepEqual(COUNTS.jacks, jacks);
  // Double Bonus splits the 624 fours by rank: 48 of aces, 144 of twos,
  // threes or fours, 432 of the rest.
  var bonus = Object.assign({}, jacks, { quads: 432, quadsLow: 144, quadAces: 48 });
  assert.deepEqual(COUNTS.bonus, bonus);
  // The published counts of a Deuces Wild deal.
  assert.deepEqual(COUNTS.deuces, {
    nothing: 2119728, trips: 355080, straight: 62232, flush: 14472, fullHouse: 12672, quads: 31552,
    straightFlush: 2068, fiveOfAKind: 624, wildRoyal: 480, fourDeuces: 48, royalFlush: 4
  });
});

/* An independent judge of Deuces Wild: every two is tried as every card of
   the deck, duplicates allowed, and the best plain hand wins. */
function plainCategory(cards) {
  var counts = {};
  cards.forEach(function (c) { counts[c.rank] = (counts[c.rank] || 0) + 1; });
  var sizes = Object.keys(counts).map(function (r) { return counts[r]; }).sort(function (a, b) { return b - a; });
  var order = cards.map(function (c) { return Engine.RANKS.indexOf(c.rank); }).sort(function (a, b) { return a - b; });
  var distinct = sizes.length === 5;
  var straight = distinct && (order[4] - order[0] === 4 || order.join() === "0,1,2,3,12");
  var flush = cards.every(function (c) { return c.suit === cards[0].suit; });
  if (sizes[0] === 5) return "fiveOfAKind";
  if (straight && flush) return order[0] === 8 ? "royalFlush" : "straightFlush";
  if (sizes[0] === 4) return "quads";
  if (sizes[0] === 3 && sizes[1] === 2) return "fullHouse";
  if (flush) return "flush";
  if (straight) return "straight";
  if (sizes[0] === 3) return "trips";
  return "nothing";
}

// Deuces Wild hands from the weakest; a full house and four of a kind pay
// the same, so the stronger is named.
var DEUCES_ORDER = ["nothing", "trips", "straight", "flush", "fullHouse", "quads", "straightFlush", "fiveOfAKind", "wildRoyal"];

function deucesJudge(cards) {
  var deuces = cards.filter(function (c) { return c.rank === "2"; }).length;
  if (deuces === 4) return "fourDeuces";
  if (deuces === 0) return plainCategory(cards);
  var others = cards.filter(function (c) { return c.rank !== "2"; });
  var deck = Engine.buildDeck();
  var best = "nothing";
  (function fill(list, left) {
    if (left === 0) {
      var name = plainCategory(list);
      if (name === "royalFlush") name = "wildRoyal";
      if (DEUCES_ORDER.indexOf(name) > DEUCES_ORDER.indexOf(best)) best = name;
      return;
    }
    deck.forEach(function (c) { fill(list.concat([c]), left - 1); });
  })(others, deuces);
  return best;
}

test("Deuces Wild names every hand as trying each two as every card would", function () {
  var deck = Engine.buildDeck();
  var twos = deck.filter(function (c) { return c.rank === "2"; });
  var rest = deck.filter(function (c) { return c.rank !== "2"; });
  var random = (function () { var seed = 7; return function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; })();
  var checked = 0;
  // Hands with one, two and three twos, and hands without any.
  [0, 1, 2, 3].forEach(function (deuces) {
    for (var n = 0; n < (deuces === 3 ? 60 : 1500); n++) {
      var pool = rest.slice(), cards = [], i;
      var two = twos.slice();
      for (i = 0; i < deuces; i++) cards.push(two.splice(Math.floor(random() * two.length), 1)[0]);
      while (cards.length < 5) cards.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
      assert.equal(Engine.evaluate(cards, "deucesWild").category, deucesJudge(cards), cards.map(Engine.code).join(" "));
      checked++;
    }
  });
  assert.equal(checked, 4560);
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

test("hands are named as Double Bonus and Deuces Wild pay them", function () {
  assert.equal(category("AS AD AC AH 5S", "doubleBonus"), "quadAces");
  assert.equal(category("4S 4D 4C 4H 5S", "doubleBonus"), "quadsLow");
  assert.equal(category("2S 2D 2C 2H 5S", "doubleBonus"), "quadsLow");
  assert.equal(category("5S 5D 5C 5H AS", "doubleBonus"), "quads");
  assert.equal(category("JS JD 2C 5H 9S", "doubleBonus"), "jacksOrBetter");
  assert.equal(category("2S 2D 2C 2H 5S", "deucesWild"), "fourDeuces");
  assert.equal(category("AS KS QS JS 10S", "deucesWild"), "royalFlush", "a natural royal");
  assert.equal(category("2S KS QS JS 10S", "deucesWild"), "wildRoyal");
  assert.equal(category("2S 2D QS JS 10S", "deucesWild"), "wildRoyal");
  assert.equal(category("7S 7D 7C 7H 2C", "deucesWild"), "fiveOfAKind");
  assert.equal(category("2S 2D 2C 9H 9S", "deucesWild"), "fiveOfAKind");
  assert.equal(category("2S 3S 4S 5S 7S", "deucesWild"), "straightFlush");
  assert.equal(category("2S 7D 7C 7H 5S", "deucesWild"), "quads");
  assert.equal(category("2S 7D 7C 5H 5S", "deucesWild"), "fullHouse");
  assert.equal(category("2S 3S 5S 9S JS", "deucesWild"), "flush");
  assert.equal(category("2S 3D 4C 5H 7S", "deucesWild"), "straight");
  assert.equal(category("2S AD KC QH JS", "deucesWild"), "straight", "the two stands in for the ten");
  assert.equal(category("2S 9D 9C 5H 7S", "deucesWild"), "trips", "a two with a pair is three of a kind");
  assert.equal(category("2S 9D AC 5H 7S", "deucesWild"), "nothing", "a two with no pair makes only a pair");
  assert.equal(category("2S 4D AC 5H 3S", "deucesWild"), "straight", "A 3 4 5 with a wild two");
  assert.equal(category("2S 9D KC 5H 3S", "deucesWild"), "nothing");
  assert.equal(category("AS AD KC KH 3S", "deucesWild"), "nothing", "two pair pays nothing");
  assert.equal(Engine.evaluate(hand("2S 2D 2C 2H 5S")).category, "quads", "Jacks or Better when no table is given");
});

test("each game prints its own rows, best first, and names the strongest hand drawn", function () {
  assert.deepEqual(Engine.PAY_ROWS.nineSix, ["royalFlush", "straightFlush", "quads", "fullHouse", "flush", "straight", "trips", "twoPair", "jacksOrBetter"]);
  assert.deepEqual(Engine.PAY_ROWS.doubleBonus, ["royalFlush", "straightFlush", "quadAces", "quadsLow", "quads", "fullHouse", "flush", "straight", "trips", "twoPair", "jacksOrBetter"]);
  assert.deepEqual(Engine.PAY_ROWS.deucesWild, ["royalFlush", "fourDeuces", "wildRoyal", "fiveOfAKind", "straightFlush", "quads", "fullHouse", "flush", "straight", "trips"]);
  Engine.PAY_TABLES.forEach(function (table) {
    var paying = Engine.CATEGORIES.filter(function (name) { return Engine.payPerCoin(name, table, 1) > 0; });
    assert.deepEqual(Engine.PAY_ROWS[table].slice().sort(), paying.sort(), table + " prints every paying hand once");
  });
  assert.deepEqual(Engine.CATEGORIES.slice(0, 10), ["nothing", "jacksOrBetter", "twoPair", "trips", "straight", "flush", "fullHouse", "quads", "straightFlush", "royalFlush"], "saved places stay");
  assert.equal(Engine.stronger("quads", "quadAces"), "quadAces");
  assert.equal(Engine.stronger("royalFlush", "fourDeuces"), "royalFlush");
  assert.equal(Engine.stronger("fullHouse", "twoPair"), "fullHouse");
});

test("the pays of every table, and the royal flush at five coins", function () {
  assert.deepEqual(Engine.PAY_TABLES, ["nineSix", "eightFive", "doubleBonus", "deucesWild"]);
  assert.deepEqual(Engine.GAME_OF, { nineSix: "jacks", eightFive: "jacks", doubleBonus: "bonus", deucesWild: "deuces" });
  assert.equal(Engine.payPerCoin("royalFlush", "deucesWild", 5), 800);
  assert.equal(Engine.payPerCoin("wildRoyal", "deucesWild", 5), 25);
  assert.equal(Engine.payPerCoin("twoPair", "deucesWild", 5), 0);
  assert.equal(Engine.payPerCoin("quadAces", "nineSix", 5), 0, "a hand of another game pays nothing");
  var aces = Engine.settle({ denomination: 1, coins: 5 }, hand("AS AD AC AH 5S"), "doubleBonus");
  assert.deepEqual([aces.hand.category, aces.returned], ["quadAces", 800]);
  var wild = Engine.settle({ denomination: 5, coins: 1 }, hand("2S 7D 7C 5H 9S"), "deucesWild");
  assert.deepEqual([wild.hand.category, wild.returned, wild.net], ["trips", 5, 0]);
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
  assert.deepEqual(percent, ["99.5439", "97.2984", "98.3735", "99.1065", "99.7283"],
    "9/6 and 8/5 with five coins, 9/6 with one, Double Bonus and Deuces Wild with five");
  assert.equal(Engine.RETURN_PERCENT.nineSix.toFixed(2), (sums[0] / deals * 100).toFixed(2));
  assert.equal(Engine.RETURN_PERCENT.eightFive.toFixed(2), (sums[1] / deals * 100).toFixed(2));
  assert.equal(Engine.RETURN_PERCENT.doubleBonus.toFixed(2), (sums[3] / deals * 100).toFixed(2));
  assert.equal(Engine.RETURN_PERCENT.deucesWild.toFixed(2), (sums[4] / deals * 100).toFixed(2));
});

test("the machine's own count of every hold agrees with the exhaustive tables, value for value", function () {
  var deals = ["AS KS QS JS 9S", "JH JD 3C 7S 9D", "2C 4D 7H 9S 3H", "10H JH QH 2S 2D", "5C 6D 7H 8S KC", "2S 2D 2C AH AS", "AS AD AC 4H 4S"];
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
  assert.equal(heldCodes("2S 2D 7C 9H KS", "deucesWild"), "2S 2D", "in Deuces Wild hold the twos");
  assert.equal(heldCodes("2S 2D 2C 2H KS", "deucesWild"), "2S 2D 2C 2H", "four deuces never break");
  assert.equal(heldCodes("AS AD AC 4H 4S", "doubleBonus"), "AS AD AC", "Double Bonus breaks a full house of aces");
  assert.equal(heldCodes("AS AD AC 4H 4S"), "AS AD AC 4H 4S", "Jacks or Better keeps it");
});

test("every hold is ranked, best first, values compared exactly", function () {
  var ranked = Engine.rankHolds(hand("JH JD 3C 7S 9D"), "nineSix", 5);
  assert.equal(ranked.length, 32);
  assert.deepEqual(ranked.map(function (r) { return r.mask; }).sort(function (a, b) { return a - b; }), Array.from({ length: 32 }, function (_, i) { return i; }));
  assert.equal(ranked[0].mask, 3);
  assert.equal(ranked[0].total, 24915);
  assert.equal(ranked[0].draws, 16215);
  for (var i = 1; i < 32; i++) {
    assert.ok(ranked[i - 1].total * ranked[i].draws >= ranked[i].total * ranked[i - 1].draws, "in order at " + i);
  }
  assert.deepEqual(ranked.filter(function (r) { return r.best; }).map(function (r) { return r.mask; }), [3]);
  var royal = Engine.rankHolds(hand("AS KS QS JS 10S"), "nineSix", 5);
  assert.deepEqual([royal[0].mask, royal[0].value], [31, 800]);
  // Holds worth exactly the same are all best, the lower mask first: in a
  // hand of four deuces the kicker changes nothing.
  var deuces = Engine.rankHolds(hand("2S 2D 2C 2H KS"), "deucesWild", 5);
  assert.deepEqual(deuces.filter(function (r) { return r.best; }).map(function (r) { return r.mask; }), [15, 31]);
});
