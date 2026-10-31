/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/holdem/js/engine.js");
var Store = require("../../games/holdem/js/store.js");
var helpers = require("../helpers/storage.js");

var good = { id: "h1", bets: { ante: 10, aaBonus: 5 }, stake: 15, player: ["AS", "AD"], dealer: ["KC", "KH"], board: ["7S", "2H", "9C", "4D", "8H"], decision: null, at: 4 };

test("the table keeps its own data, the balance is the pit's", function () {
  assert.equal(Store.KEYS.bankroll, "pit.bankroll");
  assert.equal(Store.KEYS.round, "pit.holdem.round");
});

test("settings and statistics stay sound", function () {
  assert.deepEqual(Store.normalizeSettings({ animationSpeed: "fast" }), { animationSpeed: "fast" });
  assert.deepEqual(Store.normalizeSettings({ animationSpeed: 9 }), Store.DEFAULT_SETTINGS);
  var stats = Store.normalizeStats({ hands: 2, called: 5, folded: 5, noQualify: 9, aaWins: 9 });
  assert.deepEqual([stats.called, stats.folded, stats.noQualify, stats.aaWins], [2, 0, 2, 2]);
});

test("a settled hand is recorded once, with its best hand", function () {
  var round = Store.normalizeRound(Object.assign({}, good, { decision: "call", stake: 35 }));
  var settled = Engine.settle(round.bets, round, "call");
  var stats = Store.recordHand(null, settled);
  assert.deepEqual([stats.hands, stats.called, stats.aaWins, stats.wagered, stats.returned], [1, 1, 1, 35, settled.returned]);
  assert.equal(stats.bestHand, settled.player.score);
});

test("a hand comes back only when every part of it agrees", function () {
  assert.ok(Store.normalizeRound(good));
  var called = Object.assign({}, good, { decision: "call", stake: 35 });
  assert.deepEqual(Store.roundSnapshot(Store.normalizeRound(called)), Object.assign({}, called, { bets: { aaBonus: 5, ante: 10 } }));
  [
    Object.assign({}, good, { stake: 35 }),
    Object.assign({}, good, { decision: "call" }),
    Object.assign({}, good, { decision: "raise" }),
    Object.assign({}, good, { bets: { aaBonus: 5 }, stake: 5 }),
    Object.assign({}, good, { bets: { ante: 2000 }, stake: 2000 }),
    Object.assign({}, good, { board: ["7S", "2H", "9C", "4D"] }),
    Object.assign({}, good, { board: ["AS", "2H", "9C", "4D", "8H"] }),
    null
  ].forEach(function (value, index) {
    assert.equal(Store.normalizeRound(value), null, "case " + index);
  });
});

test("the account reads one balance with the rest of the pit", async function () {
  var local = helpers.memoryStorage();
  var account = Store.createAccount({ local: local, session: helpers.memoryStorage(), locks: helpers.fakeLocks() });
  await account.run(function () {
    account.write("bankroll", 500);
    account.write("round", good);
  });
  var snap = account.snapshot();
  assert.equal(snap.bankroll, 500);
  assert.equal(snap.round.board.length, 5);
});
