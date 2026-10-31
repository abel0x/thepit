/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 7 — saved state
   Settings, statistics, the puck and the last rolls, and the bets on
   the layout, all kept in the browser. While any bet stands on the
   layout, or a roll is on its way, the round stays open. The balance
   is the pit's shared wallet (shared/js/pit.js).
   Normalizers are pure (tested in Node). Exposed as
   window.CrapsStore and CommonJS.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var engine = root && root.CrapsEngine;
  if (!engine && typeof require === "function") engine = require("./engine.js");
  var pit = root && root.Pit;
  if (!pit && typeof require === "function") pit = require("../../../shared/js/pit.js");
  var api = factory(engine, pit);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrapsStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine, Pit) {
  "use strict";

  var GAME = "craps";
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
  var DEFAULT_STATS = { rolls: 0, pointsMade: 0, sevenOuts: 0, wagered: 0, returned: 0, biggestWin: 0 };
  // The rolls the table remembers for its history strip.
  var HISTORY_LIMIT = 24;

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
    stats.pointsMade = Math.min(stats.pointsMade, stats.rolls);
    stats.sevenOuts = Math.min(stats.sevenOuts, stats.rolls);
    return stats;
  }

  // The puck and the last rolls.
  function normalizeTable(value) {
    value = value && typeof value === "object" ? value : {};
    var history = Array.isArray(value.history) ? value.history.filter(Engine.isDice).slice(-HISTORY_LIMIT) : [];
    return { point: Engine.isPoint(value.point) ? value.point : null, history: history };
  }

  // Bets a layout can hold with this point: nothing the rules would refuse,
  // no odds beyond what their bet allows.
  function layoutIsLegal(point, bets) {
    return Object.keys(bets).every(function (key) {
      var kind = Engine.kindOf(key);
      if ((kind === "lineOdds" || kind === "comeBox") && !point) return false;
      // Several come bets may travel to the same number and stand together.
      if (kind === "comePoint") return true;
      return bets[key] <= Engine.maxBet(key, point, bets);
    });
  }

  // What is saved while bets stand on the layout: the point they were made
  // against, the bets, and a roll on its way once the dice are thrown.
  function roundSnapshot(round) {
    return { id: round.id, point: round.point, bets: round.bets, roll: round.roll || null, wager: round.wager || 0, at: round.at };
  }

  // A round is trusted only when every part of it agrees: real bets the
  // layout could hold, a point the puck could show and real dice.
  function normalizeRound(value) {
    if (!value || typeof value !== "object") return null;
    if (typeof value.id !== "string" || !value.id) return null;
    var point = value.point == null ? null : value.point;
    if (point !== null && !Engine.isPoint(point)) return null;
    var bets = Engine.normalizeBets(value.bets);
    if (Object.keys(bets).length !== Object.keys(value.bets || {}).length) return null;
    if (!layoutIsLegal(point, bets)) return null;
    var roll = value.roll == null ? null : value.roll;
    if (roll !== null && (!roll || !Engine.isDice(roll.dice))) return null;
    if (!roll && !Object.keys(bets).length) return null;
    return { id: value.id, point: point, bets: bets, roll: roll ? { dice: roll.dice.slice() } : null, wager: safeCount(value.wager), at: safeCount(value.at) };
  }

  // Applies a settled roll to the statistics. wager is the new money the
  // roll put on the layout.
  function recordRoll(stats, result, wager) {
    var next = normalizeStats(stats);
    next.rolls += 1;
    if (result.pointMade) next.pointsMade += 1;
    if (result.sevenOut) next.sevenOuts += 1;
    next.wagered = Math.min(Number.MAX_SAFE_INTEGER, next.wagered + safeCount(wager));
    next.returned = Math.min(Number.MAX_SAFE_INTEGER, next.returned + result.returned);
    next.biggestWin = Math.max(next.biggestWin, result.profit);
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
