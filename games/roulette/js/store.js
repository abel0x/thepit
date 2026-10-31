/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 37 — saved state
   Settings, play-money account, statistics, results history and
   the snapshot of a spin in progress, all kept in the browser.
   Normalizers are pure (tested in Node); the account guards every
   balance change with Web Locks so several tabs stay consistent.
   The balance and the cloth are shared by the whole pit (shared/js/pit.js).
   Exposed as window.TableStore and CommonJS.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var engine = root && root.RouletteEngine;
  if (!engine && typeof require === "function") engine = require("./engine.js");
  var pit = root && root.Pit;
  if (!pit && typeof require === "function") pit = require("../../../shared/js/pit.js");
  var api = factory(engine, pit);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TableStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine, Pit) {
  "use strict";

  var KEYS = {
    bankroll: Pit.KEYS.bankroll,
    stats: Pit.gameKey("roulette", "stats"),
    settings: Pit.gameKey("roulette", "settings"),
    history: Pit.gameKey("roulette", "history"),
    lastBets: Pit.gameKey("roulette", "lastBets"),
    round: Pit.roundKey("roulette"),
    sound: Pit.gameKey("roulette", "sound"),
    audio: Pit.gameKey("roulette", "audio")
  };
  var ACCOUNT_KEYS = ["bankroll", "stats", "history", "lastBets", "round"];
  var LOCK_NAME = Pit.LOCK_NAME;

  var START_BANKROLL = Pit.START_BANKROLL;
  var MAX_BANKROLL = Pit.MAX_BANKROLL;
  var STRAIGHT_MAX = 2500;
  var HISTORY_LIMIT = 500;
  var THEMES = Pit.THEMES;
  var PROFILES = ["european", "french"];
  var SPEEDS = ["fast", "normal", "cinematic"];
  var DEFAULT_SETTINGS = { theme: Pit.DEFAULT_THEME, profile: "european", animationSpeed: "normal", neighbours: 2, racetrack: true };
  var DEFAULT_STATS = { spins: 0, wagered: 0, returned: 0, winningSpins: 0, biggestWin: 0 };

  function safeCount(value) {
    value = Math.floor(Number(value));
    return isFinite(value) && value >= 0 ? Math.min(value, Number.MAX_SAFE_INTEGER) : 0;
  }

  function pick(value, allowed, fallback) {
    return allowed.indexOf(value) !== -1 ? value : fallback;
  }

  function normalizeSettings(value) {
    value = value && typeof value === "object" ? value : {};
    var neighbours = Math.floor(Number(value.neighbours));
    return {
      theme: pick(value.theme, THEMES, DEFAULT_SETTINGS.theme),
      profile: pick(value.profile, PROFILES, DEFAULT_SETTINGS.profile),
      animationSpeed: pick(value.animationSpeed, SPEEDS, DEFAULT_SETTINGS.animationSpeed),
      neighbours: neighbours >= 1 && neighbours <= 9 ? neighbours : DEFAULT_SETTINGS.neighbours,
      racetrack: value.racetrack !== false
    };
  }

  function normalizeStats(value) {
    value = value && typeof value === "object" ? value : {};
    var stats = {};
    Object.keys(DEFAULT_STATS).forEach(function (key) { stats[key] = safeCount(value[key]); });
    stats.winningSpins = Math.min(stats.winningSpins, stats.spins);
    return stats;
  }

  function normalizeHistory(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(Engine.isNumber).slice(-HISTORY_LIMIT);
  }

  // A spin snapshot is trusted only when every part of it is consistent.
  function normalizeRound(value) {
    if (!value || typeof value !== "object") return null;
    if (typeof value.id !== "string" || !value.id) return null;
    if (!Engine.isNumber(value.result)) return null;
    if (PROFILES.indexOf(value.profile) === -1) return null;
    var bets = Engine.normalizeBets(value.bets);
    var stake = Engine.totalStake(bets);
    if (!(stake > 0) || stake !== value.stake) return null;
    if (Object.keys(bets).length !== Object.keys(value.bets || {}).length) return null;
    return { id: value.id, bets: bets, stake: stake, result: value.result, profile: value.profile, at: safeCount(value.at) };
  }

  // Table limit for one bet under the active straight-up maximum.
  function betLimit(key) {
    return Engine.maxStake(key, STRAIGHT_MAX);
  }

  // Applies a settled spin to the statistics.
  function recordSpin(stats, settlement) {
    var next = normalizeStats(stats);
    next.spins += 1;
    next.wagered = Math.min(Number.MAX_SAFE_INTEGER, next.wagered + settlement.stake);
    next.returned = Math.min(Number.MAX_SAFE_INTEGER, next.returned + settlement.returned);
    if (settlement.net > 0) {
      next.winningSpins += 1;
      next.biggestWin = Math.max(next.biggestWin, settlement.net);
    }
    return next;
  }

  /* ---------------- Browser storage & account ---------------- */
  // The shared wallet account (shared/js/pit.js), addressed by this table's
  // short names. env: { local, session, locks } (the browser's in the game).
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
      return {
        bankroll: Pit.normalizeBankroll(read("bankroll", START_BANKROLL)),
        stats: normalizeStats(read("stats", DEFAULT_STATS)),
        history: normalizeHistory(read("history", [])),
        round: normalizeRound(read("round", null)),
        roundPresent: read("round", null) != null
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
      roundsElsewhere: function () { return account.roundsElsewhere("roulette"); }
    };
  }

  function newRoundId() {
    var stamp = Date.now().toString(36);
    return stamp + "-" + Math.floor(Math.random() * 0x100000000).toString(36);
  }

  return {
    KEYS: KEYS,
    LOCK_NAME: LOCK_NAME,
    START_BANKROLL: START_BANKROLL,
    MAX_BANKROLL: MAX_BANKROLL,
    STRAIGHT_MAX: STRAIGHT_MAX,
    HISTORY_LIMIT: HISTORY_LIMIT,
    THEMES: THEMES,
    PROFILES: PROFILES,
    SPEEDS: SPEEDS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    DEFAULT_STATS: DEFAULT_STATS,
    normalizeBankroll: Pit.normalizeBankroll,
    normalizeSettings: normalizeSettings,
    normalizeStats: normalizeStats,
    normalizeHistory: normalizeHistory,
    normalizeRound: normalizeRound,
    betLimit: betLimit,
    recordSpin: recordSpin,
    readJSON: Pit.readJSON,
    writeJSON: Pit.writeJSON,
    createAccount: createAccount,
    newRoundId: newRoundId
  };
});
