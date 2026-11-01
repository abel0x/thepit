/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/slot/js/engine.js");
var Store = require("../../games/slot/js/store.js");
var helpers = require("../helpers/storage.js");

// Every reel stopped with its star in sight: a spin that starts the free spins.
var STARS = Engine.STRIPS.map(function (strip) { return (strip.indexOf("star") - 1 + strip.length) % strip.length; });
var FREE = [];
for (var i = 0; i < Engine.FREE_SPINS; i++) FREE.push([i, i, i, i, i]);
var plain = { id: "s1", lineBet: 5, stake: 100, stops: [0, 0, 0, 0, 0], free: null, at: 9 };
var feature = { id: "s2", lineBet: 1, stake: 20, stops: STARS, free: FREE, at: 9 };

test("the machine keeps its own data, the balance is the pit's", function () {
  assert.equal(Store.KEYS.bankroll, "pit.bankroll");
  assert.equal(Store.KEYS.round, "pit.slot.round");
  Object.keys(Store.KEYS).forEach(function (name) { assert.match(Store.KEYS[name], /^pit\./, name); });
});

test("settings keep a line bet and a symbol set the machine offers", function () {
  assert.deepEqual(Store.normalizeSettings(null), Store.DEFAULT_SETTINGS);
  assert.deepEqual(Store.normalizeSettings({ animationSpeed: "fast", lineBet: 25, symbolSet: "fruit" }),
    { animationSpeed: "fast", lineBet: 25, symbolSet: "fruit" });
  assert.deepEqual(Store.normalizeSettings({ animationSpeed: "warp", lineBet: 3, symbolSet: "veg" }), Store.DEFAULT_SETTINGS);
  assert.equal(Store.DEFAULT_SETTINGS.symbolSet, "classic", "the card letters stay the default");
  assert.deepEqual(Store.SYMBOL_SETS, ["classic", "fruit"]);
  Engine.LINE_BETS.forEach(function (bet) { assert.equal(Store.normalizeSettings({ lineBet: bet }).lineBet, bet); });
});

test("statistics stay whole and consistent", function () {
  var stats = Store.normalizeStats({ spins: 4, winningSpins: 9, features: 7, freeSpinsWon: 500, wagered: 3.7, biggestWin: -1 });
  assert.equal(stats.winningSpins, 4);
  assert.equal(stats.features, 4);
  assert.equal(stats.freeSpinsWon, 40);
  assert.equal(stats.wagered, 3);
  assert.equal(stats.biggestWin, 0);
});

test("a settled spin is recorded once, free spins and all", function () {
  var settled = Engine.settle(Store.normalizeRound(feature).spin, 1);
  var stats = Store.recordSpin(null, settled);
  assert.equal(stats.spins, 1);
  assert.equal(stats.features, 1);
  assert.equal(stats.freeSpinsWon, 10);
  assert.equal(stats.wagered, 20);
  assert.equal(stats.returned, settled.returned);
  assert.equal(stats.winningSpins, 1, "five stars always pay");
  var lost = Engine.settle({ stops: [0, 0, 0, 0, 0], free: null }, 5);
  stats = Store.recordSpin(stats, lost);
  assert.equal(stats.spins, 2);
  assert.equal(stats.wagered, 120);
});

test("a spin is saved with its free spins, and comes back only when everything agrees", function () {
  assert.ok(Store.normalizeRound(plain));
  var round = Store.normalizeRound(feature);
  assert.equal(round.spin.free.length, 10);
  assert.deepEqual(Store.roundSnapshot(round), feature);
  [
    Object.assign({}, plain, { id: "" }),
    Object.assign({}, plain, { lineBet: 3, stake: 60 }),
    Object.assign({}, plain, { stake: 99 }),
    Object.assign({}, plain, { stops: [0, 0, 0, 0, 32] }),
    Object.assign({}, plain, { stops: [0, 0, 0, 0] }),
    Object.assign({}, plain, { free: FREE }),
    Object.assign({}, feature, { free: null }),
    Object.assign({}, feature, { free: FREE.slice(1) }),
    null, "x"
  ].forEach(function (value, index) {
    assert.equal(Store.normalizeRound(value), null, "case " + index);
  });
});

test("the account reads one balance with the rest of the pit", async function () {
  var local = helpers.memoryStorage();
  var account = Store.createAccount({ local: local, session: helpers.memoryStorage(), locks: helpers.fakeLocks() });
  await account.run(function () {
    account.write("bankroll", 640);
    account.write("round", plain);
  });
  var snap = account.snapshot();
  assert.equal(snap.bankroll, 640);
  assert.equal(snap.round.id, "s1");
  assert.ok(local.getItem("pit.slot.round"));
});
