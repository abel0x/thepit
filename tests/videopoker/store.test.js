/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/videopoker/js/engine.js");
var Store = require("../../games/videopoker/js/store.js");
var helpers = require("../helpers/storage.js");

function hand(text) {
  return text.split(" ").map(Engine.fromCode);
}

var good = {
  id: "h1", bet: { denomination: 5, coins: 5 }, payTable: "eightFive", stake: 25,
  hand: ["AS", "KS", "QS", "JS", "9S"], draws: ["10S", "2D", "3C", "4H", "5D"], held: null, at: 7
};

test("the machine keeps its own data, the balance is the pit's", function () {
  assert.equal(Store.KEYS.bankroll, "pit.bankroll");
  assert.equal(Store.KEYS.round, "pit.videopoker.round");
  Object.keys(Store.KEYS).forEach(function (name) { assert.match(Store.KEYS[name], /^pit\.(videopoker\.)?/, name); });
});

test("settings, with the bet, fall back to the defaults field by field", function () {
  assert.deepEqual(Store.normalizeSettings(null), Store.DEFAULT_SETTINGS);
  assert.deepEqual(Store.DEFAULT_SETTINGS, { payTable: "nineSix", denomination: 5, coins: 5, animationSpeed: "normal", coach: false });
  var chosen = { payTable: "eightFive", denomination: 100, coins: 3, animationSpeed: "cinematic", coach: true };
  assert.deepEqual(Store.normalizeSettings(chosen), chosen);
  assert.deepEqual(Store.normalizeSettings({ payTable: "tenSeven", denomination: 2, coins: 6, animationSpeed: 2, coach: "yes" }), Store.DEFAULT_SETTINGS);
  assert.equal(Store.normalizeSettings({ coins: 2.5 }).coins, 5);
});

test("statistics stay whole and consistent", function () {
  var stats = Store.normalizeStats({ hands: 3, winningHands: 7, royalFlushes: 9, wagered: 10.9, bestHand: 40 });
  assert.equal(stats.winningHands, 3, "never more winning hands than hands");
  assert.equal(stats.royalFlushes, 3);
  assert.equal(stats.wagered, 10);
  assert.equal(stats.bestHand, Engine.CATEGORIES.length - 1);
});

test("a settled hand is recorded once, with its best hand", function () {
  var royal = Engine.settle({ denomination: 1, coins: 5 }, hand("AS KS QS JS 10S"), "nineSix");
  var stats = Store.recordHand(null, royal);
  assert.deepEqual(stats, { hands: 1, winningHands: 1, royalFlushes: 1, wagered: 5, returned: 4000, biggestWin: 3995, bestHand: 9 });
  var nothing = Engine.settle({ denomination: 1, coins: 5 }, hand("2C 4D 7H 9S 3H"), "nineSix");
  stats = Store.recordHand(stats, nothing);
  assert.equal(stats.hands, 2);
  assert.equal(stats.winningHands, 1);
  assert.equal(stats.bestHand, 9, "the best hand stays");
  assert.equal(stats.wagered, 10);
});

test("a hand is saved with its cards and its draw, and comes back only when everything agrees", function () {
  var round = Store.normalizeRound(good);
  assert.ok(round);
  assert.deepEqual(round.hand.map(Engine.code), good.hand);
  assert.deepEqual(round.draws.map(Engine.code), good.draws);
  assert.equal(round.payTable, "eightFive");
  assert.equal(round.held, null);
  var drawn = Object.assign({}, good, { held: [true, true, true, true, false] });
  assert.deepEqual(Store.normalizeRound(drawn).held, drawn.held);
  assert.deepEqual(Store.roundSnapshot(Store.normalizeRound(drawn)), drawn);

  [
    Object.assign({}, good, { id: "" }),
    Object.assign({}, good, { stake: 20 }),
    Object.assign({}, good, { bet: { denomination: 5, coins: 6 }, stake: 30 }),
    Object.assign({}, good, { bet: { denomination: 7, coins: 1 }, stake: 7 }),
    Object.assign({}, good, { payTable: "tenSeven" }),
    Object.assign({}, good, { payTable: undefined }),
    Object.assign({}, good, { draws: ["AS", "2D", "3C", "4H", "5D"] }),
    Object.assign({}, good, { hand: ["AS", "KS", "QS", "JS"] }),
    Object.assign({}, good, { hand: ["AS", "KS", "QS", "JS", "1S"] }),
    Object.assign({}, good, { held: [true, true, true, true] }),
    Object.assign({}, good, { held: "all" }),
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
  assert.ok(local.getItem("pit.videopoker.round"));
});
