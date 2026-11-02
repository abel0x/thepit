/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 18 — saved state
   Settings, statistics, the last rolls and the bets of a roll in
   progress, all kept in the browser. A round is open only from the
   moment the dice are thrown until the roll is paid. The balance is
   the pit's shared wallet (shared/js/pit.js).
   Normalizers are pure (tested in Node). Exposed as
   window.SicBoStore and CommonJS.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var engine = root && root.SicBoEngine;
  if (!engine && typeof require === "function") engine = require("./engine.js");
  var pit = root && root.Pit;
  if (!pit && typeof require === "function") pit = require("../../../shared/js/pit.js");
  var api = factory(engine, pit);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SicBoStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine, Pit) {
  "use strict";

  var GAME = "sicbo";
  var KEYS = {
    bankroll: Pit.KEYS.bankroll,
    stats: Pit.gameKey(GAME, "stats"),
    settings: Pit.gameKey(GAME, "settings"),
    table: Pit.gameKey(GAME, "table"),
    lastBets: Pit.gameKey(GAME, "lastBets"),
    round: Pit.roundKey(GAME),
    sound: Pit.gameKey(GAME, "sound"),
    audio: Pit.gameKey(GAME, "audio")
  };
  // Everything that changes together with the balance.
  var ACCOUNT_KEYS = ["bankroll", "stats", "table", "lastBets", "round"];

  var SPEEDS = ["fast", "normal", "cinematic"];
  var DEFAULT_SETTINGS = { animationSpeed: "normal" };
  var DEFAULT_STATS = { rolls: 0, winningRolls: 0, triples: 0, wagered: 0, returned: 0, biggestWin: 0 };
  // The last rolls the table remembers, for its history strip and its
  // statistics.
  var HISTORY_LIMIT = 500;

  function safeCount(value) {
    value = Math.floor(Number(value));
    return isFinite(value) && value >= 0 ? Math.min(value, Number.MAX_SAFE_INTEGER) : 0;
  }

  function normalizeSettings(value) {
    value = value && typeof value === "object" ? value : {};
    return { animationSpeed: SPEEDS.indexOf(value.animationSpeed) !== -1 ? value.animationSpeed : DEFAULT_SETTINGS.animationSpeed };
  }

  function normalizeStats(value) {
    value = value && typeof value === "object" ? value : {};
    var stats = {};
    Object.keys(DEFAULT_STATS).forEach(function (key) { stats[key] = safeCount(value[key]); });
    stats.winningRolls = Math.min(stats.winningRolls, stats.rolls);
    stats.triples = Math.min(stats.triples, stats.rolls);
    return stats;
  }

  // The last rolls, oldest first.
  function normalizeTable(value) {
    value = value && typeof value === "object" ? value : {};
    var history = Array.isArray(value.history) ? value.history.filter(Engine.isDice).slice(-HISTORY_LIMIT) : [];
    return { history: history };
  }

  // What is saved once the dice are thrown: the bets, the dice and the money
  // the roll took from the balance.
  function roundSnapshot(round) {
    return { id: round.id, bets: round.bets, dice: round.dice, wager: round.wager, at: round.at };
  }

  // A round is trusted only when every part of it agrees: real bets within
  // the table limits, real dice, and a wager that is exactly the bets.
  function normalizeRound(value) {
    if (!value || typeof value !== "object") return null;
    if (typeof value.id !== "string" || !value.id) return null;
    var bets = Engine.normalizeBets(value.bets);
    if (!Object.keys(bets).length || Object.keys(bets).length !== Object.keys(value.bets || {}).length) return null;
    if (!Engine.isLegalLayout(bets)) return null;
    if (!Engine.isDice(value.dice)) return null;
    if (value.wager !== Engine.totalStake(bets)) return null;
    return { id: value.id, bets: bets, dice: value.dice.slice(), wager: value.wager, at: safeCount(value.at) };
  }

  // Applies a settled roll to the statistics.
  function recordRoll(stats, result) {
    var next = normalizeStats(stats);
    next.rolls += 1;
    if (result.returned > 0) next.winningRolls += 1;
    if (result.triple) next.triples += 1;
    next.wagered = Math.min(Number.MAX_SAFE_INTEGER, next.wagered + result.stake);
    next.returned = Math.min(Number.MAX_SAFE_INTEGER, next.returned + result.returned);
    next.biggestWin = Math.max(next.biggestWin, result.returned - result.stake);
    return next;
  }

  /* ---------------- The account ---------------- */
  // The shared wallet account (shared/js/pit.js), addressed by this table's
  // short names. env: { local, session, locks }.
  function createAccount(env) {
    env = env || {};
    var account = Pit.createAccount({
      local: env.local,
      session: env.session,
      locks: env.locks,
      accountKeys: ACCOUNT_KEYS.map(function (name) { return KEYS[name]; })
    });

    function read(name, fallback) { return account.read(KEYS[name], fallback); }
    function write(name, value) { account.write(KEYS[name], value); }
    function remove(name) { account.remove(KEYS[name]); }

    function snapshot() {
      var round = read("round", null);
      return {
        bankroll: Pit.normalizeBankroll(read("bankroll", Pit.START_BANKROLL)),
        stats: normalizeStats(read("stats", DEFAULT_STATS)),
        table: normalizeTable(read("table", null)),
        lastBets: Engine.normalizeBets(read("lastBets", {})),
        round: normalizeRound(round),
        roundPresent: round != null
      };
    }

    return {
      shared: account.shared,
      read: read,
      write: write,
      remove: remove,
      snapshot: snapshot,
      run: account.run,
      isHeld: account.isHeld,
      roundsElsewhere: function () { return account.roundsElsewhere(GAME); }
    };
  }

  function newRoundId() {
    return Date.now().toString(36) + "-" + Math.floor(Math.random() * 0x100000000).toString(36);
  }

  return {
    GAME: GAME,
    KEYS: KEYS,
    SPEEDS: SPEEDS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    DEFAULT_STATS: DEFAULT_STATS,
    HISTORY_LIMIT: HISTORY_LIMIT,
    START_BANKROLL: Pit.START_BANKROLL,
    MAX_BANKROLL: Pit.MAX_BANKROLL,
    normalizeBankroll: Pit.normalizeBankroll,
    normalizeSettings: normalizeSettings,
    normalizeStats: normalizeStats,
    normalizeTable: normalizeTable,
    normalizeRound: normalizeRound,
    roundSnapshot: roundSnapshot,
    recordRoll: recordRoll,
    readJSON: Pit.readJSON,
    writeJSON: Pit.writeJSON,
    createAccount: createAccount,
    newRoundId: newRoundId
  };
});
