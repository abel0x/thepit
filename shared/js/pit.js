/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   ThePit — what every page of the pit shares
   One play-money wallet and one table cloth for the lobby and every
   table. Each game keeps its own settings, statistics and unfinished
   round, but all of them read and write the same bankroll under the
   same Web Lock, so a hand at one table and a spin at another never
   overwrite each other.
   No DOM, network or third-party dependencies.
   Exposed as window.Pit and CommonJS for tests.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.Pit = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var KEY_PREFIX = "pit.";
  // Every table in the pit, by the id its storage keys use.
  var TABLES = { blackjack: "Table 21", roulette: "Table 37", baccarat: "Table 9", threecard: "Table 3", slot: "Slot 5", craps: "Table 7", holdem: "Table 2", videopoker: "Poker 11", sicbo: "Table 18", keno: "Keno 80", bigsix: "Wheel 54", reddog: "Table 13", pegboard: "Drop 16" };
  var KEYS = {
    bankroll: "pit.bankroll",
    theme: "pit.theme"
  };
  var LOCK_NAME = "pit.account";
  var START_BANKROLL = 10000;
  // Far above any balance a session reaches, and far enough below 2^53 that
  // payouts on the largest allowed bets stay exact integers.
  var MAX_BANKROLL = 1e12;
  var THEMES = ["emerald", "midnight", "bordeaux", "onyx", "amethyst"];
  var DEFAULT_THEME = "emerald";
  // Browser chrome colour that matches each cloth.
  var THEME_COLORS = { emerald: "#0b3d2e", midnight: "#102c49", bordeaux: "#4a1822", onyx: "#26292d", amethyst: "#3a2361" };

  // Balances are whole play-money dollars. A missing, unreadable or negative
  // value starts the player over with the opening stake.
  function normalizeBankroll(value) {
    value = Math.floor(Number(value));
    if (!isFinite(value) || value < 0) return START_BANKROLL;
    return Math.min(value, MAX_BANKROLL);
  }

  function normalizeTheme(value) {
    return THEMES.indexOf(value) !== -1 ? value : DEFAULT_THEME;
  }

  // The cloth is stored as JSON, like every other saved value in the pit.
  function readTheme(storage) {
    return normalizeTheme(readJSON(storage, KEYS.theme, null));
  }

  function writeTheme(storage, theme) {
    writeJSON(storage, KEYS.theme, normalizeTheme(theme));
  }

  // Storage key for one game's own data, e.g. gameKey("roulette", "stats").
  function gameKey(game, name) {
    return KEY_PREFIX + game + "." + name;
  }

  // Without Web Locks a balance shared between tabs could lose updates, so
  // each tab then keeps its account in sessionStorage under this key instead.
  function sessionKey(key) {
    return KEY_PREFIX + "session." + String(key).replace(/^pit\./, "");
  }

  function isPitKey(key) {
    return typeof key === "string" && key.indexOf(KEY_PREFIX) === 0;
  }

  function roundKey(game) {
    return gameKey(game, "round");
  }

  // Tables other than `game` with a round still open. The pit plays one round
  // at a time: a hand left open at Table 21 keeps its stake inside the shared
  // balance until it is finished there, so no other table may spend it.
  // read(key, fallback) reads the wallet the way the caller's account does.
  function roundsElsewhere(read, game) {
    return Object.keys(TABLES).filter(function (id) {
      return id !== game && read(roundKey(id), null) != null;
    });
  }

  /* ---------------- A save on file ---------------- */
  // Everything the pit keeps in this browser, written to a file and read
  // back: the balance, every table's settings, statistics, last bets and
  // any unfinished round, the cloth and the language. A tab's own copy of
  // the account (pit.session.*) belongs to that tab and is never saved.
  var SAVE_FORMAT = "thepit-save";
  var SAVE_VERSION = 1;
  var SAVE_KEY = /^pit\.[a-z0-9]+(\.[A-Za-z0-9]+)*$/;

  function isSaveKey(key) {
    return SAVE_KEY.test(key) && key.indexOf(KEY_PREFIX + "session.") !== 0;
  }

  function saveKeys(storage) {
    var keys = [];
    try {
      for (var i = 0; i < storage.length; i++) {
        var key = storage.key(i);
        if (isSaveKey(key)) keys.push(key);
      }
    } catch (e) { return []; }
    return keys.sort();
  }

  // The save as an object, ready for JSON.stringify. `at` is when it was made.
  function exportSave(storage, at) {
    var data = {};
    saveKeys(storage).forEach(function (key) {
      var value = readJSON(storage, key, undefined);
      if (value !== undefined) data[key] = value;
    });
    return { format: SAVE_FORMAT, version: SAVE_VERSION, saved: new Date(at).toISOString(), data: data };
  }

  // A save read back from text, or null when it is not one: the format and
  // version must match, and every key must be one the pit writes. The
  // values are checked by each page as it reads them, as always.
  function readSave(text) {
    var save;
    try { save = JSON.parse(String(text)); } catch (e) { return null; }
    if (!save || typeof save !== "object" || save.format !== SAVE_FORMAT || save.version !== SAVE_VERSION) return null;
    if (!save.data || typeof save.data !== "object" || Array.isArray(save.data)) return null;
    var keys = Object.keys(save.data);
    if (!keys.length || !keys.every(isSaveKey)) return null;
    var saved = Date.parse(save.saved);
    return { saved: isFinite(saved) ? saved : null, data: save.data };
  }

  // Replaces everything the pit keeps with a save: what the save does not
  // hold is removed, so the pit is exactly as it was when the save was made.
  function restoreSave(storage, save) {
    saveKeys(storage).forEach(function (key) { removeKey(storage, key); });
    Object.keys(save.data).forEach(function (key) { writeJSON(storage, key, save.data[key]); });
  }

  /* ---------------- Browser storage & account ---------------- */
  function readJSON(storage, key, fallback) {
    try {
      var raw = storage && storage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function writeJSON(storage, key, value) {
    try { storage && storage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function removeKey(storage, key) {
    try { storage && storage.removeItem(key); } catch (e) {}
  }

  // The account guards the wallet. env: { local, session, locks, accountKeys }.
  // accountKeys lists the keys that must change together with the balance,
  // such as a game's statistics; the bankroll and every table's unfinished
  // round always belong to it. With Web Locks they live in localStorage,
  // shared by every tab. Without them a balance shared between tabs could
  // lose updates, so each tab then keeps its own copy in sessionStorage.
  function createAccount(env) {
    env = env || {};
    var locks = env.locks;
    var shared = !!(locks && typeof locks.request === "function");
    var accountKeys = [KEYS.bankroll].concat(Object.keys(TABLES).map(roundKey), env.accountKeys || []);
    var held = false;

    function isAccountKey(key) { return accountKeys.indexOf(key) !== -1; }
    function storageFor(key) { return shared || !isAccountKey(key) ? env.local : env.session; }
    function keyFor(key) { return shared || !isAccountKey(key) ? key : sessionKey(key); }

    function read(key, fallback) { return readJSON(storageFor(key), keyFor(key), fallback); }
    function write(key, value) { writeJSON(storageFor(key), keyFor(key), value); }
    function remove(key) { removeKey(storageFor(key), keyFor(key)); }

    // Runs action() while this tab owns the account. Resolves to its result,
    // or to { busy: true } when another tab keeps it longer than patience ms.
    function run(action, patience) {
      if (held) return Promise.resolve().then(action);
      function exclusive(lock) {
        if (!lock && shared) return { busy: true };
        held = true;
        var result;
        try { result = action(); } catch (error) { held = false; return Promise.reject(error); }
        return Promise.resolve(result).then(function (value) {
          held = false;
          return value;
        }, function (error) {
          held = false;
          throw error;
        });
      }
      if (!shared) return Promise.resolve().then(function () { return exclusive(true); });
      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, patience == null ? 900 : patience) : null;
      var request = controller
        ? locks.request(LOCK_NAME, { signal: controller.signal }, function (lock) { clearTimeout(timer); return exclusive(lock); })
        : locks.request(LOCK_NAME, { ifAvailable: true }, exclusive);
      return request.catch(function (error) {
        clearTimeout(timer);
        if (error && error.name === "AbortError") return { busy: true };
        throw error;
      });
    }

    return {
      shared: shared,
      read: read,
      write: write,
      remove: remove,
      run: run,
      isHeld: function () { return held; },
      roundsElsewhere: function (game) { return roundsElsewhere(read, game); }
    };
  }

  return {
    TABLES: TABLES,
    KEYS: KEYS,
    LOCK_NAME: LOCK_NAME,
    START_BANKROLL: START_BANKROLL,
    MAX_BANKROLL: MAX_BANKROLL,
    THEMES: THEMES,
    DEFAULT_THEME: DEFAULT_THEME,
    THEME_COLORS: THEME_COLORS,
    normalizeBankroll: normalizeBankroll,
    normalizeTheme: normalizeTheme,
    readTheme: readTheme,
    writeTheme: writeTheme,
    gameKey: gameKey,
    roundKey: roundKey,
    sessionKey: sessionKey,
    roundsElsewhere: roundsElsewhere,
    isPitKey: isPitKey,
    readJSON: readJSON,
    writeJSON: writeJSON,
    createAccount: createAccount,
    SAVE_FORMAT: SAVE_FORMAT,
    isSaveKey: isSaveKey,
    exportSave: exportSave,
    readSave: readSave,
    restoreSave: restoreSave
  };
});
