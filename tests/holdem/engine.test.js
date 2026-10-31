/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/holdem/js/engine.js");

function cards(text) {
  return text.split(" ").map(function (code) {
    var c = Engine.fromCode(code);
    assert.ok(c, code);
    return c;
  });
}
function rank(text) { return Engine.evaluate(cards(text)); }
function hands(player, dealer, board) { return { player: cards(player), dealer: cards(dealer), board: cards(board) }; }

test("one deck, dealt two and two, then the five cards of the board", function () {
  var deck = Engine.newDeck();
  assert.equal(new Set(deck.map(Engine.code)).size, 52);
  var order = cards("AS KS QS JS 10S 9S 8S 7S 6S");
  var dealt = Engine.deal(function () { return order.shift(); });
  assert.deepEqual(dealt.player.map(Engine.code), ["AS", "QS"]);
  assert.deepEqual(dealt.dealer.map(Engine.code), ["KS", "JS"]);
  assert.deepEqual(dealt.board.map(Engine.code), ["10S", "9S", "8S", "7S", "6S"]);
  assert.ok(Engine.isLegalDeal(dealt));
  assert.equal(Engine.isLegalDeal(hands("AS KS", "AS 2D", "3C 4C 5C 6C 7C")), false);
});

test("every kind of hand in order, and the best five of seven", function () {
  var order = ["KS 9D 4C 3H 2S", "4H 4D KC 9S 2H", "4H 4D KC KS 2H", "7S 7D 7C KS 2H", "4S 5D 6C 7H 8S",
    "2H 7H JH 4H 9H", "7S 7D 7C 2S 2H", "9S 9D 9C 9H 2H", "5C 6C 7C 8C 9C", "10D JD QD KD AD"];
  var ranked = order.map(rank);
  assert.deepEqual(ranked.map(function (h) { return h.category; }), Engine.CATEGORIES);
  for (var i = 1; i < ranked.length; i++) assert.equal(Engine.compare(ranked[i], ranked[i - 1]), 1, order[i]);
  assert.equal(rank("AS 2D 3C 4H 5S").category, "straight");
  assert.deepEqual(rank("AS 2D 3C 4H 5S").ranks, [5], "the wheel is the lowest straight");
  var seven = rank("AH KH 2C 7H 9H 3S QH");
  assert.equal(seven.category, "flush");
  assert.deepEqual(seven.ranks, [14, 13, 12, 9, 7]);
  assert.equal(seven.cards.length, 5);
  assert.equal(rank("KS KD 7C 7D 2H 2S AC").category, "twoPair");
  assert.deepEqual(rank("KS KD 7C 7D 2H 2S AC").ranks, [13, 7, 14], "the best two pairs and the best kicker");
});

test("the dealer qualifies with fours, the AA Bonus with aces", function () {
  assert.equal(Engine.qualifies(rank("4S 4D KC 9S 2H")), true);
  assert.equal(Engine.qualifies(rank("3S 3D KC 9S 2H")), false);
  assert.equal(Engine.qualifies(rank("AS KD QC 9S 2H")), false);
  assert.equal(Engine.aaQualifies(rank("AS AD QC 9S 2H")), true);
  assert.equal(Engine.aaQualifies(rank("KS KD QC 9S 2H")), false);
  assert.equal(Engine.aaQualifies(rank("3S 3D 2C 2S 9H")), true, "any two pair beats a pair of aces");
});

test("a score names its hand again", function () {
  ["KS 9D 4C 3H 2S", "4H 4D KC KS 2H", "7S 7D 7C 2S 2H", "10D JD QD KD AD"].forEach(function (text) {
    var hand = rank(text);
    var back = Engine.fromScore(hand.score);
    assert.equal(back.category, hand.category);
    assert.deepEqual(back.ranks, hand.ranks);
  });
  assert.equal(Engine.fromScore(-1), null);
});

test("settlement: the dealer does not qualify, wins, loses or ties", function () {
  var bets = { ante: 10 };
  var noQualify = Engine.settle(bets, hands("AS KD", "7C 2D", "9S 5H 3C JD 8H"), "call");
  assert.equal(noQualify.outcome, "noQualify");
  assert.deepEqual(noQualify.lines.map(function (l) { return [l.key, l.amount, l.returned]; }), [["ante", 10, 20], ["call", 20, 20]]);
  var flush = Engine.settle(bets, hands("AH KH", "4C 4D", "2H 7H 9H JS QC"), "call");
  assert.equal(flush.outcome, "win");
  assert.deepEqual(flush.lines.map(function (l) { return l.returned; }), [30, 40], "a flush pays 2 to 1 on the Ante");
  var lose = Engine.settle(bets, hands("2S 3D", "QC QD", "9S 5H 4C JD 8H"), "call");
  assert.equal(lose.outcome, "lose");
  assert.equal(lose.returned, 0);
  var tie = Engine.settle(bets, hands("2S 3D", "2C 3H", "AS AH AD KC QC"), "call");
  assert.equal(tie.outcome, "tie");
  assert.equal(tie.returned, 30);
  var royal = Engine.settle(bets, hands("AD KD", "4C 4H", "QD JD 10D 2S 3C"), "call");
  assert.equal(royal.lines[0].returned, 10 * 101);
});

test("folding gives up the Ante; the AA Bonus is paid on the flop either way", function () {
  var folded = Engine.settle({ ante: 10, aaBonus: 5 }, hands("AS AD", "KC KH", "7S 2H 9C 4D 8H"), "fold");
  assert.equal(folded.outcome, "fold");
  assert.deepEqual(folded.lines.map(function (l) { return [l.key, l.amount, l.returned]; }), [["aaBonus", 5, 40], ["ante", 10, 0]]);
  var later = Engine.settle({ ante: 10, aaBonus: 5 }, hands("AS KD", "7C 2D", "9S 5H 3C AD 8H"), "call");
  assert.equal(later.lines[0].returned, 0, "aces that come on the turn do not count for the AA Bonus");
});

test("an exhaustive count of all 2,598,960 hands gives the textbook odds and the AA Bonus its 6.26% house edge", function () {
  var deck = Engine.buildDeck();
  var counts = {}, net = 0, total = 0;
  for (var a = 0; a < 52; a++) for (var b = a + 1; b < 52; b++) for (var c = b + 1; c < 52; c++)
    for (var d = c + 1; d < 52; d++) for (var e = d + 1; e < 52; e++) {
      var hand = Engine.evaluate5([deck[a], deck[b], deck[c], deck[d], deck[e]]);
      counts[hand.category] = (counts[hand.category] || 0) + 1;
      net += Engine.aaQualifies(hand) ? Engine.AA_PAYS[hand.category] : -1;
      total++;
    }
  assert.equal(total, 2598960);
  assert.deepEqual(counts, { royalFlush: 4, straightFlush: 36, quads: 624, fullHouse: 3744, flush: 5108, straight: 10200,
    trips: 54912, twoPair: 123552, pair: 1098240, high: 1302540 });
  assert.equal((-net / total * 100).toFixed(2), "6.26");
});
