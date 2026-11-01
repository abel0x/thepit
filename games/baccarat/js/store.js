/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 9 — saved state
   Settings, statistics, the shoe in play, its scoreboard and the
   snapshot of a coup in progress, all kept in the browser. The
   balance is the pit's shared wallet (shared/js/pit.js).
   Normalizers are pure (tested in Node). Exposed as
   window.BaccaratStore and CommonJS.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var engine = root && root.BaccaratEngine;
  if (!engine && typeof require === "function") engine = require("./engine.js");
  var pit = root && root.Pit;
  if (!pit && typeof require === "function") pit = require("../../../shared/js/pit.js");
  var api = factory(engine, pit);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BaccaratStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine, Pit) {
  "use strict";

  var GAME = "baccarat";
  var KEYS = {
    bankroll: Pit.KEYS.bankroll,
    stats: Pit.gameKey(GAME, "stats"),
    settings: Pit.gameKey(GAME, "settings"),
    roads: Pit.gameKey(GAME, "roads"),
    shoe: Pit.gameKey(GAME, "shoe"),
    lastBets: Pit.gameKey(GAME, "lastBets"),
    // The cents of commission owed, or owed to the player, between coups.
    box: Pit.gameKey(GAME, "box"),
    round: Pit.roundKey(GAME),
    sound: Pit.gameKey(GAME, "sound"),
    audio: Pit.gameKey(GAME, "audio")
  };
  // Everything that changes together with the balance.
  var ACCOUNT_KEYS = ["bankroll", "stats", "roads", "shoe", "lastBets", "box", "round"];

  var SPEEDS = ["fast", "normal", "cinematic"];
  var DEFAULT_SETTINGS = { rules: "classic", animationSpeed: "normal" };
  var DEFAULT_STATS = { coups: 0, playerWins: 0, bankerWins: 0, ties: 0, naturals: 0, wagered: 0, returned: 0, winningCoups: 0, biggestWin: 0 };
  // A shoe deals well under ninety coups before its cut card.
  var ROADS_LIMIT = 90;
  var WINNERS = ["player", "banker", "tie"];

  function safeCount(value) {
    value = Math.floor(Number(value));
    return isFinite(value) && value >= 0 ? Math.min(value, Number.MAX_SAFE_INTEGER) : 0;
  }

  function pick(value, allowed, fallback) {
    return allowed.indexOf(value) !== -1 ? value : fallback;
  }

  function normalizeSettings(value) {
    value = value && typeof value === "object" ? value : {};
    return {
      rules: pick(value.rules, Engine.RULES, DEFAULT_SETTINGS.rules),
      animationSpeed: pick(value.animationSpeed, SPEEDS, DEFAULT_SETTINGS.animationSpeed)
    };
  }

  function normalizeStats(value) {
    value = value && typeof value === "object" ? value : {};
    var stats = {};
    Object.keys(DEFAULT_STATS).forEach(function (key) { stats[key] = safeCount(value[key]); });
    stats.winningCoups = Math.min(stats.winningCoups, stats.coups);
    return stats;
  }

  // One remembered coup: who won, the two totals, a natural and the pairs.
  function normalizeResult(value) {
    if (!value || typeof value !== "object" || WINNERS.indexOf(value.winner) === -1) return null;
    var player = Number(value.player), banker = Number(value.banker);
    if (!(player >= 0 && player <= 9 && banker >= 0 && banker <= 9) || Math.floor(player) !== player || Math.floor(banker) !== banker) return null;
    var winner = player > banker ? "player" : banker > player ? "banker" : "tie";
    if (winner !== value.winner) return null;
    return { winner: winner, player: player, banker: banker, natural: value.natural === true, playerPair: value.playerPair === true, bankerPair: value.bankerPair === true };
  }

  function normalizeRoads(value) {
    if (!Array.isArray(value)) return [];
    return value.map(normalizeResult).filter(Boolean).slice(-ROADS_LIMIT);
  }

  // The cards left in the shoe, or null when they cannot be trusted and a
  // fresh shoe should be brought in.
  function normalizeShoe(value) {
    if (!Array.isArray(value) || value.length > Engine.DECKS * 52) return null;
    var cards = [];
    for (var i = 0; i < value.length; i++) {
      var card = Engine.fromCode(value[i], i);
      if (!card) return null;
      cards.push(card);
    }
    return cards;
  }

  function shoeCodes(cards) {
    return cards.map(Engine.code);
  }

  function betLimit(key) {
    return Engine.LIMITS[key] || 0;
  }

  function hand(codes) {
    if (!Array.isArray(codes)) return null;
    var cards = codes.map(function (text, index) { return Engine.fromCode(text, index); });
    return cards.every(Boolean) ? cards : null;
  }

  // The cards in the order they were dealt: Player, Banker, Player, Banker,
  // then the Player's third card and the Banker's.
  function dealOrder(player, banker) {
    var order = [];
    for (var i = 0; i < 3; i++) {
      if (player[i]) order.push({ side: "player", card: player[i] });
      if (banker[i]) order.push({ side: "banker", card: banker[i] });
    }
    return order;
  }

  // What is saved the moment the stake leaves the balance.
  function roundSnapshot(round) {
    return {
      id: round.id,
      bets: round.bets,
      stake: round.stake,
      rules: round.rules,
      player: shoeCodes(round.coup.player),
      banker: shoeCodes(round.coup.banker),
      at: round.at
    };
  }

  // A coup snapshot is trusted only when every part of it agrees: real bets
  // within the limits, a stake that adds up and cards the rules could deal.
  function normalizeRound(value) {
    if (!value || typeof value !== "object") return null;
    if (typeof value.id !== "string" || !value.id) return null;
    if (Engine.RULES.indexOf(value.rules) === -1) return null;
    var bets = Engine.normalizeBets(value.bets);
    if (Object.keys(bets).length !== Object.keys(value.bets || {}).length) return null;
    var stake = Engine.totalStake(bets);
    if (!(stake > 0) || stake !== value.stake) return null;
    if (Object.keys(bets).some(function (key) { return bets[key] > betLimit(key); })) return null;
    var player = hand(value.player), banker = hand(value.banker);
    if (!player || !banker || !Engine.isLegalCoup(player, banker)) return null;
    return {
      id: value.id,
      bets: bets,
      stake: stake,
      rules: value.rules,
      coup: Engine.describe(player, banker, dealOrder(player, banker)),
      at: safeCount(value.at)
    };
  }

  // Applies a settled coup to the statistics.
  function recordCoup(stats, coup, settlement) {
    var next = normalizeStats(stats);
    next.coups += 1;
    if (coup.winner === "player") next.playerWins += 1;
    else if (coup.winner === "banker") next.bankerWins += 1;
    else next.ties += 1;
    if (coup.natural) next.naturals += 1;
    next.wagered = Math.min(Number.MAX_SAFE_INTEGER, next.wagered + settlement.stake);
    next.returned = Math.min(Number.MAX_SAFE_INTEGER, next.returned + settlement.paid);
    if (settlement.net > 0) {
      next.winningCoups += 1;
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
        roads: normalizeRoads(read("roads", [])),
        shoe: normalizeShoe(read("shoe", null)),
        lastBets: Engine.normalizeBets(read("lastBets", {})),
        box: Engine.normalizeBox(read("box", 0)),
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
    ROADS_LIMIT: ROADS_LIMIT,
    START_BANKROLL: Pit.START_BANKROLL,
    MAX_BANKROLL: Pit.MAX_BANKROLL,
    normalizeBankroll: Pit.normalizeBankroll,
    normalizeSettings: normalizeSettings,
    normalizeStats: normalizeStats,
    normalizeResult: normalizeResult,
    normalizeRoads: normalizeRoads,
    normalizeShoe: normalizeShoe,
    shoeCodes: shoeCodes,
    normalizeRound: normalizeRound,
    roundSnapshot: roundSnapshot,
    betLimit: betLimit,
    recordCoup: recordCoup,
    readJSON: Pit.readJSON,
    writeJSON: Pit.writeJSON,
    createAccount: createAccount,
    newRoundId: newRoundId
  };
});
