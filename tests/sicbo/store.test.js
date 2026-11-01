/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/sicbo/js/engine.js");
var Store = require("../../games/sicbo/js/store.js");
var helpers = require("../helpers/storage.js");

var rolling = { id: "r1", bets: { small: 100, total10: 10, triple6: 5 }, dice: [4, 4, 2], wager: 115, at: 3 };

test("the table keeps its own data, the balance is the pit's", function () {
  assert.equal(Store.KEYS.bankroll, "pit.bankroll");
  assert.equal(Store.KEYS.round, "pit.sicbo.round");
  assert.equal(Store.KEYS.table, "pit.sicbo.table");
  Object.keys(Store.KEYS).forEach(function (name) { assert.match(Store.KEYS[name], /^pit\./, name); });
});

test("settings, statistics and the last rolls fall back field by field", function () {
  assert.deepEqual(Store.normalizeSettings({ animationSpeed: "fast" }), { animationSpeed: "fast" });
  assert.deepEqual(Store.normalizeSettings({ animationSpeed: "warp" }), Store.DEFAULT_SETTINGS);
  var stats = Store.normalizeStats({ rolls: 3, winningRolls: 9, triples: 7, wagered: 2.5, biggestWin: -4 });
  assert.deepEqual(stats, { rolls: 3, winningRolls: 3, triples: 3, wagered: 2, returned: 0, biggestWin: 0 });
  assert.deepEqual(Store.normalizeTable({ history: [[1, 2, 3], [1, 2], [0, 1, 1], "x", [6, 6, 6]] }), { history: [[1, 2, 3], [6, 6, 6]] });
  var long = [];
  for (var i = 0; i < 40; i++) long.push([1, 2, 3]);
  assert.equal(Store.normalizeTable({ history: long }).history.length, Store.HISTORY_LIMIT);
});

test("a roll is recorded with its stake, what it returned and any triple", function () {
  var won = Engine.resolve(rolling.bets, rolling.dice);
  var stats = Store.recordRoll(null, won);
  assert.deepEqual(stats, { rolls: 1, winningRolls: 1, triples: 0, wagered: 115, returned: 270, biggestWin: 155 });
  var triple = Engine.resolve({ small: 50 }, [2, 2, 2]);
  stats = Store.recordRoll(stats, triple);
  assert.deepEqual([stats.rolls, stats.winningRolls, stats.triples, stats.wagered, stats.returned, stats.biggestWin], [2, 1, 1, 165, 270, 155]);
});

test("a roll comes back only when every part of it agrees", function () {
  assert.deepEqual(Store.normalizeRound(rolling), rolling);
  assert.deepEqual(Store.roundSnapshot(Store.normalizeRound(rolling)), rolling);
  [
    Object.assign({}, rolling, { id: "" }),
    Object.assign({}, rolling, { bets: {}, wager: 0 }),
    Object.assign({}, rolling, { bets: { small: 100, nope: 5 }, wager: 105 }),
    Object.assign({}, rolling, { bets: { triple6: 500 }, wager: 500 }),
    Object.assign({}, rolling, { wager: 114 }),
    Object.assign({}, rolling, { dice: [4, 4] }),
    Object.assign({}, rolling, { dice: [4, 4, 7] }),
    Object.assign({}, rolling, { dice: null }),
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
    account.write("round", rolling);
    account.write("table", { history: [[1, 2, 3]] });
    account.write("lastBets", { big: 25, nope: 3 });
  });
  var snap = account.snapshot();
  assert.equal(snap.bankroll, 900);
  assert.equal(snap.round.id, "r1");
  assert.deepEqual(snap.table.history, [[1, 2, 3]]);
  assert.deepEqual(snap.lastBets, { big: 25 });
  assert.equal(JSON.parse(local.getItem("pit.bankroll")), 900);
});
