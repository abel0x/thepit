/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 4 — saved state
   Settings, statistics, the last bets, the box of change, the last
   results and the snapshot of a round in progress, all kept in the
   browser. The balance is the pit's shared wallet (shared/js/pit.js).
   Normalizers are pure (tested in Node). Exposed as
   window.FanTanStore and CommonJS.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var engine = root && root.FanTanEngine;
  if (!engine && typeof require === "function") engine = require("./engine.js");
  var pit = root && root.Pit;
  if (!pit && typeof require === "function") pit = require("../../../shared/js/pit.js");
  var api = factory(engine, pit);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FanTanStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine, Pit) {
  "use strict";

  var GAME = "fantan";
  var KEYS = {
    bankroll: Pit.KEYS.bankroll,
    stats: Pit.gameKey(GAME, "stats"),
    settings: Pit.gameKey(GAME, "settings"),
    lastBets: Pit.gameKey(GAME, "lastBets"),
    box: Pit.gameKey(GAME, "box"),
    history: Pit.gameKey(GAME, "history"),
    round: Pit.roundKey(GAME),
    sound: Pit.gameKey(GAME, "sound"),
    audio: Pit.gameKey(GAME, "audio")
  };
  // Everything that changes together with the balance.
  var ACCOUNT_KEYS = ["bankroll", "stats", "lastBets", "box", "history", "round"];
  // The last results shown beside the bowl.
  var HISTORY_LENGTH = 16;

  var SPEEDS = ["fast", "normal", "cinematic"];
  var DEFAULT_SETTINGS = { animationSpeed: "normal" };
  var DEFAULT_STATS = { rounds: 0, winningRounds: 0, wagered: 0, returned: 0, biggestWin: 0, ones: 0, twos: 0, threes: 0, fours: 0 };
  var RESULT_KEYS = { 1: "ones", 2: "twos", 3: "threes", 4: "fours" };

  function safeCount(value) {
    value = Math.floor(Number(value));
    return isFinite(value) && value >= 0 ? Math.min(value, Number.MAX_SAFE_INTEGER) : 0;
  }

  function normalizeSettings(value) {
    value = value && typeof value === "object" ? value : {};
    return {
      animationSpeed: SPEEDS.indexOf(value.animationSpeed) !== -1 ? value.animationSpeed : DEFAULT_SETTINGS.animationSpeed
    };
  }

  function normalizeStats(value) {
    value = value && typeof value === "object" ? value : {};
    var stats = {};
    Object.keys(DEFAULT_STATS).forEach(function (key) { stats[key] = safeCount(value[key]); });
    stats.winningRounds = Math.min(stats.winningRounds, stats.rounds);
    return stats;
  }

  // The last results, newest first.
  function normalizeHistory(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(function (result) { return Engine.NUMBERS.indexOf(result) !== -1; }).slice(0, HISTORY_LENGTH);
  }

  function addHistory(history, result) {
    return [result].concat(normalizeHistory(history)).slice(0, HISTORY_LENGTH);
  }

  // What is saved the moment the stake leaves the balance: the bets and the
  // pile of beads, before the bowl is lifted.
  function roundSnapshot(round) {
    return { id: round.id, bets: round.bets, stake: Engine.totalStake(round.bets), beads: round.beads, at: round.at };
  }

  // A round snapshot is trusted only when every part of it agrees: bets the
  // layout has within their limits, a stake that adds up and a pile the
  // croupier could have taken.
  function normalizeRound(value) {
    if (!value || typeof value !== "object") return null;
    if (typeof value.id !== "string" || !value.id) return null;
    var bets = Engine.normalizeBets(value.bets);
    var keys = Object.keys(bets);
    if (!keys.length || keys.length !== Object.keys(value.bets || {}).length || !Engine.withinLimits(bets)) return null;
    if (value.stake !== Engine.totalStake(bets) || !Engine.isBeads(value.beads)) return null;
    return { id: value.id, bets: bets, beads: value.beads, at: safeCount(value.at) };
  }

  // Applies a settled round to the statistics.
  function recordRound(stats, settlement) {
    var next = normalizeStats(stats);
    next.rounds += 1;
    next[RESULT_KEYS[settlement.result]] += 1;
    next.wagered = Math.min(Number.MAX_SAFE_INTEGER, next.wagered + settlement.stake);
    next.returned = Math.min(Number.MAX_SAFE_INTEGER, next.returned + settlement.paid);
    if (settlement.net > 0) {
      next.winningRounds += 1;
      next.biggestWin = Math.max(next.biggestWin, settlement.net);
    }
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
        lastBets: Engine.normalizeBets(read("lastBets", {})),
        box: Engine.normalizeBox(read("box", 0)),
        history: normalizeHistory(read("history", [])),
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
    HISTORY_LENGTH: HISTORY_LENGTH,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    DEFAULT_STATS: DEFAULT_STATS,
    RESULT_KEYS: RESULT_KEYS,
    START_BANKROLL: Pit.START_BANKROLL,
    MAX_BANKROLL: Pit.MAX_BANKROLL,
    normalizeBankroll: Pit.normalizeBankroll,
    normalizeSettings: normalizeSettings,
    normalizeStats: normalizeStats,
    normalizeHistory: normalizeHistory,
    addHistory: addHistory,
    normalizeRound: normalizeRound,
    roundSnapshot: roundSnapshot,
    recordRound: recordRound,
    readJSON: Pit.readJSON,
    writeJSON: Pit.writeJSON,
    createAccount: createAccount,
    newRoundId: newRoundId
  };
});
