/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Slot 5 — saved state
   Settings, statistics and the snapshot of a spin in progress, all
   kept in the browser. The balance is the pit's shared wallet
   (shared/js/pit.js).
   Normalizers are pure (tested in Node). Exposed as
   window.SlotStore and CommonJS.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var engine = root && root.SlotEngine;
  if (!engine && typeof require === "function") engine = require("./engine.js");
  var pit = root && root.Pit;
  if (!pit && typeof require === "function") pit = require("../../../shared/js/pit.js");
  var api = factory(engine, pit);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SlotStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine, Pit) {
  "use strict";

  var GAME = "slot";
  var KEYS = {
    bankroll: Pit.KEYS.bankroll,
    stats: Pit.gameKey(GAME, "stats"),
    settings: Pit.gameKey(GAME, "settings"),
    round: Pit.roundKey(GAME),
    sound: Pit.gameKey(GAME, "sound"),
    audio: Pit.gameKey(GAME, "audio")
  };
  // Everything that changes together with the balance.
  var ACCOUNT_KEYS = ["bankroll", "stats", "round"];

  var SPEEDS = ["fast", "normal", "cinematic"];
  var DEFAULT_SETTINGS = { animationSpeed: "normal", lineBet: 5 };
  var DEFAULT_STATS = { spins: 0, winningSpins: 0, features: 0, freeSpinsWon: 0, wagered: 0, returned: 0, biggestWin: 0 };

  function safeCount(value) {
    value = Math.floor(Number(value));
    return isFinite(value) && value >= 0 ? Math.min(value, Number.MAX_SAFE_INTEGER) : 0;
  }

  function normalizeSettings(value) {
    value = value && typeof value === "object" ? value : {};
    return {
      animationSpeed: SPEEDS.indexOf(value.animationSpeed) !== -1 ? value.animationSpeed : DEFAULT_SETTINGS.animationSpeed,
      lineBet: Engine.isLineBet(value.lineBet) ? value.lineBet : DEFAULT_SETTINGS.lineBet
    };
  }

  function normalizeStats(value) {
    value = value && typeof value === "object" ? value : {};
    var stats = {};
    Object.keys(DEFAULT_STATS).forEach(function (key) { stats[key] = safeCount(value[key]); });
    stats.winningSpins = Math.min(stats.winningSpins, stats.spins);
    stats.features = Math.min(stats.features, stats.spins);
    stats.freeSpinsWon = Math.min(stats.freeSpinsWon, stats.features * Engine.FREE_SPINS);
    return stats;
  }

  // What is saved the moment the stake leaves the balance: the paid spin and
  // any free spins it brought, drawn before the reels turn.
  function roundSnapshot(round) {
    return {
      id: round.id,
      lineBet: round.lineBet,
      stake: Engine.totalBet(round.lineBet),
      stops: round.spin.stops,
      free: round.spin.free,
      at: round.at
    };
  }

  // A spin snapshot is trusted only when every part of it agrees: a line bet
  // the machine offers, the stake it makes and stops the reels have.
  function normalizeRound(value) {
    if (!value || typeof value !== "object") return null;
    if (typeof value.id !== "string" || !value.id) return null;
    if (!Engine.isLineBet(value.lineBet) || value.stake !== Engine.totalBet(value.lineBet)) return null;
    var spin = { stops: value.stops, free: value.free == null ? null : value.free };
    if (!Engine.isLegalSpin(spin)) return null;
    return { id: value.id, lineBet: value.lineBet, spin: spin, at: safeCount(value.at) };
  }

  // Applies a settled spin to the statistics.
  function recordSpin(stats, settlement) {
    var next = normalizeStats(stats);
    next.spins += 1;
    if (settlement.free.length) {
      next.features += 1;
      next.freeSpinsWon += settlement.free.length;
    }
    next.wagered = Math.min(Number.MAX_SAFE_INTEGER, next.wagered + settlement.stake);
    next.returned = Math.min(Number.MAX_SAFE_INTEGER, next.returned + settlement.returned);
    if (settlement.returned > 0) next.winningSpins += 1;
    next.biggestWin = Math.max(next.biggestWin, settlement.returned);
    return next;
  }

  /* ---------------- The account ---------------- */
  // The shared wallet account (shared/js/pit.js), addressed by this
  // machine's short names. env: { local, session, locks }.
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
    START_BANKROLL: Pit.START_BANKROLL,
    MAX_BANKROLL: Pit.MAX_BANKROLL,
    normalizeBankroll: Pit.normalizeBankroll,
    normalizeSettings: normalizeSettings,
    normalizeStats: normalizeStats,
    normalizeRound: normalizeRound,
    roundSnapshot: roundSnapshot,
    recordSpin: recordSpin,
    readJSON: Pit.readJSON,
    writeJSON: Pit.writeJSON,
    createAccount: createAccount,
    newRoundId: newRoundId
  };
});
