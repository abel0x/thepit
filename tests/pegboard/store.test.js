/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/pegboard/js/engine.js");
var Store = require("../../games/pegboard/js/store.js");
var helpers = require("../helpers/storage.js");

// Five balls on the 8-row board, saved before the first one fell.
var good = { id: "d1", bet: 50, rows: 8, risk: "high", paths: ["LLLLLLLL", "LRLRLRLR", "RRRRRRRL", "LLRLLRLL", "RLRRRLRR"], stake: 250, at: 9 };

test("the machine keeps its own data, the balance is the pit's", function () {
  assert.equal(Store.KEYS.bankroll, "pit.bankroll");
  assert.equal(Store.KEYS.round, "pit.pegboard.round");
  Object.keys(Store.KEYS).forEach(function (name) { assert.match(Store.KEYS[name], /^pit\.(pegboard\.)?/, name); });
});

test("settings fall back to the defaults field by field", function () {
  assert.deepEqual(Store.normalizeSettings(null), Store.DEFAULT_SETTINGS);
  assert.deepEqual(Store.normalizeSettings({ rows: 16, risk: "high", balls: 20, bet: 500, animationSpeed: "fast" }),
    { rows: 16, risk: "high", balls: 20, bet: 500, animationSpeed: "fast" });
  assert.deepEqual(Store.normalizeSettings({ rows: 10, risk: "wild", balls: 3, bet: 25, animationSpeed: 1 }), Store.DEFAULT_SETTINGS);
});

test("statistics stay whole and consistent", function () {
  var stats = Store.normalizeStats({ rounds: 9, drops: 4, winningDrops: 7, wagered: 10.9, bestMultiplier: -3 });
  assert.equal(stats.rounds, 4, "never more rounds than balls");
  assert.equal(stats.winningDrops, 4);
  assert.equal(stats.wagered, 10);
  assert.equal(stats.bestMultiplier, 0);
});

test("a settled drop is recorded once, its multiples kept newest first", function () {
  var round = Engine.settle(50, 8, "high", good.paths);
  var stats = Store.recordRound(null, round);
  // The slots 0, 4, 7, 2 and 6 of the 8-row high board: 32, 0.2, 4, 1.3 and 1.3.
  assert.deepEqual(round.balls.map(function (ball) { return ball.multiplier; }), [32, 0.2, 4, 1.3, 1.3]);
  assert.deepEqual(stats, { rounds: 1, drops: 5, winningDrops: 4, wagered: 250, returned: 1940, biggestWin: 1690, bestMultiplier: 320 });
  var history = Store.addHistory([5, 2], round);
  assert.deepEqual(history, [13, 13, 40, 2, 320, 5, 2]);
  assert.equal(Store.addHistory(Array(30).fill(10), round).length, Store.HISTORY_LENGTH);
  assert.deepEqual(Store.normalizeHistory([10, -1, 2.5, "x", 40]), [10, 40]);
});

test("a drop is saved with every path, and comes back only when everything agrees", function () {
  var round = Store.normalizeRound(good);
  assert.ok(round);
  assert.deepEqual(round.paths, good.paths);
  assert.deepEqual(Store.roundSnapshot(round), good);
  [
    Object.assign({}, good, { id: "" }),
    Object.assign({}, good, { stake: 200 }),
    Object.assign({}, good, { bet: 25, stake: 125 }),
    Object.assign({}, good, { rows: 10 }),
    Object.assign({}, good, { risk: "wild" }),
    Object.assign({}, good, { paths: good.paths.slice(0, 3), stake: 150 }),
    Object.assign({}, good, { paths: ["LLLL", "RRRR", "LRLR", "RLRL", "LLRR"] }),
    Object.assign({}, good, { paths: ["LLLLLLLX", "LRLRLRLR", "RRRRRRRL", "LLRLLRLL", "RLRRRLRR"] }),
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
    account.write("history", [10, 320]);
  });
  var snap = account.snapshot();
  assert.equal(snap.bankroll, 750);
  assert.equal(snap.round.id, "d1");
  assert.deepEqual(snap.history, [10, 320]);
  assert.ok(local.getItem("pit.pegboard.round"));
});
