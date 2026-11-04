/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 13 — saved state
   Settings, statistics, the last bet and the snapshot of a hand in
   progress, all kept in the browser. The balance is the pit's shared
   wallet (shared/js/pit.js).
   Normalizers are pure (tested in Node). Exposed as
   window.RedDogStore and CommonJS.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var engine = root && root.RedDogEngine;
  if (!engine && typeof require === "function") engine = require("./engine.js");
  var pit = root && root.Pit;
  if (!pit && typeof require === "function") pit = require("../../../shared/js/pit.js");
  var api = factory(engine, pit);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RedDogStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine, Pit) {
  "use strict";

  var GAME = "reddog";
  var KEYS = {
    bankroll: Pit.KEYS.bankroll,
    stats: Pit.gameKey(GAME, "stats"),
    settings: Pit.gameKey(GAME, "settings"),
    lastBets: Pit.gameKey(GAME, "lastBets"),
    round: Pit.roundKey(GAME),
    sound: Pit.gameKey(GAME, "sound"),
    audio: Pit.gameKey(GAME, "audio")
  };
  // Everything that changes together with the balance.
  var ACCOUNT_KEYS = ["bankroll", "stats", "lastBets", "round"];

  var SPEEDS = ["fast", "normal", "cinematic"];
  var DEFAULT_SETTINGS = { animationSpeed: "normal", coach: false };
  var DEFAULT_STATS = {
    hands: 0, winningHands: 0, raised: 0, pushes: 0, trips: 0,
    wagered: 0, returned: 0, biggestWin: 0
  };

  function safeCount(value) {
    value = Math.floor(Number(value));
    return isFinite(value) && value >= 0 ? Math.min(value, Number.MAX_SAFE_INTEGER) : 0;
  }

  function normalizeSettings(value) {
    value = value && typeof value === "object" ? value : {};
    return {
      animationSpeed: SPEEDS.indexOf(value.animationSpeed) !== -1 ? value.animationSpeed : DEFAULT_SETTINGS.animationSpeed,
      coach: value.coach === true
    };
  }

  // A push returns the stake, so a hand is a win, a push or neither.
  function normalizeStats(value) {
    value = value && typeof value === "object" ? value : {};
    var stats = {};
    Object.keys(DEFAULT_STATS).forEach(function (key) { stats[key] = safeCount(value[key]); });
    stats.winningHands = Math.min(stats.winningHands, stats.hands);
    stats.raised = Math.min(stats.raised, stats.hands);
    stats.pushes = Math.min(stats.pushes, stats.hands - stats.winningHands);
    stats.trips = Math.min(stats.trips, stats.winningHands);
    return stats;
  }

  function betLimit(key) {
    return Engine.LIMITS[key] || 0;
  }

  function cardsOf(codes) {
    if (!Array.isArray(codes)) return null;
    var cards = codes.map(Engine.fromCode);
    return cards.every(Boolean) ? cards : null;
  }

  // What the hand's stake comes to: the Ante, and the Raise once it is made.
  function roundStake(bets, decision) {
    return (bets.ante || 0) * (decision === "raise" ? 2 : 1);
  }

  // What is saved the moment the stake leaves the balance, and again when
  // the player decides.
  function roundSnapshot(round) {
    return {
      id: round.id,
      bets: round.bets,
      stake: roundStake(round.bets, round.decision),
      cards: round.cards.map(Engine.code),
      decision: round.decision,
      at: round.at
    };
  }

  // A hand snapshot is trusted only when every part of it agrees: an Ante
  // within the limit, three real cards, a decision only where the spread
  // asks for one, and a stake that adds up.
  function normalizeRound(value) {
    if (!value || typeof value !== "object") return null;
    if (typeof value.id !== "string" || !value.id) return null;
    var bets = Engine.normalizeBets(value.bets);
    if (!bets.ante || Object.keys(bets).length !== Object.keys(value.bets || {}).length) return null;
    if (bets.ante > betLimit("ante")) return null;
    var cards = cardsOf(value.cards);
    if (!cards || !Engine.isLegalDeal(cards)) return null;
    var decision = value.decision == null ? null : value.decision;
    if (decision !== null && (Engine.DECISIONS.indexOf(decision) === -1 || !Engine.needsDecision(cards))) return null;
    if (value.stake !== roundStake(bets, decision)) return null;
    return { id: value.id, bets: bets, cards: cards, decision: decision, at: safeCount(value.at) };
  }

  // A hand that is settled with no more input: one that needs no decision,
  // or whose decision is already saved.
  function isDecided(round) {
    return round.decision !== null || !Engine.needsDecision(round.cards);
  }

  // Applies a settled hand to the statistics.
  function recordHand(stats, settlement) {
    var next = normalizeStats(stats);
    next.hands += 1;
    if (settlement.raised) next.raised += 1;
    if (settlement.outcome === "push") next.pushes += 1;
    if (settlement.outcome === "trips") next.trips += 1;
    next.wagered = Math.min(Number.MAX_SAFE_INTEGER, next.wagered + settlement.stake);
    next.returned = Math.min(Number.MAX_SAFE_INTEGER, next.returned + settlement.returned);
    if (settlement.net > 0) {
      next.winningHands += 1;
      next.biggestWin = Math.max(next.biggestWin, settlement.net);
    }
    return next;
  }

  /* ---------------- The account ---------------- */
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
      var round = read("round", null);
      return {
        bankroll: Pit.normalizeBankroll(read("bankroll", Pit.START_BANKROLL)),
        stats: normalizeStats(read("stats", DEFAULT_STATS)),
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
    START_BANKROLL: Pit.START_BANKROLL,
    MAX_BANKROLL: Pit.MAX_BANKROLL,
    normalizeBankroll: Pit.normalizeBankroll,
    normalizeSettings: normalizeSettings,
    normalizeStats: normalizeStats,
    normalizeRound: normalizeRound,
    roundSnapshot: roundSnapshot,
    roundStake: roundStake,
    isDecided: isDecided,
    betLimit: betLimit,
    recordHand: recordHand,
    readJSON: Pit.readJSON,
    writeJSON: Pit.writeJSON,
    createAccount: createAccount,
    newRoundId: newRoundId
  };
});
