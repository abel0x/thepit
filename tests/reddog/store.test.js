/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/reddog/js/engine.js");
var Store = require("../../games/reddog/js/store.js");
var helpers = require("../helpers/storage.js");

function hand(text) {
  return text.split(" ").map(Engine.fromCode);
}

// A spread of 4 waiting for the decision.
var good = { id: "h1", bets: { ante: 25 }, stake: 25, cards: ["4S", "9D", "7C"], decision: null, at: 7 };

test("the table keeps its own data, the balance is the pit's", function () {
  assert.equal(Store.KEYS.bankroll, "pit.bankroll");
  assert.equal(Store.KEYS.round, "pit.reddog.round");
  Object.keys(Store.KEYS).forEach(function (name) { assert.match(Store.KEYS[name], /^pit\.(reddog\.)?/, name); });
});

test("settings fall back to the defaults field by field", function () {
  assert.deepEqual(Store.normalizeSettings(null), Store.DEFAULT_SETTINGS);
  assert.deepEqual(Store.normalizeSettings({ animationSpeed: "cinematic", coach: true }), { animationSpeed: "cinematic", coach: true });
  assert.deepEqual(Store.normalizeSettings({ animationSpeed: 2, coach: "yes" }), Store.DEFAULT_SETTINGS);
});

test("statistics stay whole and consistent", function () {
  var stats = Store.normalizeStats({ hands: 4, winningHands: 9, raised: 7, pushes: 3, trips: 6, wagered: 10.9, returned: -2 });
  assert.equal(stats.winningHands, 4, "never more wins than hands");
  assert.equal(stats.raised, 4);
  assert.equal(stats.pushes, 0, "a hand is a win or a push, not both");
  assert.equal(stats.trips, 4, "three of a kind is a win");
  assert.equal(stats.wagered, 10);
  assert.equal(stats.returned, 0);
});

test("a settled hand is recorded once", function () {
  var won = Engine.settle({ ante: 25 }, hand("2S AD 8H"), "raise");
  var stats = Store.recordHand(null, won);
  assert.deepEqual(stats, { hands: 1, winningHands: 1, raised: 1, pushes: 0, trips: 0, wagered: 50, returned: 100, biggestWin: 50 });
  stats = Store.recordHand(stats, Engine.settle({ ante: 10 }, hand("7S 8D 2H"), "call"));
  stats = Store.recordHand(stats, Engine.settle({ ante: 10 }, hand("QS QD QH"), null));
  stats = Store.recordHand(stats, Engine.settle({ ante: 10 }, hand("4S 9D KH"), "call"));
  assert.deepEqual(stats, { hands: 4, winningHands: 2, raised: 1, pushes: 1, trips: 1, wagered: 80, returned: 230, biggestWin: 110 });
});

test("a hand is saved with its three cards, and comes back only when everything agrees", function () {
  var round = Store.normalizeRound(good);
  assert.ok(round);
  assert.deepEqual(round.cards.map(Engine.code), ["4S", "9D", "7C"]);
  assert.equal(round.decision, null);
  assert.equal(Store.isDecided(round), false, "a spread waits for the player");
  var raised = Object.assign({}, good, { decision: "raise", stake: 50 });
  assert.equal(Store.normalizeRound(raised).decision, "raise");
  assert.equal(Store.isDecided(Store.normalizeRound(raised)), true);
  assert.deepEqual(Store.roundSnapshot(Store.normalizeRound(raised)), raised);
  var called = Object.assign({}, good, { decision: "call" });
  assert.equal(Store.normalizeRound(called).decision, "call");
  var pair = Store.normalizeRound(Object.assign({}, good, { cards: ["QS", "QD", "2C"] }));
  assert.equal(Store.isDecided(pair), true, "a pair needs no decision");
  assert.ok(Store.normalizeRound(Object.assign({}, good, { cards: ["AS", "AS", "AS"] })), "eight decks hold eight aces of spades");

  [
    Object.assign({}, good, { id: "" }),
    Object.assign({}, good, { stake: 50 }),
    Object.assign({}, good, { decision: "raise" }),
    Object.assign({}, good, { decision: "fold" }),
    Object.assign({}, good, { cards: ["7S", "8D", "2C"], decision: "call" }),
    Object.assign({}, good, { cards: ["QS", "QD", "2C"], decision: "raise", stake: 50 }),
    Object.assign({}, good, { bets: {}, stake: 0 }),
    Object.assign({}, good, { bets: { ante: 25, raise: 25 }, stake: 50 }),
    Object.assign({}, good, { bets: { ante: 5000 }, stake: 5000 }),
    Object.assign({}, good, { cards: ["4S", "9D"] }),
    Object.assign({}, good, { cards: ["4S", "9D", "1C"] }),
    null, "x"
  ].forEach(function (value, index) {
    assert.equal(Store.normalizeRound(value), null, "case " + index);
  });
});

test("the account reads one balance with the rest of the pit", async function () {
  var local = helpers.memoryStorage();
  var account = Store.createAccount({ local: local, session: helpers.memoryStorage(), locks: helpers.fakeLocks() });
  assert.equal(account.shared, true);
  await account.run(function () {
    account.write("bankroll", 750);
    account.write("round", good);
  });
  var snap = account.snapshot();
  assert.equal(snap.bankroll, 750);
  assert.equal(snap.round.id, "h1");
  assert.equal(JSON.parse(local.getItem("pit.bankroll")), 750);
  assert.ok(local.getItem("pit.reddog.round"));
});
