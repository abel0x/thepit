/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/fantan/js/engine.js");
var Store = require("../../games/fantan/js/store.js");
var helpers = require("../helpers/storage.js");

var good = { id: "f1", bets: { fan2: 25, nim21: 10, odd: 5 }, stake: 40, beads: 66, at: 3 };

test("the table keeps its own data, the balance is the pit's", function () {
  assert.equal(Store.KEYS.bankroll, "pit.bankroll");
  assert.equal(Store.KEYS.round, "pit.fantan.round");
  assert.equal(Store.KEYS.box, "pit.fantan.box");
  Object.keys(Store.KEYS).forEach(function (name) { assert.match(Store.KEYS[name], /^pit\.(fantan\.)?/, name); });
});

test("settings, statistics and the last results fall back to safe values", function () {
  assert.deepEqual(Store.normalizeSettings({ animationSpeed: "cinematic" }), { animationSpeed: "cinematic" });
  assert.deepEqual(Store.normalizeSettings({ animationSpeed: 3 }), Store.DEFAULT_SETTINGS);
  var stats = Store.normalizeStats({ rounds: 2, winningRounds: 5, wagered: 9.7, ones: -1 });
  assert.deepEqual([stats.rounds, stats.winningRounds, stats.wagered, stats.ones], [2, 2, 9, 0]);
  assert.deepEqual(Store.normalizeHistory([1, 5, "2", 4, 0, 3]), [1, 4, 3]);
  assert.deepEqual(Store.addHistory([2, 3], 4), [4, 2, 3]);
  assert.equal(Store.addHistory(Array(40).fill(1), 2).length, Store.HISTORY_LENGTH);
});

test("a settled round is recorded once, with what reached the balance", function () {
  // 66 beads leave a 2: the Fan wins, 2 Nim 1 wins, Odd loses.
  var settled = Engine.settle(good.bets, Engine.remainderOf(good.beads), 60);
  assert.equal(settled.result, 2);
  var stats = Store.recordRound(null, settled);
  assert.deepEqual(stats, { rounds: 1, winningRounds: 1, wagered: 40, returned: settled.paid, biggestWin: settled.paid - 40, ones: 0, twos: 1, threes: 0, fours: 0 });
});

test("a round is saved with its bets and its beads, and comes back only when everything agrees", function () {
  var round = Store.normalizeRound(good);
  assert.ok(round);
  assert.deepEqual(Store.roundSnapshot(round), { id: "f1", bets: { fan2: 25, odd: 5, nim21: 10 }, stake: 40, beads: 66, at: 3 });
  [
    Object.assign({}, good, { id: "" }),
    Object.assign({}, good, { stake: 41 }),
    Object.assign({}, good, { beads: 40 }),
    Object.assign({}, good, { beads: 105 }),
    Object.assign({}, good, { bets: {}, stake: 0 }),
    Object.assign({}, good, { bets: { fan5: 10 }, stake: 10 }),
    Object.assign({}, good, { bets: { fan1: 3000 }, stake: 3000 }),
    null, "x"
  ].forEach(function (value, index) {
    assert.equal(Store.normalizeRound(value), null, "case " + index);
  });
});

test("the account keeps the box and the round with the balance", async function () {
  var local = helpers.memoryStorage();
  var account = Store.createAccount({ local: local, session: helpers.memoryStorage(), locks: helpers.fakeLocks() });
  await account.run(function () {
    account.write("bankroll", 750);
    account.write("box", 90);
    account.write("round", good);
  });
  var snap = account.snapshot();
  assert.deepEqual([snap.bankroll, snap.box, snap.round.beads], [750, 90, 66]);
  assert.ok(local.getItem("pit.fantan.box"));
});
