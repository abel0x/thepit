/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/baccarat/js/engine.js");
var Store = require("../../games/baccarat/js/store.js");
var helpers = require("../helpers/storage.js");

function coup(ranks) {
  var cards = ranks.map(function (rank) { return Engine.card(rank, "♣"); });
  return Engine.playCoup(function () { return cards.shift(); });
}

var natural = coup(["9", "K", "Q", "5"]);
var good = { id: "c1", bets: { player: 25, tie: 5 }, stake: 30, rules: "classic", player: ["9C", "QC"], banker: ["KC", "5C"], at: 7 };

test("the table keeps its own data, the balance is the pit's", function () {
  assert.equal(Store.KEYS.bankroll, "pit.bankroll");
  assert.equal(Store.KEYS.round, "pit.baccarat.round");
  assert.equal(Store.KEYS.shoe, "pit.baccarat.shoe");
  assert.equal(Store.KEYS.box, "pit.baccarat.box", "the commission box is saved with the balance");
  Object.keys(Store.KEYS).forEach(function (name) { assert.match(Store.KEYS[name], /^pit\./, name); });
});

test("settings fall back to the defaults field by field", function () {
  assert.deepEqual(Store.normalizeSettings(null), Store.DEFAULT_SETTINGS);
  assert.deepEqual(Store.normalizeSettings({ rules: "noCommission", animationSpeed: "cinematic" }), { rules: "noCommission", animationSpeed: "cinematic" });
  assert.deepEqual(Store.normalizeSettings({ rules: "macao", animationSpeed: 2 }), Store.DEFAULT_SETTINGS);
});

test("statistics stay whole and consistent", function () {
  var stats = Store.normalizeStats({ coups: 3, playerWins: "2", wagered: 10.9, winningCoups: 9, biggestWin: -4 });
  assert.equal(stats.playerWins, 2);
  assert.equal(stats.wagered, 10);
  assert.equal(stats.winningCoups, 3, "never more winning coups than coups");
  assert.equal(stats.biggestWin, 0);
  var recorded = Store.recordCoup(null, natural, Engine.settle({ player: 25 }, natural, "classic"));
  assert.deepEqual(recorded, { coups: 1, playerWins: 1, bankerWins: 0, ties: 0, naturals: 1, wagered: 25, returned: 50, winningCoups: 1, biggestWin: 25 });
});

test("the scoreboard keeps only results that add up, and only one shoe's worth", function () {
  var results = [
    { winner: "player", player: 9, banker: 5, natural: true },
    { winner: "banker", player: 9, banker: 5 },
    { winner: "tie", player: 4, banker: 4, playerPair: true },
    { winner: "dragon", player: 1, banker: 0 },
    { winner: "tie", player: 10, banker: 10 },
    "player"
  ];
  var roads = Store.normalizeRoads(results);
  assert.deepEqual(roads.map(function (r) { return r.winner; }), ["player", "tie"]);
  assert.equal(roads[1].playerPair, true);
  var long = Array.from({ length: 120 }, function (_, i) { return { winner: "banker", player: 1, banker: 2 + (i % 7) }; });
  assert.equal(Store.normalizeRoads(long).length, Store.ROADS_LIMIT);
  assert.deepEqual(Store.normalizeRoads("roads"), []);
});

test("a saved shoe is kept card for card, or not at all", function () {
  var shoe = Engine.newShoe(function () { return 0.3; }).cards;
  var restored = Store.normalizeShoe(Store.shoeCodes(shoe));
  assert.equal(restored.length, shoe.length);
  assert.deepEqual(restored.map(Engine.code), shoe.map(Engine.code));
  assert.equal(Store.normalizeShoe(["AS", "XX"]), null);
  assert.equal(Store.normalizeShoe("AS"), null);
  assert.equal(Store.normalizeShoe(new Array(417).fill("AS")), null, "never more than eight decks");
  assert.deepEqual(Store.normalizeShoe([]), [], "an empty shoe is a shoe to replace, not an error");
});

test("a coup snapshot is trusted only when every part of it agrees", function () {
  var round = Store.normalizeRound(good);
  assert.equal(round.stake, 30);
  assert.equal(round.coup.winner, "player");
  assert.equal(round.coup.natural, true);
  assert.deepEqual(round.coup.order.map(function (o) { return o.side; }), ["player", "banker", "player", "banker"]);
  var broken = function (change) { return Store.normalizeRound(Object.assign({}, good, change)); };
  assert.equal(broken({ stake: 31 }), null, "the stake must add up");
  assert.equal(broken({ rules: "macao" }), null);
  assert.equal(broken({ id: "" }), null);
  assert.equal(broken({ bets: { player: 25, dragon: 5 }, stake: 30 }), null, "no unknown bets");
  assert.equal(broken({ bets: { tie: 5000 }, stake: 5000 }), null, "within the table limit");
  assert.equal(broken({ banker: ["KC", "5C", "2C"] }), null, "nobody draws after a natural");
  assert.equal(broken({ player: ["9C"] }), null);
  assert.equal(broken({ player: ["9C", "ZZ"] }), null);
  assert.equal(Store.normalizeRound(null), null);
});

test("a snapshot written at the deal reads back as the same coup", function () {
  var round = { id: "r9", bets: { banker: 100 }, stake: 100, rules: "noCommission", coup: coup(["2", "3", "3", "3", "K"]), at: 12 };
  var back = Store.normalizeRound(JSON.parse(JSON.stringify(Store.roundSnapshot(round))));
  assert.equal(back.coup.bankerTotal, 6);
  assert.equal(back.coup.winner, "banker");
  assert.deepEqual(Engine.settle(back.bets, back.coup, back.rules), Engine.settle(round.bets, round.coup, round.rules));
});

test("the account moves the balance, the shoe and the coup together", async function () {
  var local = helpers.memoryStorage();
  var account = Store.createAccount({ local: local, session: helpers.memoryStorage(), locks: helpers.fakeLocks() });
  assert.equal(account.shared, true);
  account.write("bankroll", 900);
  account.write("round", good);
  account.write("shoe", ["AS", "2H"]);
  local.setItem("pit.baccarat.roads", "[{\"winner\":\"banker\",\"player\":1,\"banker\":7},{\"winner\":\"x\"}]");
  var snap = account.snapshot();
  assert.equal(snap.bankroll, 900);
  assert.equal(snap.round.id, "c1");
  assert.equal(snap.shoe.length, 2);
  assert.equal(snap.roads.length, 1);
  assert.deepEqual(account.roundsElsewhere(), [], "its own round is not elsewhere");
  local.setItem("pit.roulette.round", "{\"id\":\"spin\"}");
  assert.deepEqual(account.roundsElsewhere(), ["roulette"]);

  var session = helpers.memoryStorage();
  var tab = Store.createAccount({ local: helpers.memoryStorage(), session: session, locks: undefined });
  tab.write("shoe", ["KD"]);
  tab.write("settings", { rules: "classic" });
  assert.equal(session.getItem("pit.session.baccarat.shoe"), "[\"KD\"]", "without Web Locks the shoe stays with the tab's balance");
  assert.equal(await tab.run(function () { return "ran"; }), "ran");
});

test("the commission box comes back as whole cents under a dollar, or empty", async function () {
  var helpers = require("../helpers/storage.js");
  var account = Store.createAccount({ local: helpers.memoryStorage(), session: helpers.memoryStorage(), locks: helpers.fakeLocks() });
  var seen = [];
  for (var value of [75, -50, 100, 2.5, "40", null]) {
    await account.run(function () { account.write("box", value); });
    seen.push(account.snapshot().box);
  }
  assert.deepEqual(seen, [75, -50, 0, 0, 40, 0], "a number written as text reads as that number, as bets do");
});
