/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Keno 80 — saved state
   Settings with the marked numbers, statistics and the game in
   progress, all kept in the browser. A round is open from the moment
   the balls are drawn until the game is paid. The balance is the
   pit's shared wallet (shared/js/pit.js).
   Normalizers are pure (tested in Node). Exposed as
   window.KenoStore and CommonJS.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var engine = root && root.KenoEngine;
  if (!engine && typeof require === "function") engine = require("./engine.js");
  var pit = root && root.Pit;
  if (!pit && typeof require === "function") pit = require("../../../shared/js/pit.js");
  var api = factory(engine, pit);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.KenoStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine, Pit) {
  "use strict";

  var GAME = "keno";
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
  var DEFAULT_SETTINGS = { animationSpeed: "normal", bet: 5, picks: [] };
  var DEFAULT_STATS = { games: 0, winningGames: 0, wagered: 0, returned: 0, biggestWin: 0, bestCatch: 0 };

  function safeCount(value) {
    value = Math.floor(Number(value));
    return isFinite(value) && value >= 0 ? Math.min(value, Number.MAX_SAFE_INTEGER) : 0;
  }

  // The marks stay on the ticket between visits; a ticket that could not
  // have been marked starts empty.
  function normalizeSettings(value) {
    value = value && typeof value === "object" ? value : {};
    return {
      animationSpeed: SPEEDS.indexOf(value.animationSpeed) !== -1 ? value.animationSpeed : DEFAULT_SETTINGS.animationSpeed,
      bet: Engine.isBet(value.bet) ? value.bet : DEFAULT_SETTINGS.bet,
      picks: Engine.isPicks(value.picks) ? value.picks.slice().sort(function (a, b) { return a - b; }) : []
    };
  }

  function normalizeStats(value) {
    value = value && typeof value === "object" ? value : {};
    var stats = {};
    Object.keys(DEFAULT_STATS).forEach(function (key) { stats[key] = safeCount(value[key]); });
    stats.winningGames = Math.min(stats.winningGames, stats.games);
    stats.bestCatch = Math.min(stats.bestCatch, Engine.MAX_SPOTS);
    return stats;
  }

  // What is saved once the balls are drawn: the ticket, the bet and the draw.
  function roundSnapshot(round) {
    return { id: round.id, picks: round.picks, bet: round.bet, balls: round.balls, at: round.at };
  }

  // A game is trusted only when every part of it agrees.
  function normalizeRound(value) {
    if (!value || typeof value !== "object") return null;
    if (typeof value.id !== "string" || !value.id) return null;
    if (!Engine.isPicks(value.picks) || !Engine.isBet(value.bet) || !Engine.isDraw(value.balls)) return null;
    return { id: value.id, picks: value.picks.slice(), bet: value.bet, balls: value.balls.slice(), at: safeCount(value.at) };
  }

  // Applies a settled game to the statistics.
  function recordGame(stats, result) {
    var next = normalizeStats(stats);
    next.games += 1;
    if (result.returned > 0) next.winningGames += 1;
    next.wagered = Math.min(Number.MAX_SAFE_INTEGER, next.wagered + result.stake);
    next.returned = Math.min(Number.MAX_SAFE_INTEGER, next.returned + result.returned);
    next.biggestWin = Math.max(next.biggestWin, result.net);
    next.bestCatch = Math.max(next.bestCatch, result.hits);
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
    recordGame: recordGame,
    readJSON: Pit.readJSON,
    writeJSON: Pit.writeJSON,
    createAccount: createAccount,
    newRoundId: newRoundId
  };
});
