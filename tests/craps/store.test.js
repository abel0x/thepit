/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/craps/js/engine.js");
var Store = require("../../games/craps/js/store.js");
var helpers = require("../helpers/storage.js");

var standing = { id: "r1", point: 6, bets: { pass: 10, passOdds: 50, come4: 10, place8: 12 }, roll: null, wager: 0, at: 3 };
var rolling = { id: "r2", point: null, made: [], bets: { pass: 25, field: 5 }, roll: { dice: [3, 4] }, wager: 30, at: 3 };

test("the table keeps its own data, the balance is the pit's", function () {
  assert.equal(Store.KEYS.bankroll, "pit.bankroll");
  assert.equal(Store.KEYS.round, "pit.craps.round");
  assert.equal(Store.KEYS.table, "pit.craps.table");
});

test("settings, statistics and the puck fall back field by field", function () {
  assert.deepEqual(Store.normalizeSettings({ animationSpeed: "cinematic" }), { animationSpeed: "cinematic" });
  assert.deepEqual(Store.normalizeSettings({ animationSpeed: 3 }), Store.DEFAULT_SETTINGS);
  var stats = Store.normalizeStats({ rolls: 2, pointsMade: 5, sevenOuts: 9, wagered: 1.5 });
  assert.deepEqual([stats.pointsMade, stats.sevenOuts, stats.wagered], [2, 2, 1]);
  assert.deepEqual(Store.normalizeTable({ point: 7, history: [[1, 2], [0, 3], "x", [6, 6]] }), { point: null, history: [[1, 2], [6, 6]], made: [] });
  assert.deepEqual(Store.normalizeTable({ point: 6, history: [], made: [4, 4, 7, 10, "9"] }).made, [4, 10], "only real points, each once");
  var long = [];
  for (var i = 0; i < 40; i++) long.push([1, 1]);
  assert.equal(Store.normalizeTable({ point: 8, history: long }).history.length, Store.HISTORY_LIMIT);
});

test("a roll is recorded with the new money it put down", function () {
  var made = Engine.resolve({ point: 6, bets: { pass: 10, passOdds: 50 } }, [3, 3]);
  var stats = Store.recordRoll(null, made, 60);
  assert.deepEqual(stats, { rolls: 1, pointsMade: 1, sevenOuts: 0, wagered: 60, returned: 120, biggestWin: 70 });
  var out = Engine.resolve({ point: 6, bets: { pass: 10 } }, [3, 4]);
  stats = Store.recordRoll(stats, out, 0);
  assert.equal(stats.sevenOuts, 1);
  assert.equal(stats.rolls, 2);
});

test("a layout comes back only when the rules could have made it", function () {
  assert.deepEqual(Store.normalizeRound(standing).bets, standing.bets);
  assert.deepEqual(Store.normalizeRound(rolling).roll, { dice: [3, 4] });
  assert.deepEqual(Store.roundSnapshot(Store.normalizeRound(rolling)), rolling);
  [
    Object.assign({}, standing, { id: "" }),
    Object.assign({}, standing, { point: 7 }),
    Object.assign({}, standing, { bets: { pass: 10, passOdds: 51 } }),
    Object.assign({}, standing, { point: null, bets: { pass: 10, passOdds: 20 } }),
    Object.assign({}, standing, { point: null, bets: { come: 10 } }),
    Object.assign({}, standing, { bets: { pass: 10, nope: 5 } }),
    Object.assign({}, standing, { bets: {} }),
    Object.assign({}, rolling, { roll: { dice: [0, 4] } }),
    Object.assign({}, rolling, { roll: { dice: [3] } }),
    Object.assign({}, rolling, { made: [4, 4] }),
    Object.assign({}, rolling, { made: [7] }),
    Object.assign({}, rolling, { made: "4" }),
    null, "x"
  ].forEach(function (value, index) {
    assert.equal(Store.normalizeRound(value), null, "case " + index);
  });
  assert.ok(Store.normalizeRound(Object.assign({}, rolling, { bets: {} })), "a roll with no bets left is still a roll");
});

test("the account reads one balance with the rest of the pit", async function () {
  var local = helpers.memoryStorage();
  var account = Store.createAccount({ local: local, session: helpers.memoryStorage(), locks: helpers.fakeLocks() });
  await account.run(function () {
    account.write("bankroll", 900);
    account.write("round", standing);
    account.write("table", { point: 6, history: [[2, 4]] });
  });
  var snap = account.snapshot();
  assert.equal(snap.bankroll, 900);
  assert.equal(snap.round.id, "r1");
  assert.equal(snap.table.point, 6);
});
