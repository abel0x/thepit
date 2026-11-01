/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Pit = require("../../shared/js/pit.js");
var helpers = require("../helpers/storage.js");
var memoryStorage = helpers.memoryStorage;
var fakeLocks = helpers.fakeLocks;

function account(options) {
  options = options || {};
  return Pit.createAccount({
    local: options.local || memoryStorage(),
    session: options.session || memoryStorage(),
    locks: "locks" in options ? options.locks : fakeLocks(),
    accountKeys: options.accountKeys
  });
}

test("every page shares one wallet key, one lock and one cloth key", function () {
  assert.equal(Pit.KEYS.bankroll, "pit.bankroll");
  assert.equal(Pit.KEYS.theme, "pit.theme");
  assert.equal(Pit.LOCK_NAME, "pit.account");
  assert.deepEqual(Object.keys(Pit.TABLES), ["blackjack", "roulette", "baccarat", "threecard", "slot", "craps", "holdem", "videopoker"]);
  assert.equal(Pit.TABLES.blackjack, "Table 21");
  assert.equal(Pit.TABLES.roulette, "Table 37");
  assert.equal(Pit.TABLES.baccarat, "Table 9");
  assert.equal(Pit.TABLES.threecard, "Table 3");
  assert.equal(Pit.TABLES.slot, "Slot 5");
  assert.equal(Pit.TABLES.craps, "Table 7");
  assert.equal(Pit.TABLES.holdem, "Table 2");
  assert.equal(Pit.TABLES.videopoker, "Poker 11");
});

test("each game keeps its own data under its own name", function () {
  assert.equal(Pit.gameKey("roulette", "stats"), "pit.roulette.stats");
  assert.equal(Pit.roundKey("blackjack"), "pit.blackjack.round");
  assert.equal(Pit.sessionKey("pit.bankroll"), "pit.session.bankroll");
  assert.equal(Pit.sessionKey(Pit.roundKey("roulette")), "pit.session.roulette.round");
  assert.equal(Pit.isPitKey("pit.roulette.history"), true);
  assert.equal(Pit.isPitKey("t37.bankroll"), false);
  assert.equal(Pit.isPitKey(null), false);
});

test("balances stay whole, non-negative and below the shared ceiling", function () {
  assert.equal(Pit.normalizeBankroll("12345.9"), 12345);
  assert.equal(Pit.normalizeBankroll(0), 0, "an empty wallet is a real balance, not a reset");
  assert.equal(Pit.normalizeBankroll(50), 50, "a balance below one table's minimum is kept for the others");
  assert.equal(Pit.normalizeBankroll(-5), Pit.START_BANKROLL);
  assert.equal(Pit.normalizeBankroll("abc"), Pit.START_BANKROLL);
  assert.equal(Pit.normalizeBankroll(null), 0);
  assert.equal(Pit.normalizeBankroll(undefined), Pit.START_BANKROLL);
  assert.equal(Pit.normalizeBankroll(1e20), Pit.MAX_BANKROLL);
  // Every table pays at most 35 to 1 on a stake it allows, so the ceiling
  // leaves exact integer arithmetic for any settlement on top of it.
  assert.ok(Number.isSafeInteger(Pit.MAX_BANKROLL * 64));
});

test("the cloth is one of five and falls back to emerald", function () {
  assert.deepEqual(Pit.THEMES, ["emerald", "midnight", "bordeaux", "onyx", "amethyst"]);
  Pit.THEMES.forEach(function (theme) {
    assert.equal(Pit.normalizeTheme(theme), theme);
    assert.match(Pit.THEME_COLORS[theme], /^#[0-9a-f]{6}$/);
  });
  assert.equal(Pit.normalizeTheme("neon"), "emerald");
  assert.equal(Pit.normalizeTheme("__proto__"), "emerald");

  var local = memoryStorage();
  assert.equal(Pit.readTheme(local), "emerald");
  Pit.writeTheme(local, "bordeaux");
  assert.equal(local.getItem("pit.theme"), "\"bordeaux\"");
  assert.equal(Pit.readTheme(local), "bordeaux");
  local.setItem("pit.theme", "{broken");
  assert.equal(Pit.readTheme(local), "emerald");
  assert.equal(Pit.readTheme(null), "emerald");
});

test("storage helpers survive missing, broken and full storage", function () {
  var local = memoryStorage();
  assert.equal(Pit.readJSON(local, "missing", 7), 7);
  Pit.writeJSON(local, "value", { a: 1 });
  assert.deepEqual(Pit.readJSON(local, "value", null), { a: 1 });
  local.setItem("broken", "{");
  assert.equal(Pit.readJSON(local, "broken", "fallback"), "fallback");
  assert.equal(Pit.readJSON(null, "value", 3), 3);
  var full = { setItem: function () { throw new Error("QuotaExceededError"); } };
  assert.doesNotThrow(function () { Pit.writeJSON(full, "value", 1); });
});

test("the account serializes every page of the pit with one Web Lock", async function () {
  var local = memoryStorage();
  var locks = fakeLocks();
  var table = account({ local: local, locks: locks });
  var lobby = account({ local: local, locks: locks });
  assert.equal(table.shared, true);
  table.write(Pit.KEYS.bankroll, 1000);

  var release;
  var round = table.run(function () {
    table.write(Pit.KEYS.bankroll, table.read(Pit.KEYS.bankroll, 0) - 100);
    return new Promise(function (resolve) { release = resolve; }).then(function () {
      table.write(Pit.KEYS.bankroll, table.read(Pit.KEYS.bankroll, 0) + 200);
      return "settled";
    });
  });
  await new Promise(function (resolve) { setTimeout(resolve, 5); });
  assert.equal(table.isHeld(), true);
  // The lobby gives up after its patience instead of interleaving writes.
  assert.deepEqual(await lobby.run(function () { lobby.write(Pit.KEYS.bankroll, 0); }, 20), { busy: true });
  assert.equal(local.getItem("pit.bankroll"), "900");
  release();
  assert.equal(await round, "settled");
  assert.equal(table.isHeld(), false);
  assert.equal(local.getItem("pit.bankroll"), "1100");

  // Queued work runs once the lock is free.
  var order = [];
  await Promise.all([
    table.run(function () { order.push("table"); return new Promise(function (resolve) { setTimeout(resolve, 10); }); }),
    lobby.run(function () { order.push("lobby"); }, 500)
  ]);
  assert.deepEqual(order, ["table", "lobby"]);
});

test("nested account work inside a held lock runs at once", async function () {
  var wallet = account();
  var inner = await wallet.run(function () {
    return wallet.run(function () { return "inner"; });
  });
  assert.equal(inner, "inner");
  assert.equal(wallet.isHeld(), false);
});

test("an error inside the account releases it", async function () {
  var wallet = account();
  await assert.rejects(wallet.run(function () { throw new Error("boom"); }), /boom/);
  assert.equal(wallet.isHeld(), false);
  await assert.rejects(wallet.run(function () { return Promise.reject(new Error("late")); }), /late/);
  assert.equal(wallet.isHeld(), false);
  assert.equal(await wallet.run(function () { return 5; }), 5);
});

test("without Web Locks each tab keeps its own wallet and rounds in sessionStorage", async function () {
  var local = memoryStorage();
  var session = memoryStorage();
  var wallet = account({ local: local, session: session, locks: undefined, accountKeys: ["pit.roulette.stats"] });
  assert.equal(wallet.shared, false);
  wallet.write(Pit.KEYS.bankroll, 500);
  wallet.write("pit.roulette.stats", { spins: 1 });
  wallet.write(Pit.roundKey("blackjack"), { id: "r" });
  wallet.write("pit.roulette.settings", { racetrack: true });
  assert.equal(local.getItem("pit.bankroll"), null);
  assert.equal(session.getItem("pit.session.bankroll"), "500");
  assert.equal(session.getItem("pit.session.roulette.stats"), "{\"spins\":1}");
  assert.equal(session.getItem("pit.session.blackjack.round"), "{\"id\":\"r\"}", "every table's round moves with the wallet");
  assert.equal(local.getItem("pit.roulette.settings"), "{\"racetrack\":true}", "settings are not part of the account");
  wallet.remove(Pit.KEYS.bankroll);
  assert.equal(session.getItem("pit.session.bankroll"), null);
  assert.equal(await wallet.run(function () { return "ran"; }), "ran");
});

test("a round left open at one table is visible to every other table", function () {
  var local = memoryStorage();
  var wallet = account({ local: local });
  assert.deepEqual(wallet.roundsElsewhere("roulette"), []);
  wallet.write(Pit.roundKey("blackjack"), { stake: 100 });
  assert.deepEqual(wallet.roundsElsewhere("roulette"), ["blackjack"]);
  assert.deepEqual(wallet.roundsElsewhere("blackjack"), [], "a table resumes its own round instead");
  assert.deepEqual(wallet.roundsElsewhere(null), ["blackjack"], "the lobby sees them all");
  wallet.write(Pit.roundKey("roulette"), { stake: 5 });
  assert.deepEqual(wallet.roundsElsewhere(null), ["blackjack", "roulette"]);
  local.setItem("pit.blackjack.round", "{broken");
  assert.deepEqual(wallet.roundsElsewhere("roulette"), [], "an unreadable snapshot is no round at all");
  // Callers with their own storage access pass a reader of the same shape.
  assert.deepEqual(Pit.roundsElsewhere(function (key) { return key === "pit.roulette.round" ? {} : null; }, "blackjack"), ["roulette"]);
});
