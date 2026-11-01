/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/bigsix/js/engine.js");
var Store = require("../../games/bigsix/js/store.js");
var helpers = require("../helpers/storage.js");

var spinning = { id: "w1", bets: { one: 100, joker: 5 }, segment: 0, wager: 105, at: 3 };

test("the table keeps its own data, the balance is the pit's", function () {
  assert.equal(Store.KEYS.bankroll, "pit.bankroll");
  assert.equal(Store.KEYS.round, "pit.bigsix.round");
  Object.keys(Store.KEYS).forEach(function (name) { assert.match(Store.KEYS[name], /^pit\./, name); });
});

test("settings, statistics and the last spins fall back field by field", function () {
  assert.deepEqual(Store.normalizeSettings({ animationSpeed: "cinematic" }), { animationSpeed: "cinematic" });
  assert.deepEqual(Store.normalizeSettings({ animationSpeed: 2 }), Store.DEFAULT_SETTINGS);
  var stats = Store.normalizeStats({ spins: 2, winningSpins: 4, jackpots: 9, wagered: 1.5 });
  assert.deepEqual(stats, { spins: 2, winningSpins: 2, jackpots: 2, wagered: 1, returned: 0, biggestWin: 0 });
  assert.deepEqual(Store.normalizeTable({ history: [0, 53, 54, -1, "2", 27] }), { history: [0, 53, 27] });
});

test("a spin is recorded with its stake, what it returned and any jackpot", function () {
  var joker = Engine.resolve(spinning.bets, 0);
  var stats = Store.recordSpin(null, joker);
  assert.deepEqual(stats, { spins: 1, winningSpins: 1, jackpots: 1, wagered: 105, returned: 205, biggestWin: 100 });
  var lost = Engine.resolve({ joker: 5 }, 2);
  stats = Store.recordSpin(stats, lost);
  assert.deepEqual([stats.spins, stats.winningSpins, stats.jackpots, stats.wagered], [2, 1, 1, 110]);
});

test("a spin comes back only when every part of it agrees", function () {
  assert.deepEqual(Store.normalizeRound(spinning), spinning);
  assert.deepEqual(Store.roundSnapshot(Store.normalizeRound(spinning)), spinning);
  [
    Object.assign({}, spinning, { id: "" }),
    Object.assign({}, spinning, { bets: {}, wager: 0 }),
    Object.assign({}, spinning, { bets: { one: 100, nope: 5 }, wager: 105 }),
    Object.assign({}, spinning, { bets: { joker: 500 }, wager: 500 }),
    Object.assign({}, spinning, { wager: 100 }),
    Object.assign({}, spinning, { segment: 54 }),
    Object.assign({}, spinning, { segment: null }),
    null, "x"
  ].forEach(function (value, index) {
    assert.equal(Store.normalizeRound(value), null, "case " + index);
  });
});

test("the account reads one balance with the rest of the pit", async function () {
  var local = helpers.memoryStorage();
  var account = Store.createAccount({ local: local, session: helpers.memoryStorage(), locks: helpers.fakeLocks() });
  await account.run(function () {
    account.write("bankroll", 900);
    account.write("round", spinning);
    account.write("lastBets", { two: 25, nope: 1 });
  });
  var snap = account.snapshot();
  assert.equal(snap.bankroll, 900);
  assert.equal(snap.round.id, "w1");
  assert.deepEqual(snap.lastBets, { two: 25 });
});
