/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/threecard/js/engine.js");
var Store = require("../../games/threecard/js/store.js");
var helpers = require("../helpers/storage.js");

function hand(text) {
  return text.split(" ").map(Engine.fromCode);
}

var good = { id: "h1", bets: { ante: 25, pairPlus: 10 }, payTable: "lowFlush", stake: 35, player: ["KS", "KD", "4C"], dealer: ["QS", "8D", "3C"], decision: null, at: 7 };

test("the table keeps its own data, the balance is the pit's", function () {
  assert.equal(Store.KEYS.bankroll, "pit.bankroll");
  assert.equal(Store.KEYS.round, "pit.threecard.round");
  Object.keys(Store.KEYS).forEach(function (name) { assert.match(Store.KEYS[name], /^pit\.(threecard\.)?/, name); });
});

test("settings fall back to the defaults field by field", function () {
  assert.deepEqual(Store.normalizeSettings(null), Store.DEFAULT_SETTINGS);
  assert.deepEqual(Store.normalizeSettings({ payTable: "lowFlush", animationSpeed: "cinematic", coach: true }),
    { payTable: "lowFlush", animationSpeed: "cinematic", coach: true });
  assert.deepEqual(Store.normalizeSettings({ payTable: "high", animationSpeed: 2, coach: "yes" }), Store.DEFAULT_SETTINGS);
  assert.equal(Store.DEFAULT_SETTINGS.payTable, "standard");
});

test("statistics stay whole and consistent", function () {
  var stats = Store.normalizeStats({ hands: 3, played: 9, folded: 2, winningHands: 7, noQualify: 8, pairPlusWins: 5, wagered: 10.9, bestHand: -4 });
  assert.equal(stats.played, 3, "never more played than dealt");
  assert.equal(stats.folded, 0, "played and folded add up to at most the hands");
  assert.equal(stats.winningHands, 3);
  assert.equal(stats.noQualify, 3);
  assert.equal(stats.wagered, 10);
  assert.equal(stats.bestHand, 0);
});

test("a settled hand is recorded once, with its best hand", function () {
  var won = Engine.settle({ ante: 25, pairPlus: 10 }, hand("KS KD 4C"), hand("QS 8D 3C"), "play");
  var stats = Store.recordHand(null, won);
  assert.deepEqual(stats, { hands: 1, played: 1, folded: 0, winningHands: 1, noQualify: 0, pairPlusWins: 1, sixCardWins: 0, wagered: 60, returned: 120, biggestWin: 60, bestHand: won.player.score });
  var folded = Engine.settle({ ante: 25 }, hand("2S 5D 9C"), hand("QS 8D 3C"), "fold");
  stats = Store.recordHand(stats, folded);
  assert.equal(stats.hands, 2);
  assert.equal(stats.folded, 1);
  assert.equal(stats.bestHand, won.player.score, "the best hand stays");
  assert.equal(stats.wagered, 85);
});

test("a hand is saved with its cards, and comes back only when everything agrees", function () {
  var round = Store.normalizeRound(good);
  assert.ok(round);
  assert.deepEqual(round.player.map(Engine.code), ["KS", "KD", "4C"]);
  assert.equal(round.decision, null);
  var played = Object.assign({}, good, { decision: "play", stake: 60 });
  assert.equal(Store.normalizeRound(played).decision, "play");
  assert.deepEqual(Store.roundSnapshot(Store.normalizeRound(played)), Object.assign({}, played, { bets: { pairPlus: 10, ante: 25 } }));
  assert.equal(round.payTable, "lowFlush", "the hand keeps the pay table it was dealt under");
  var older = Object.assign({}, good);
  delete older.payTable;
  assert.equal(Store.normalizeRound(older).payTable, "standard", "a hand saved before the choice was dealt under the standard table");

  [
    Object.assign({}, good, { id: "" }),
    Object.assign({}, good, { stake: 60 }),
    Object.assign({}, good, { decision: "play" }),
    Object.assign({}, good, { decision: "raise" }),
    Object.assign({}, good, { payTable: "high" }),
    Object.assign({}, good, { bets: { pairPlus: 10 }, stake: 10 }),
    Object.assign({}, good, { bets: { ante: 25, play: 25 }, stake: 50 }),
    Object.assign({}, good, { bets: { ante: 5000, pairPlus: 10 }, stake: 5010 }),
    Object.assign({}, good, { dealer: ["KS", "8D", "3C"] }),
    Object.assign({}, good, { player: ["KS", "KD"] }),
    Object.assign({}, good, { player: ["KS", "KD", "1C"] }),
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
  assert.ok(local.getItem("pit.threecard.round"));
});
