/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var SideBets = require("../../games/blackjack/js/sidebets.js");
var Engine = require("../../games/blackjack/js/engine.js");
var loadI18n = require("../helpers/i18n.js").loadI18n;

// "A♠" → { rank: "A", suit: "♠" }
function card(text) {
  return { rank: text.slice(0, -1), suit: text.slice(-1) };
}
function cards(text) {
  return text.split(" ").map(card);
}

test("Perfect Pairs names the same card, a pair in one colour and a pair in both", function () {
  assert.equal(SideBets.pairsOutcome(card("K♠"), card("K♠")), "perfect");
  assert.equal(SideBets.pairsOutcome(card("K♠"), card("K♣")), "coloured");
  assert.equal(SideBets.pairsOutcome(card("7♥"), card("7♦")), "coloured");
  assert.equal(SideBets.pairsOutcome(card("7♥"), card("7♠")), "mixed");
  assert.equal(SideBets.pairsOutcome(card("K♠"), card("Q♠")), null, "ten-value cards of different ranks are no pair");
  assert.equal(SideBets.pairsOutcome(card("10♠"), card("J♠")), null);
});

test("21+3 reads the three cards as a poker hand, the ace high or low but never round the corner", function () {
  assert.equal(SideBets.trioOutcome(card("9♥"), card("9♥"), card("9♥")), "suitedTrips");
  assert.equal(SideBets.trioOutcome(card("9♥"), card("9♠"), card("9♥")), "trips");
  assert.equal(SideBets.trioOutcome(card("8♣"), card("10♣"), card("9♣")), "straightFlush");
  assert.equal(SideBets.trioOutcome(card("Q♦"), card("A♦"), card("K♦")), "straightFlush", "ace high");
  assert.equal(SideBets.trioOutcome(card("3♠"), card("A♥"), card("2♣")), "straight", "ace low");
  assert.equal(SideBets.trioOutcome(card("K♠"), card("A♥"), card("2♣")), null, "no straight round the corner");
  assert.equal(SideBets.trioOutcome(card("2♣"), card("9♣"), card("K♣")), "flush");
  assert.equal(SideBets.trioOutcome(card("J♣"), card("Q♥"), card("10♦")), "straight");
  assert.equal(SideBets.trioOutcome(card("J♣"), card("J♥"), card("10♦")), null, "a pair is nothing");
});

test("settlement pays each side bet its odds with the stake back, and leaves out the bets not placed", function () {
  var settled = SideBets.settle({ pairs: 100, trio: 200 }, cards("7♥ 7♦"), card("7♣"));
  assert.deepEqual(settled.lines, [
    { bet: "pairs", stake: 100, outcome: "coloured", returned: 1300 },
    { bet: "trio", stake: 200, outcome: "trips", returned: 6200 }
  ]);
  assert.deepEqual([settled.stake, settled.returned], [300, 7500]);
  var lost = SideBets.settle({ pairs: 0, trio: 500 }, cards("2♠ 9♥"), card("K♦"));
  assert.deepEqual(lost.lines, [{ bet: "trio", stake: 500, outcome: null, returned: 0 }]);
  assert.deepEqual(SideBets.settle(null, cards("2♠ 9♥"), card("K♦")), { lines: [], stake: 0, returned: 0 });
  assert.deepEqual(SideBets.normalizeStakes({ pairs: 1.5, trio: -5 }), { pairs: 0, trio: 0 });
  assert.equal(SideBets.maxReturn({ pairs: 100, trio: 100 }), 2600 + 10100);
});

test("side bets are offered with six or eight decks", function () {
  assert.deepEqual([1, 2, 6, 8].map(SideBets.offered), [false, false, true, true]);
});

/* An independent count: every ordered draw of two and three cards from a
   real shoe built by the table's own engine, card by card. */
function countDraws(decks, three) {
  var shoe = Engine.buildShoe(decks);
  var tally = {};
  var total = 0;
  for (var i = 0; i < shoe.length; i++) {
    for (var j = 0; j < shoe.length; j++) {
      if (j === i) continue;
      if (!three) {
        var pair = SideBets.pairsOutcome(shoe[i], shoe[j]) || "none";
        tally[pair] = (tally[pair] || 0) + 1;
        total++;
        continue;
      }
      // The third card only matters by its rank and suit: group it.
      var groups = {};
      for (var k = 0; k < shoe.length; k++) {
        if (k === i || k === j) continue;
        var key = shoe[k].rank + shoe[k].suit;
        groups[key] = (groups[key] || 0) + 1;
      }
      Object.keys(groups).forEach(function (key) {
        var outcome = SideBets.trioOutcome(shoe[i], shoe[j], card(key)) || "none";
        tally[outcome] = (tally[outcome] || 0) + groups[key];
        total += groups[key];
      });
    }
  }
  return { tally: tally, total: total };
}

test("the exact odds agree with a count of every draw from a real shoe", function () {
  [6, 8].forEach(function (decks) {
    var pairs = countDraws(decks, false);
    var ways = SideBets.outcomeWays("pairs", decks);
    SideBets.OUTCOMES.pairs.forEach(function (outcome) {
      assert.deepEqual(ways[outcome], [pairs.tally[outcome], pairs.total], decks + " decks " + outcome);
    });
  });
  var trio = countDraws(6, true);
  var trioWays = SideBets.outcomeWays("trio", 6);
  SideBets.OUTCOMES.trio.forEach(function (outcome) {
    assert.deepEqual(trioWays[outcome], [trio.tally[outcome], trio.total], "6 decks " + outcome);
  });
});

test("the house edges the rules print", function () {
  var edges = [6, 8].map(function (decks) {
    return [SideBets.houseEdge("pairs", decks).toFixed(2), SideBets.houseEdge("trio", decks).toFixed(2)];
  });
  assert.deepEqual(edges, [["6.11", "4.62"], ["4.10", "3.70"]]);
  // Perfect Pairs with six decks: 5 perfect, 6 coloured and 12 mixed of 311
  // second cards, 19/311 lost on the bet.
  var ways = SideBets.outcomeWays("pairs", 6);
  assert.deepEqual([ways.perfect, ways.coloured, ways.mixed], [[312 * 5, 312 * 311], [312 * 6, 312 * 311], [312 * 12, 312 * 311]]);
  assert.ok(Math.abs(SideBets.houseEdge("pairs", 6) - 19 / 311 * 100) < 1e-9);
  var words = loadI18n("games/blackjack/js/strings.js").I18n._dict;
  assert.match(words.en.sideBetsEdge, /six decks the house keeps 6\.11% of Perfect Pairs and 4\.62% of 21\+3, with eight decks 4\.10% and 3\.70%/);
  assert.match(words.tr.sideBetsEdge, /%6,11.*%4,62.*%4,10.*%3,70/);
  Object.keys(SideBets.PAYS.pairs).forEach(function (outcome) {
    assert.match(words.en.sidePairsPays, new RegExp(SideBets.PAYS.pairs[outcome] + " to 1"));
  });
  Object.keys(SideBets.PAYS.trio).forEach(function (outcome) {
    assert.match(words.en.sideTrioPays, new RegExp(SideBets.PAYS.trio[outcome] + " to 1"));
  });
});

test("the table settles side bets on the opening cards and pays them with the round", function () {
  var game = fs.readFileSync(path.resolve(__dirname, "../../games/blackjack/js/game.js"), "utf8");
  var opening = game.slice(game.indexOf("  function afterOpeningDeal()"), game.indexOf("  // The table waits for the player"));
  assert.match(opening, /settleSideBets\(\);\n/, "settled before insurance or the peek");
  assert.ok(opening.indexOf("settleSideBets()") < opening.indexOf("openInsurance"));
  var settle = game.slice(game.indexOf("  function settle()"), game.indexOf("  function prepareHandSettlements()"));
  assert.match(settle, /var totalReturn = round\.totalReturn \+ sideReturn;/);
  var dealing = game.slice(game.indexOf("  async function dealRound()"), game.indexOf("  function afterOpeningDeal()"));
  assert.match(dealing, /state\.bankroll -= stakeOnFelt\(\);/, "the side stakes leave the balance with the bet");
  assert.ok(dealing.indexOf('saveRound("deal")') > dealing.indexOf("state.side = "), "saved with the round");
});
