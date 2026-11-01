/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Poker 11 — saved state
   Settings with the bet, statistics and the snapshot of a hand in
   progress, all kept in the browser. The balance is the pit's shared
   wallet (shared/js/pit.js).
   Normalizers are pure (tested in Node). Exposed as
   window.VideoPokerStore and CommonJS.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var engine = root && root.VideoPokerEngine;
  if (!engine && typeof require === "function") engine = require("./engine.js");
  var pit = root && root.Pit;
  if (!pit && typeof require === "function") pit = require("../../../shared/js/pit.js");
  var api = factory(engine, pit);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VideoPokerStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine, Pit) {
  "use strict";

  var GAME = "videopoker";
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
  var DEFAULT_SETTINGS = { payTable: "nineSix", denomination: 5, coins: 5, animationSpeed: "normal", coach: false };
  // bestHand is the index of the best category the player has drawn
  // (Engine.CATEGORIES; 0 for none yet).
  var DEFAULT_STATS = { hands: 0, winningHands: 0, royalFlushes: 0, wagered: 0, returned: 0, biggestWin: 0, bestHand: 0 };

  function safeCount(value) {
    value = Math.floor(Number(value));
    return isFinite(value) && value >= 0 ? Math.min(value, Number.MAX_SAFE_INTEGER) : 0;
  }

  // The bet is kept with the settings, as a machine keeps its last bet.
  function normalizeSettings(value) {
    value = value && typeof value === "object" ? value : {};
    var coins = value.coins;
    return {
      payTable: Engine.PAY_TABLES.indexOf(value.payTable) !== -1 ? value.payTable : DEFAULT_SETTINGS.payTable,
      denomination: Engine.DENOMINATIONS.indexOf(value.denomination) !== -1 ? value.denomination : DEFAULT_SETTINGS.denomination,
      coins: Number.isSafeInteger(coins) && coins >= 1 && coins <= Engine.MAX_COINS ? coins : DEFAULT_SETTINGS.coins,
      animationSpeed: SPEEDS.indexOf(value.animationSpeed) !== -1 ? value.animationSpeed : DEFAULT_SETTINGS.animationSpeed,
      coach: value.coach === true
    };
  }

  function normalizeStats(value) {
    value = value && typeof value === "object" ? value : {};
    var stats = {};
    Object.keys(DEFAULT_STATS).forEach(function (key) { stats[key] = safeCount(value[key]); });
    stats.winningHands = Math.min(stats.winningHands, stats.hands);
    stats.royalFlushes = Math.min(stats.royalFlushes, stats.winningHands);
    stats.bestHand = Math.min(stats.bestHand, Engine.CATEGORIES.length - 1);
    return stats;
  }

  function cards(codes) {
    if (!Array.isArray(codes)) return null;
    var list = codes.map(Engine.fromCode);
    return list.every(Boolean) ? list : null;
  }

  // What is saved the moment the stake leaves the balance, and again when the
  // player draws: the five cards dealt, the five waiting for the draw, and
  // the hold once it is made.
  function roundSnapshot(round) {
    return {
      id: round.id,
      bet: round.bet,
      payTable: round.payTable,
      stake: Engine.stakeOf(round.bet),
      hand: round.hand.map(Engine.code),
      draws: round.draws.map(Engine.code),
      held: round.held,
      at: round.at
    };
  }

  // A hand snapshot is trusted only when every part of it agrees: a bet the
  // machine takes and the stake it makes, a pay table it offers, ten
  // different cards from one deck and, once drawn, a hold of five positions.
  function normalizeRound(value) {
    if (!value || typeof value !== "object") return null;
    if (typeof value.id !== "string" || !value.id) return null;
    var bet = Engine.normalizeBet(value.bet);
    if (!bet || value.stake !== Engine.stakeOf(bet)) return null;
    if (Engine.PAY_TABLES.indexOf(value.payTable) === -1) return null;
    var hand = cards(value.hand), draws = cards(value.draws);
    if (!hand || !draws || !Engine.isLegalDeal(hand, draws)) return null;
    var held = value.held == null ? null : value.held;
    if (held !== null && !Engine.isHold(held)) return null;
    return { id: value.id, bet: bet, payTable: value.payTable, hand: hand, draws: draws, held: held, at: safeCount(value.at) };
  }

  // Applies a settled hand to the statistics.
  function recordHand(stats, settlement) {
    var next = normalizeStats(stats);
    next.hands += 1;
    next.wagered = Math.min(Number.MAX_SAFE_INTEGER, next.wagered + settlement.stake);
    next.returned = Math.min(Number.MAX_SAFE_INTEGER, next.returned + settlement.returned);
    if (settlement.returned > 0) next.winningHands += 1;
    if (settlement.hand.category === "royalFlush") next.royalFlushes += 1;
    next.biggestWin = Math.max(next.biggestWin, settlement.net);
    next.bestHand = Math.max(next.bestHand, Engine.CATEGORIES.indexOf(settlement.hand.category));
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
    recordHand: recordHand,
    readJSON: Pit.readJSON,
    writeJSON: Pit.writeJSON,
    createAccount: createAccount,
    newRoundId: newRoundId
  };
});
