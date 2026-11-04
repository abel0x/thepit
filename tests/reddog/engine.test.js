/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/reddog/js/engine.js");

// "AS KS QS" → three cards.
function hand(text) {
  return text.split(" ").map(function (code) {
    var c = Engine.fromCode(code);
    assert.ok(c, code);
    return c;
  });
}

function settle(text, decision, ante) {
  return Engine.settle({ ante: ante || 10 }, hand(text), decision);
}

var SHOE = 52 * Engine.DECKS;
var PER_RANK = 4 * Engine.DECKS;

test("eight decks of 52 cards, shuffled together without bias", function () {
  var shoe = Engine.newShoe();
  assert.equal(shoe.length, SHOE);
  var copies = {};
  shoe.forEach(function (c) { copies[Engine.code(c)] = (copies[Engine.code(c)] || 0) + 1; });
  assert.equal(Object.keys(copies).length, 52);
  Object.keys(copies).forEach(function (key) { assert.equal(copies[key], Engine.DECKS, key); });
  var counts = [0, 0, 0];
  for (var i = 0; i < 30000; i++) counts[Engine.randomInt(3)]++;
  counts.forEach(function (count) { assert.ok(count > 9400 && count < 10600, String(count)); });
  assert.throws(function () { Engine.randomInt(0); }, RangeError);
  assert.throws(function () { Engine.randomInt(3, function () { return 1; }); }, RangeError);
  var cards = Engine.deal(function () { return shoe.pop(); });
  assert.equal(cards.length, 3);
  assert.ok(Engine.isLegalDeal(cards));
});

test("cards are saved as short codes and read back", function () {
  ["AS", "10H", "QD", "2C"].forEach(function (text) { assert.equal(Engine.code(Engine.fromCode(text)), text); });
  ["1S", "11H", "AX", "", null, "10"].forEach(function (text) { assert.equal(Engine.fromCode(text), null, String(text)); });
  assert.equal(Engine.fromCode("KH").color, "red");
  assert.ok(Engine.isLegalDeal(hand("AS AS AS")), "eight decks hold eight of every card");
  assert.equal(Engine.isLegalDeal(hand("AS KS")), false);
  assert.equal(Engine.isLegalDeal([Engine.fromCode("AS"), null, Engine.fromCode("2C")]), false);
});

test("the spread counts the ranks strictly between, the ace high, in either order", function () {
  assert.deepEqual(Engine.classify(Engine.fromCode("5S"), Engine.fromCode("5D")), { kind: "pair", spread: 0, low: 5, high: 5 });
  assert.equal(Engine.classify(Engine.fromCode("7S"), Engine.fromCode("8D")).kind, "consecutive");
  assert.equal(Engine.classify(Engine.fromCode("AS"), Engine.fromCode("KD")).kind, "consecutive");
  assert.equal(Engine.classify(Engine.fromCode("2S"), Engine.fromCode("3D")).kind, "consecutive");
  assert.equal(Engine.classify(Engine.fromCode("AS"), Engine.fromCode("2D")).spread, 11, "two and ace are the widest spread");
  assert.equal(Engine.classify(Engine.fromCode("4S"), Engine.fromCode("9D")).spread, 4);
  assert.equal(Engine.classify(Engine.fromCode("9D"), Engine.fromCode("4S")).spread, 4);
  assert.equal(Engine.classify(Engine.fromCode("10H"), Engine.fromCode("QC")).spread, 1);
  assert.equal(Engine.needsDecision(hand("4S 9D 2C")), true);
  assert.equal(Engine.needsDecision(hand("4S 5D 2C")), false);
  assert.equal(Engine.needsDecision(hand("4S 4D 2C")), false);
});

test("only a card strictly between the two wins; a card of either rank is out", function () {
  var first = Engine.fromCode("4S"), second = Engine.fromCode("9D");
  ["5H", "6H", "7H", "8H"].forEach(function (text) { assert.equal(Engine.isBetween(Engine.fromCode(text), first, second), true, text); });
  ["2H", "3H", "4H", "9H", "10H", "AH"].forEach(function (text) { assert.equal(Engine.isBetween(Engine.fromCode(text), first, second), false, text); });
  assert.equal(Engine.isBetween(Engine.fromCode("KH"), Engine.fromCode("AS"), Engine.fromCode("QD")), true);
  assert.equal(Engine.isBetween(Engine.fromCode("AH"), Engine.fromCode("2S"), Engine.fromCode("KD")), false, "the ace is never low");
});

test("a win pays by the spread, on the Ante and on the Raise", function () {
  assert.equal(Engine.spreadPays(1), 5);
  assert.equal(Engine.spreadPays(2), 4);
  assert.equal(Engine.spreadPays(3), 2);
  for (var spread = 4; spread <= Engine.MAX_SPREAD; spread++) assert.equal(Engine.spreadPays(spread), 1, String(spread));

  var one = settle("10S QD JH", "call");
  assert.deepEqual([one.outcome, one.spread, one.pays, one.stake, one.returned, one.net], ["win", 1, 5, 10, 60, 50]);
  var two = settle("10S KD QH", "raise");
  assert.deepEqual([two.outcome, two.pays, two.stake, two.returned, two.net], ["win", 4, 20, 100, 80]);
  assert.deepEqual(two.lines.map(function (line) { return [line.key, line.amount, line.returned, line.result]; }),
    [["ante", 10, 50, "win"], ["raise", 10, 50, "win"]]);
  var three = settle("5S 9D 7H", "call");
  assert.deepEqual([three.pays, three.returned], [2, 30]);
  var wide = settle("2S AD 8H", "raise", 25);
  assert.deepEqual([wide.spread, wide.pays, wide.stake, wide.returned], [11, 1, 50, 100]);
});

test("a card that is out loses the Ante and the Raise", function () {
  var out = settle("4S 9D 9H", "raise");
  assert.deepEqual([out.outcome, out.stake, out.returned, out.net], ["lose", 20, 0, -20]);
  assert.deepEqual(out.lines.map(function (line) { return line.result; }), ["lose", "lose"]);
  var called = settle("4S 9D KH", "call");
  assert.deepEqual([called.outcome, called.stake, called.returned, called.raised], ["lose", 10, 0, false]);
});

test("two ranks in a row are a push, and the third card does not count", function () {
  ["7S 8D 7H", "7S 8D 8H", "7S 8D 2H", "KS AD QH"].forEach(function (text) {
    var result = settle(text, "raise");
    assert.deepEqual([result.kind, result.outcome, result.raised, result.stake, result.returned], ["consecutive", "push", false, 10, 10], text);
  });
});

test("a pair draws a third card: three of a kind pays 11 to 1, anything else is a push", function () {
  var trips = settle("QS QD QH", "raise");
  assert.deepEqual([trips.kind, trips.outcome, trips.pays, trips.raised, trips.stake, trips.returned], ["pair", "trips", 11, false, 10, 120]);
  var miss = settle("QS QD KH", "call");
  assert.deepEqual([miss.outcome, miss.stake, miss.returned, miss.net], ["push", 10, 10, 0]);
});

test("the best strategy raises a spread of 7 or more", function () {
  assert.equal(Engine.RAISE_FROM, 7);
  for (var spread = 1; spread <= Engine.MAX_SPREAD; spread++) {
    // A spread leaves every card of the ranks between in the shoe.
    var inside = spread * PER_RANK / (SHOE - 2);
    var raiseValue = inside * (Engine.spreadPays(spread) + 1) - 1;
    assert.equal(raiseValue > 0, spread >= Engine.RAISE_FROM, "spread " + spread + ": the Raise is worth " + raiseValue);
    var low = 2, high = low + spread + 1;
    var cards = [Engine.card(Engine.RANKS[low - 2], "♠"), Engine.card(Engine.RANKS[high - 2], "♥"), Engine.card("2", "♣")];
    assert.equal(Engine.shouldRaise(cards), spread >= Engine.RAISE_FROM, "spread " + spread);
  }
  assert.equal(Engine.shouldRaise(hand("4S 4D 4H")), false);
  assert.equal(Engine.shouldRaise(hand("4S 5D 4H")), false);
});

test("every deal of three cards from the shoe, counted by rank, settles by the rules", function () {
  var deals = 0, outcomes = { push: 0, trips: 0, win: 0, lose: 0 };
  Engine.dealsByRank(function (cards, weight) {
    deals += weight;
    var a = Engine.rankValue(cards[0].rank), b = Engine.rankValue(cards[1].rank), c = Engine.rankValue(cards[2].rank);
    ["raise", "call"].forEach(function (decision) {
      var result = Engine.settle({ ante: 1 }, cards, decision);
      var raised = a !== b && Math.abs(a - b) > 1 && decision === "raise";
      var expected;
      if (a === b) expected = c === a ? 12 : 1;
      else if (Math.abs(a - b) === 1) expected = 1;
      else if (c > Math.min(a, b) && c < Math.max(a, b)) expected = (Engine.spreadPays(Math.abs(a - b) - 1) + 1) * (raised ? 2 : 1);
      else expected = 0;
      assert.equal(result.stake, raised ? 2 : 1);
      assert.equal(result.returned, expected, cards.map(Engine.code).join(" ") + " " + decision);
      if (decision === "call") outcomes[result.outcome] += weight;
    });
  });
  assert.equal(deals, SHOE * (SHOE - 1) * (SHOE - 2));
  assert.equal(outcomes.push + outcomes.trips + outcomes.win + outcomes.lose, deals);
});

test("the house edge is 2.75% of the Ante with the best strategy, and the strategy is the best", function () {
  var best = Engine.houseEdge();
  // The same return from the chances themselves: a pair, two ranks in a
  // row, or a spread whose third card falls between.
  var pair = (PER_RANK - 1) / (SHOE - 1);
  var trips = (PER_RANK - 2) / (SHOE - 2);
  var player = pair * trips * Engine.TRIPS_PAY;
  for (var spread = 1; spread <= Engine.MAX_SPREAD; spread++) {
    var chance = 2 * (13 - spread - 1) * PER_RANK / SHOE * PER_RANK / (SHOE - 1);
    var inside = spread * PER_RANK / (SHOE - 2);
    var units = spread >= Engine.RAISE_FROM ? 2 : 1;
    player += chance * units * (inside * Engine.spreadPays(spread) - (1 - inside));
  }
  assert.ok(Math.abs(best + player) < 1e-12, best + " against " + -player);
  assert.equal((best * 100).toFixed(2), "2.75");
  assert.equal((Engine.houseEdge(12) * 100).toFixed(2), "7.88", "never raising");
  for (var from = 1; from <= 12; from++) {
    if (from !== Engine.RAISE_FROM) assert.ok(Engine.houseEdge(from) > best, "raising from " + from);
  }
});
