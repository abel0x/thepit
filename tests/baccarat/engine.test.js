/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/baccarat/js/engine.js");
var enumerateShoe = require("../helpers/baccarat.js").enumerateShoe;

function c(rank, suit) { return Engine.card(rank, suit || "♠"); }
function hand(ranks) { return ranks.map(function (rank) { return c(rank); }); }

// Deals the given ranks, in order, as a stacked shoe would.
function coup(ranks) {
  var cards = hand(ranks);
  return Engine.playCoup(function () {
    if (!cards.length) throw new Error("the coup asked for more cards than were stacked");
    return cards.shift();
  });
}

test("cards count their baccarat value and only the last digit of a hand counts", function () {
  assert.equal(Engine.value(c("A")), 1);
  assert.equal(Engine.value(c("9")), 9);
  ["10", "J", "Q", "K"].forEach(function (rank) { assert.equal(Engine.value(c(rank)), 0, rank); });
  assert.equal(Engine.total(hand(["7", "8"])), 5);
  assert.equal(Engine.total(hand(["K", "9"])), 9);
  assert.equal(Engine.total(hand(["5", "5", "Q"])), 0);
  assert.equal(Engine.isNatural(hand(["4", "4"])), true);
  assert.equal(Engine.isNatural(hand(["4", "4", "K"])), false, "a natural needs two cards");
  assert.equal(Engine.isPair([c("Q", "♥"), c("Q", "♣")]), true);
  assert.equal(Engine.isPair([c("Q"), c("K")]), false, "a pair is the same rank, not the same value");
});

test("the banker follows the complete Punto Banco tableau", function () {
  // Rows: banker total 0-7. Columns: the player's third card 0-9, then "stood".
  var chart = [
    "DDDDDDDDDD D",
    "DDDDDDDDDD D",
    "DDDDDDDDDD D",
    "DDDDDDDDSD D",
    "SSDDDDDDSS D",
    "SSSSDDDDSS D",
    "SSSSSSDDSS S",
    "SSSSSSSSSS S"
  ];
  chart.forEach(function (row, total) {
    for (var third = 0; third <= 9; third++) {
      var card = c(third === 0 ? "10" : third === 1 ? "A" : String(third));
      assert.equal(Engine.bankerDraws(total, card), row[third] === "D", "banker " + total + " against a " + third);
    }
    assert.equal(Engine.bankerDraws(total, null), row[11] === "D", "banker " + total + " when the player stood");
  });
  for (var t = 0; t <= 9; t++) assert.equal(Engine.playerDraws(t), t <= 5, "player " + t);
});

test("a coup deals Player, Banker, Player, Banker, then only the third cards the rules call for", function () {
  var natural = coup(["9", "K", "Q", "5"]);
  assert.equal(natural.player.length + natural.banker.length, 4, "a natural stops the coup");
  assert.equal(natural.winner, "player");
  assert.equal(natural.natural, true);
  assert.deepEqual(natural.order.map(function (o) { return o.side; }), ["player", "banker", "player", "banker"]);

  var stood = coup(["6", "3", "K", "K", "2"]);   // Player 6 stands; Banker 3 draws without a player third
  assert.deepEqual(stood.player.map(function (x) { return x.rank; }), ["6", "K"]);
  assert.deepEqual(stood.banker.map(function (x) { return x.rank; }), ["3", "K", "2"]);
  assert.equal(stood.bankerTotal, 5);
  assert.equal(stood.winner, "player");

  var both = coup(["2", "3", "2", "K", "8", "4"]);   // Player 4 draws an 8; Banker 3 stands on an 8
  assert.equal(both.player.length, 3);
  assert.equal(both.banker.length, 2);
  assert.equal(both.playerTotal, 2);
  assert.equal(both.bankerTotal, 3);
  assert.equal(both.winner, "banker");

  var six = coup(["A", "6", "4", "K", "7", "9"]);   // Player 5 draws a 7; Banker 6 draws on a 7
  assert.equal(six.banker.length, 3);
  assert.equal(six.bankerTotal, 5);
  assert.equal(six.playerTotal, 2);
  assert.deepEqual(six.order.map(function (o) { return o.side; }), ["player", "banker", "player", "banker", "player", "banker"]);
});

test("an eight-deck shoe gives the published odds and house edges", function () {
  var odds = enumerateShoe();
  assert.ok(Math.abs(odds.player + odds.banker + odds.tie - 1) < 1e-12, "every coup is counted once");
  assert.equal(odds.banker.toFixed(6), "0.458597");
  assert.equal(odds.player.toFixed(6), "0.446247");
  assert.equal(odds.tie.toFixed(6), "0.095156");
  var bankerEdge = odds.player - odds.banker * 0.95;
  var playerEdge = odds.banker - odds.player;
  var tieEdge = 1 - odds.tie * 9;
  var noCommissionEdge = odds.player - (odds.banker - odds.bankerSix) - odds.bankerSix * 0.5;
  assert.equal((bankerEdge * 100).toFixed(2), "1.06");
  assert.equal((playerEdge * 100).toFixed(2), "1.24");
  assert.equal((tieEdge * 100).toFixed(2), "14.36");
  assert.equal((noCommissionEdge * 100).toFixed(2), "1.46");
  // A pair is the first two cards of a hand sharing a rank.
  var pair = 13 * (32 / 416) * (31 / 415);
  assert.equal(((1 - pair * 12) * 100).toFixed(2), "10.36");
});

test("every bet settles in whole dollars, stake included", function () {
  var tie = coup(["2", "4", "K", "3", "5"]);   // Player 2 draws a 5 to make 7; Banker 7 stands
  assert.equal(tie.playerTotal, 7);
  assert.equal(tie.bankerTotal, 7);
  var bets = { player: 100, banker: 25, tie: 10, playerPair: 5, bankerPair: 5 };
  var settled = Engine.settle(bets, tie, "classic");
  assert.deepEqual(settled.lines.map(function (l) { return [l.key, l.returned, l.result]; }), [
    ["playerPair", 0, "lose"], ["player", 100, "push"], ["tie", 90, "win"], ["banker", 25, "push"], ["bankerPair", 0, "lose"]
  ]);
  assert.equal(settled.stake, 145);
  assert.equal(settled.returned, 215);
  assert.equal(settled.net, 70);

  var banker = coup(["2", "8", "3", "K"]);   // Banker natural 8 against Player 5
  assert.equal(banker.winner, "banker");
  assert.equal(Engine.returnFor("banker", 25, banker, "classic"), 50, "the Banker is paid even money, its commission owed beside it");
  assert.equal(Engine.boxCents("banker", 25, banker, "classic"), 125, "5% of $25 is $1.25");
  assert.equal(Engine.boxCents("player", 25, banker, "classic"), 0);
  assert.equal(Engine.returnFor("banker", 100, banker, "noCommission"), 200);
  assert.equal(Engine.returnFor("player", 100, banker, "classic"), 0);

  var bankerSix = coup(["2", "3", "3", "3", "K"]);   // Player 5 draws a ten -> 5; Banker 6 stands on it
  assert.equal(bankerSix.bankerTotal, 6);
  assert.equal(bankerSix.winner, "banker");
  assert.equal(Engine.returnFor("banker", 100, bankerSix, "noCommission"), 150, "a six pays one to two without commission");
  assert.equal(Engine.returnFor("banker", 25, bankerSix, "noCommission"), 37);
  assert.equal(Engine.boxCents("banker", 25, bankerSix, "noCommission"), -50, "the half dollar of $12.50 is owed to the player");
  assert.equal(Engine.boxCents("banker", 24, bankerSix, "noCommission"), 0);

  var pairs = coup(["4", "9", "4", "9"]);   // two naturals of eight, each a pair
  assert.equal(pairs.playerPair && pairs.bankerPair, true);
  assert.equal(pairs.winner, "tie");
  assert.equal(Engine.returnFor("playerPair", 10, pairs, "classic"), 120);
  assert.equal(Engine.returnFor("bankerPair", 10, pairs, "classic"), 120);
  assert.throws(function () { Engine.returnFor("dragon", 10, pairs, "classic"); }, /Not a baccarat bet/);
});

test("the commission box takes exactly 5% of every Banker win, to the cent, over any run of coups", function () {
  var banker = coup(["2", "8", "3", "K"]);
  var bankerSix = coup(["2", "3", "3", "3", "K"]);
  // Four $5 Banker wins: $10 back each time, and the fourth puts a whole
  // dollar of commission in the box, which comes off that payout.
  var box = 0, paid = [];
  for (var i = 0; i < 4; i++) {
    var won = Engine.settle({ banker: 5 }, banker, "classic", box);
    paid.push(won.paid);
    box = won.box;
  }
  assert.deepEqual(paid, [10, 10, 10, 9]);
  assert.equal(box, 0);
  assert.equal(paid.reduce(function (a, b) { return a + b; }) - 20, 19, "four wins of $5 earn 19 to 20 on $20");

  var one = Engine.settle({ banker: 25, player: 10 }, banker, "classic", 90);
  assert.deepEqual([one.returned, one.commission, one.collected, one.box, one.paid, one.net], [50, 125, 2, 15, 48, 13]);
  // Without commission an odd stake on a six is owed its half dollar.
  var six = Engine.settle({ banker: 25 }, bankerSix, "noCommission", -60);
  assert.deepEqual([six.returned, six.commission, six.collected, six.box, six.paid], [37, -50, -1, -10, 38]);
  assert.equal(Object.is(Engine.settle({ player: 5 }, banker, "classic", -40).collected, 0), true, "no negative zero");

  // Any run of classic Banker stakes and outcomes: what was paid, less what
  // is still owed in the box, is exactly 19 to 20 on every winning stake.
  var random = 0.37, exact = 0, total = 0;
  box = 0;
  for (var n = 0; n < 2000; n++) {
    random = (random * 9301 + 49297) % 233280 / 233280;
    var stake = 5 * (1 + Math.floor(random * 40));
    var result = random < 0.5 ? banker : bankerSix;
    var settled = Engine.settle({ banker: stake }, result, "classic", box);
    box = settled.box;
    assert.ok(box >= 0 && box < 100);
    total += settled.paid - stake;
    exact += stake * 0.95;
  }
  assert.equal(Math.round((total - exact) * 100), box, "the box holds every cent paid out but not yet collected");
  assert.equal(Engine.normalizeBox(150), 0);
  assert.equal(Engine.normalizeBox(-99), -99);
  assert.equal(Engine.normalizeBox(2.5), 0);
});

test("bets are cleaned to known spots and whole amounts", function () {
  assert.deepEqual(Engine.normalizeBets({ banker: "25", player: 10.5, tie: -5, dragon: 100, playerPair: 5 }), { playerPair: 5, banker: 25 });
  assert.deepEqual(Engine.normalizeBets(null), {});
  assert.equal(Engine.totalStake({ player: 25, tie: 5 }), 30);
});

test("only coups the rules could deal are legal", function () {
  assert.equal(Engine.isLegalCoup(hand(["9", "K"]), hand(["2", "3"])), true);
  assert.equal(Engine.isLegalCoup(hand(["9", "K"]), hand(["2", "3", "4"])), false, "nobody draws after a natural");
  assert.equal(Engine.isLegalCoup(hand(["6", "K"]), hand(["3", "K", "2"])), true);
  assert.equal(Engine.isLegalCoup(hand(["6", "K", "2"]), hand(["3", "K"])), false, "the player stands on six");
  assert.equal(Engine.isLegalCoup(hand(["2", "2", "8"]), hand(["3", "K"])), true, "banker three stands on an eight");
  assert.equal(Engine.isLegalCoup(hand(["2", "2", "8"]), hand(["3", "K", "A"])), false);
  assert.equal(Engine.isLegalCoup(hand(["2"]), hand(["3", "K"])), false);
});

test("a fresh shoe holds eight decks less the burn", function () {
  var shoe = Engine.newShoe(function () { return 0.4; });
  var first = shoe.burned[0];
  assert.equal(shoe.burned.length, 1 + (Engine.value(first) || 10));
  assert.equal(shoe.cards.length + shoe.burned.length, 416);
  var all = shoe.cards.concat(shoe.burned).map(function (x) { return x.id; });
  assert.equal(new Set(all).size, 416, "every card of every deck exactly once");
  assert.equal(Engine.needsNewShoe(shoe.cards), false);
  assert.equal(Engine.needsNewShoe(shoe.cards.slice(0, Engine.CUT_CARD - 1)), true);
  assert.equal(Engine.needsNewShoe(null), true);
});

test("cards survive being saved in their compact form", function () {
  Engine.buildShoe(1).forEach(function (card) {
    var back = Engine.fromCode(Engine.code(card));
    assert.equal(back.rank, card.rank);
    assert.equal(back.suit, card.suit);
    assert.equal(back.color, card.color);
  });
  ["", "1S", "11H", "AX", "AS ", null].forEach(function (bad) { assert.equal(Engine.fromCode(bad), null, String(bad)); });
});

test("random draws use the whole crypto range without bias", function () {
  var calls = 0;
  var fake = { getRandomValues: function (buffer) { buffer[0] = [4294967295, 4294967294, 7][calls++]; } };
  var api = require("node:vm").runInNewContext(require("node:fs").readFileSync(require.resolve("../../games/baccarat/js/engine.js"), "utf8") + "\nBaccaratEngine", { crypto: fake });
  assert.equal(api.randomInt(6), 1, "values in the incomplete top bucket are rejected");
  assert.equal(calls, 3);
  assert.throws(function () { Engine.randomInt(0); }, RangeError);
  assert.throws(function () { Engine.randomInt(5, function () { return 1; }); }, /random source/);
});

test("the bead plate fills six to a column", function () {
  var results = ["player", "banker", "tie", "banker", "banker", "player", "player"].map(function (w) { return { winner: w }; });
  var beads = Engine.beadPlate(results);
  assert.deepEqual(beads.map(function (b) { return [b.col, b.row]; }), [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 0]]);
});

test("the big road follows each run and turns its dragon tail", function () {
  function road(winners) { return Engine.bigRoad(winners.split("").map(function (w) { return { winner: { P: "player", B: "banker", T: "tie" }[w] }; })); }
  var simple = road("PPBTBP");
  assert.deepEqual(simple.cells.map(function (x) { return [x.col, x.row, x.winner[0], x.ties]; }),
    [[0, 0, "p", 0], [0, 1, "p", 0], [1, 0, "b", 1], [1, 1, "b", 0], [2, 0, "p", 0]]);

  var dragon = road("BBBBBBBBP");
  assert.deepEqual(dragon.cells.slice(4, 9).map(function (x) { return [x.col, x.row]; }), [[0, 4], [0, 5], [1, 5], [2, 5], [1, 0]],
    "the seventh and eighth Banker wins run right along the bottom; the next run starts in the next column");

  var blocked = road("BBBBBBBPPPPPPP");
  var players = blocked.cells.filter(function (x) { return x.winner === "player"; });
  assert.deepEqual(players.map(function (x) { return [x.col, x.row]; }), [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [2, 4], [3, 4]],
    "a run turns early where the dragon tail above it already sits");

  var leading = road("TTP");
  assert.equal(leading.cells[0].ties, 2, "ties before the first win are marked on it");
  assert.equal(road("TT").leadingTies, 2);
});

test("the tally counts wins, naturals and pairs", function () {
  var counts = Engine.tally([
    { winner: "player", natural: true, playerPair: false, bankerPair: false },
    { winner: "banker", natural: false, playerPair: true, bankerPair: true },
    { winner: "tie", natural: false, playerPair: false, bankerPair: false }
  ]);
  assert.deepEqual(counts, { player: 1, banker: 1, tie: 1, natural: 1, playerPair: 1, bankerPair: 1 });
});
