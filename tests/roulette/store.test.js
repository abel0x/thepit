/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/roulette/js/engine.js");
var Store = require("../../games/roulette/js/store.js");

var helpers = require("../helpers/storage.js");
var memoryStorage = helpers.memoryStorage;
var fakeLocks = helpers.fakeLocks;

test("settings fall back to defaults field by field", function () {
  assert.deepEqual(Store.normalizeSettings(null), Store.DEFAULT_SETTINGS);
  assert.deepEqual(Store.normalizeSettings({ theme: "bordeaux", profile: "french", animationSpeed: "fast", neighbours: 9, racetrack: false }),
    { theme: "bordeaux", profile: "french", animationSpeed: "fast", neighbours: 9, racetrack: false });
  assert.deepEqual(Store.normalizeSettings({ theme: "neon", profile: "american", animationSpeed: 3, neighbours: 12 }), Store.DEFAULT_SETTINGS);
  assert.equal(Store.normalizeSettings({ neighbours: "4" }).neighbours, 4);
});

test("balances stay whole, non-negative and below the table's ceiling", function () {
  assert.equal(Store.normalizeBankroll("12345.9"), 12345);
  assert.equal(Store.normalizeBankroll(0), 0);
  assert.equal(Store.normalizeBankroll(-5), Store.START_BANKROLL);
  assert.equal(Store.normalizeBankroll("abc"), Store.START_BANKROLL);
  assert.equal(Store.normalizeBankroll(1e20), Store.MAX_BANKROLL);
});

test("statistics and history are sanitized", function () {
  assert.deepEqual(Store.normalizeStats({ spins: 3, wagered: 100.7, returned: -4, winningSpins: 9, biggestWin: "50" }),
    { spins: 3, wagered: 100, returned: 0, winningSpins: 3, biggestWin: 50 });
  assert.deepEqual(Store.normalizeHistory([1, "2", 37, -1, 0, 36, 4.5]), [1, 0, 36]);
  var long = Array.from({ length: 600 }, function (_, i) { return i % 37; });
  assert.equal(Store.normalizeHistory(long).length, Store.HISTORY_LIMIT);
  assert.equal(Store.normalizeHistory(long)[0], long[100]);
});

test("a spin snapshot is trusted only when every part agrees", function () {
  var good = { id: "a1", bets: { red: 25, "straight:17": 5 }, stake: 30, result: 17, profile: "european", at: 5 };
  assert.deepEqual(Store.normalizeRound(good), good);
  assert.equal(Store.normalizeRound(Object.assign({}, good, { stake: 31 })), null, "stake must match the bets");
  assert.equal(Store.normalizeRound(Object.assign({}, good, { result: 37 })), null);
  assert.equal(Store.normalizeRound(Object.assign({}, good, { profile: "american" })), null);
  assert.equal(Store.normalizeRound(Object.assign({}, good, { id: "" })), null);
  assert.equal(Store.normalizeRound(Object.assign({}, good, { bets: { red: 25, "straight:99": 5 } })), null, "no unknown bets");
  assert.equal(Store.normalizeRound(Object.assign({}, good, { bets: {}, stake: 0 })), null);
  assert.equal(Store.normalizeRound("round"), null);
});

test("recordSpin adds the stake, the return and the biggest win", function () {
  var stats = Store.recordSpin(null, { stake: 100, returned: 360, net: 260 });
  stats = Store.recordSpin(stats, { stake: 50, returned: 0, net: -50 });
  stats = Store.recordSpin(stats, { stake: 40, returned: 40, net: 0 });
  assert.deepEqual(stats, { spins: 3, wagered: 190, returned: 400, winningSpins: 1, biggestWin: 260 });
});

test("bet limits follow the straight-up maximum", function () {
  assert.equal(Store.betLimit("straight:5"), Store.STRAIGHT_MAX);
  assert.equal(Store.betLimit("corner:1-2-4-5"), 4 * Store.STRAIGHT_MAX);
  assert.equal(Store.betLimit("black"), 20 * Store.STRAIGHT_MAX);
  // The worst case of maximum bets everywhere still settles in safe integers.
  var bets = {};
  Engine.BET_LIST.forEach(function (bet) { bets[bet.key] = Store.betLimit(bet.key); });
  for (var n = 0; n <= 36; n++) {
    var settlement = Engine.settle(bets, n);
    assert.ok(Number.isSafeInteger(settlement.returned + Store.MAX_BANKROLL));
  }
});

test("the account serializes tabs with Web Locks", async function () {
  var local = memoryStorage();
  var locks = fakeLocks();
  var tabA = Store.createAccount({ local: local, session: memoryStorage(), locks: locks });
  var tabB = Store.createAccount({ local: local, session: memoryStorage(), locks: locks });
  assert.equal(tabA.shared, true);
  tabA.write("bankroll", 1000);
  var release;
  var spinning = tabA.run(function () {
    tabA.write("bankroll", tabA.read("bankroll", 0) - 100);
    return new Promise(function (resolve) { release = resolve; }).then(function () {
      tabA.write("bankroll", tabA.read("bankroll", 0) + 360);
      return "settled";
    });
  });
  await new Promise(function (resolve) { setTimeout(resolve, 5); });
  assert.equal(tabA.isHeld(), true);
  // The other tab gives up after its patience instead of interleaving writes.
  var busy = await tabB.run(function () { tabB.write("bankroll", 0); }, 20);
  assert.deepEqual(busy, { busy: true });
  assert.equal(local.getItem("pit.bankroll"), "900");
  release();
  assert.equal(await spinning, "settled");
  assert.equal(tabA.isHeld(), false);
  assert.equal(local.getItem("pit.bankroll"), "1260");
  // Queued work runs once the lock is free.
  var order = [];
  await Promise.all([
    tabA.run(function () { order.push("a"); return new Promise(function (r) { setTimeout(r, 10); }); }),
    tabB.run(function () { order.push("b"); }, 500)
  ]);
  assert.deepEqual(order, ["a", "b"]);
});

test("an error inside the account releases it", async function () {
  var account = Store.createAccount({ local: memoryStorage(), session: memoryStorage(), locks: fakeLocks() });
  await assert.rejects(account.run(function () { throw new Error("boom"); }), /boom/);
  assert.equal(account.isHeld(), false);
  assert.equal(await account.run(function () { return 5; }), 5);
});

test("without Web Locks each tab keeps a separate session balance", async function () {
  var local = memoryStorage();
  var session = memoryStorage();
  var account = Store.createAccount({ local: local, session: session, locks: undefined });
  assert.equal(account.shared, false);
  account.write("bankroll", 500);
  account.write("settings", { theme: "midnight" });
  assert.equal(local.getItem("pit.bankroll"), null);
  assert.equal(session.getItem("pit.session.bankroll"), "500");
  assert.equal(local.getItem("pit.roulette.settings"), JSON.stringify({ theme: "midnight" }));
  assert.equal(await account.run(function () { return "ran"; }), "ran");
});

test("a snapshot reads every account value through the normalizers", function () {
  var local = memoryStorage();
  var account = Store.createAccount({ local: local, session: memoryStorage(), locks: fakeLocks() });
  local.setItem("pit.bankroll", "\"77\"");
  local.setItem("pit.roulette.history", "[1, 99, 2]");
  local.setItem("pit.roulette.round", "{broken");
  var snap = account.snapshot();
  assert.equal(snap.bankroll, 77);
  assert.deepEqual(snap.history, [1, 2]);
  assert.equal(snap.round, null);
  assert.equal(snap.roundPresent, false, "unparseable JSON reads as absent");
  local.setItem("pit.roulette.round", JSON.stringify({ id: "x" }));
  assert.equal(account.snapshot().roundPresent, true);
  assert.equal(account.snapshot().round, null);
});

test("round ids are unique enough for one browser", function () {
  var ids = {};
  for (var i = 0; i < 500; i++) ids[Store.newRoundId()] = true;
  assert.equal(Object.keys(ids).length, 500);
});
