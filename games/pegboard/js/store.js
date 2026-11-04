/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Drop 16 — saved state
   Settings, statistics, the last results and the snapshot of a round
   in progress, all kept in the browser. The balance is the pit's shared
   wallet (shared/js/pit.js).
   Normalizers are pure (tested in Node). Exposed as
   window.PegboardStore and CommonJS.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var engine = root && root.PegboardEngine;
  if (!engine && typeof require === "function") engine = require("./engine.js");
  var pit = root && root.Pit;
  if (!pit && typeof require === "function") pit = require("../../../shared/js/pit.js");
  var api = factory(engine, pit);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PegboardStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine, Pit) {
  "use strict";

  var GAME = "pegboard";
  var KEYS = {
    bankroll: Pit.KEYS.bankroll,
    stats: Pit.gameKey(GAME, "stats"),
    settings: Pit.gameKey(GAME, "settings"),
    history: Pit.gameKey(GAME, "history"),
    round: Pit.roundKey(GAME),
    sound: Pit.gameKey(GAME, "sound"),
    audio: Pit.gameKey(GAME, "audio")
  };
  // Everything that changes together with the balance.
  var ACCOUNT_KEYS = ["bankroll", "stats", "history", "round"];
  // The last multipliers shown beside the board.
  var HISTORY_LENGTH = 12;

  var SPEEDS = ["fast", "normal", "cinematic"];
  var DEFAULT_SETTINGS = { rows: 12, risk: "medium", balls: 1, bet: 10, animationSpeed: "normal" };
  var DEFAULT_STATS = {
    rounds: 0, drops: 0, winningDrops: 0, wagered: 0, returned: 0, biggestWin: 0, bestMultiplier: 0
  };

  function safeCount(value) {
    value = Math.floor(Number(value));
    return isFinite(value) && value >= 0 ? Math.min(value, Number.MAX_SAFE_INTEGER) : 0;
  }

  function normalizeSettings(value) {
    value = value && typeof value === "object" ? value : {};
    return {
      rows: Engine.isRows(value.rows) ? value.rows : DEFAULT_SETTINGS.rows,
      risk: Engine.isRisk(value.risk) ? value.risk : DEFAULT_SETTINGS.risk,
      balls: Engine.BALLS.indexOf(value.balls) !== -1 ? value.balls : DEFAULT_SETTINGS.balls,
      bet: Engine.normalizeBet(value.bet) || DEFAULT_SETTINGS.bet,
      animationSpeed: SPEEDS.indexOf(value.animationSpeed) !== -1 ? value.animationSpeed : DEFAULT_SETTINGS.animationSpeed
    };
  }

  // bestMultiplier is kept in tenths, as the engine counts pays.
  function normalizeStats(value) {
    value = value && typeof value === "object" ? value : {};
    var stats = {};
    Object.keys(DEFAULT_STATS).forEach(function (key) { stats[key] = safeCount(value[key]); });
    stats.rounds = Math.min(stats.rounds, stats.drops);
    stats.winningDrops = Math.min(stats.winningDrops, stats.drops);
    return stats;
  }

  // The last multipliers, newest first, in tenths.
  function normalizeHistory(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(function (tenths) { return Number.isSafeInteger(tenths) && tenths > 0; }).slice(0, HISTORY_LENGTH);
  }

  function addHistory(history, settlement) {
    var newest = settlement.balls.map(function (ball) { return Math.round(ball.multiplier * 10); }).reverse();
    return newest.concat(normalizeHistory(history)).slice(0, HISTORY_LENGTH);
  }

  // What is saved the moment the stake leaves the balance: the board, the
  // bet and every ball's path, before the first ball falls.
  function roundSnapshot(round) {
    return {
      id: round.id,
      bet: round.bet,
      rows: round.rows,
      risk: round.risk,
      paths: round.paths.slice(),
      stake: round.bet * round.paths.length,
      at: round.at
    };
  }

  // A round snapshot is trusted only when every part of it agrees: a bet the
  // machine takes, a board it has, a count of balls it offers, a path of the
  // board's length for each and a stake that adds up.
  function normalizeRound(value) {
    if (!value || typeof value !== "object") return null;
    if (typeof value.id !== "string" || !value.id) return null;
    var bet = Engine.normalizeBet(value.bet);
    if (!bet || !Engine.isRows(value.rows) || !Engine.isRisk(value.risk)) return null;
    if (!Array.isArray(value.paths) || Engine.BALLS.indexOf(value.paths.length) === -1) return null;
    if (!value.paths.every(function (path) { return Engine.isPath(path, value.rows); })) return null;
    if (value.stake !== bet * value.paths.length) return null;
    return { id: value.id, bet: bet, rows: value.rows, risk: value.risk, paths: value.paths.slice(), at: safeCount(value.at) };
  }

  // Applies a settled round to the statistics.
  function recordRound(stats, settlement) {
    var next = normalizeStats(stats);
    next.rounds += 1;
    next.drops += settlement.balls.length;
    settlement.balls.forEach(function (ball) {
      if (ball.multiplier > 1) next.winningDrops += 1;
      next.bestMultiplier = Math.max(next.bestMultiplier, Math.round(ball.multiplier * 10));
    });
    next.wagered = Math.min(Number.MAX_SAFE_INTEGER, next.wagered + settlement.stake);
    next.returned = Math.min(Number.MAX_SAFE_INTEGER, next.returned + settlement.returned);
    if (settlement.net > 0) next.biggestWin = Math.max(next.biggestWin, settlement.net);
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
