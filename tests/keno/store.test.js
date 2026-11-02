/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/keno/js/engine.js");
var Store = require("../../games/keno/js/store.js");
var helpers = require("../helpers/storage.js");

var BALLS = [3, 17, 22, 41, 5, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74];
var drawing = { id: "k1", picks: [3, 17, 80], bet: 10, races: [BALLS], at: 4 };
var OTHER = [80, 1, 2, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 23];

test("the machine keeps its own data, the balance is the pit's", function () {
  assert.equal(Store.KEYS.bankroll, "pit.bankroll");
  assert.equal(Store.KEYS.round, "pit.keno.round");
  Object.keys(Store.KEYS).forEach(function (name) { assert.match(Store.KEYS[name], /^pit\./, name); });
});

test("settings keep a real ticket and a bet the tray offers", function () {
  assert.deepEqual(Store.normalizeSettings(null), Store.DEFAULT_SETTINGS);
  assert.deepEqual(Store.normalizeSettings({ animationSpeed: "fast", bet: 25, picks: [40, 2, 9] }), { animationSpeed: "fast", bet: 25, races: 1, picks: [2, 9, 40] });
  assert.equal(Store.normalizeSettings({ races: 10 }).races, 10);
  assert.equal(Store.normalizeSettings({ races: 3 }).races, 1, "only the counts of draws offered");
  assert.deepEqual(Store.normalizeSettings({ animationSpeed: "warp", bet: 3, picks: [1, 1] }), Store.DEFAULT_SETTINGS);
  assert.deepEqual(Store.normalizeSettings({ picks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }).picks, []);
});

test("statistics stay whole and consistent", function () {
  var stats = Store.normalizeStats({ games: 2, winningGames: 5, bestCatch: 14, wagered: 3.9, biggestWin: -1 });
  assert.deepEqual(stats, { games: 2, winningGames: 2, wagered: 3, returned: 0, biggestWin: 0, bestCatch: 10 });
  var won = Engine.settle(drawing.picks, BALLS, 10);
  stats = Store.recordGame(null, won);
  // Two of three marks caught pay 2 for 1.
  assert.deepEqual(stats, { games: 1, winningGames: 1, wagered: 10, returned: 20, biggestWin: 10, bestCatch: 2 });
});

test("a game comes back only when every part of it agrees", function () {
  assert.deepEqual(Store.normalizeRound(drawing), drawing);
  assert.deepEqual(Store.roundSnapshot(Store.normalizeRound(drawing)), drawing);
  [
    Object.assign({}, drawing, { id: "" }),
    Object.assign({}, drawing, { picks: [] }),
    Object.assign({}, drawing, { picks: [3, 3] }),
    Object.assign({}, drawing, { bet: 7 }),
    Object.assign({}, drawing, { races: [BALLS.slice(1)] }),
    Object.assign({}, drawing, { races: [BALLS.slice(0, 19).concat([3])] }),
    Object.assign({}, drawing, { races: [BALLS.slice(0, 19).concat([81])] }),
    Object.assign({}, drawing, { races: [BALLS, OTHER] }),
    Object.assign({}, drawing, { races: [] }),
    Object.assign({}, drawing, { races: [BALLS, BALLS, BALLS, BALLS, BALLS.slice(1)] }),
    null, "x"
  ].forEach(function (value, index) {
    assert.equal(Store.normalizeRound(value), null, "case " + index);
  });
});

test("a ticket plays five, ten or twenty draws, saved together; a single draw saved as balls plays one", function () {
  var five = Object.assign({}, drawing, { races: [BALLS, OTHER, BALLS, OTHER, BALLS] });
  var round = Store.normalizeRound(five);
  assert.equal(round.races.length, 5);
  assert.equal(Store.roundStake(round), 50);
  var older = Store.normalizeRound({ id: "k0", picks: [3, 17, 80], bet: 10, balls: BALLS, at: 1 });
  assert.deepEqual(older.races, [BALLS]);
  var played = Engine.settleRaces(round.picks, round.races, round.bet);
  // Two of three caught pay 2 for 1 on each of the three BALLS draws; OTHER catches 80 alone.
  assert.deepEqual(played.games.map(function (game) { return game.hits; }), [2, 1, 2, 1, 2]);
  assert.deepEqual([played.stake, played.returned, played.net], [50, 60, 10]);
  var stats = played.games.reduce(function (next, game) { return Store.recordGame(next, game); }, null);
  assert.deepEqual([stats.games, stats.winningGames, stats.wagered, stats.returned], [5, 3, 50, 60]);
  assert.deepEqual(Engine.RACES, [1, 5, 10, 20]);
});

test("the account reads one balance with the rest of the pit", async function () {
  var local = helpers.memoryStorage();
  var account = Store.createAccount({ local: local, session: helpers.memoryStorage(), locks: helpers.fakeLocks() });
  await account.run(function () {
    account.write("bankroll", 900);
    account.write("round", drawing);
  });
  var snap = account.snapshot();
  assert.equal(snap.bankroll, 900);
  assert.equal(snap.round.id, "k1");
  assert.equal(JSON.parse(local.getItem("pit.bankroll")), 900);
});
