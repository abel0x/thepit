/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   ThePit — i18n: English (default) and Turkish for every page
   The words every page shares live here. Each page adds its own
   with I18n.define(), and may never redefine a shared one: a word
   means the same thing everywhere in the pit. The chosen language
   is saved in the browser and follows the player from page to page.
   ========================================================= */
(function (global) {
  "use strict";

  var STORAGE_KEY = "pit.lang";
  var DEFAULT_LANG = "en";

  var DICT = {
    en: {
      // The wallet and its account
      balance: "Balance",
      addFunds: "Add play money",
      amount: "Amount",
      deposit: "Add",
      quickAdd: "Quick add",
      deposited: "Added {amount} to your balance",
      invalidDeposit: "Enter a positive whole-number amount",
      balanceLimit: "The balance cannot exceed {amount}",
      minBet: "Place a bet first",
      accountBusy: "A round with this balance is still in play at another table or tab. Try again when it ends.",
      temporaryAccount: "Shared storage protection is unavailable. This tab uses a separate session balance.",
      roundElsewhere: "Finish the round still open at {table} first.",

      // Moving around the pit and its settings
      backToLobby: "Back to the lobby",
      settings: "Settings",
      close: "Close",
      language: "Language",
      languageSelector: "Language selection",
      controlsLabel: "Game controls",
      tableInformation: "Table information",
      tableMinLabel: "MIN",
      tableMaxLabel: "MAX",
      profileApplied: "{profile} rules applied",

      // Cloths
      tableCloth: "Table cloth",
      themeEmerald: "Emerald",
      themeMidnight: "Midnight",
      themeBordeaux: "Bordeaux",
      themeOnyx: "Onyx",
      themeAmethyst: "Amethyst",

      // Sound and pace
      soundLabel: "Sound",
      soundMixer: "Sound levels",
      masterVolume: "Master",
      chipVolume: "Chips",
      muteSound: "Mute sound",
      unmuteSound: "Turn sound on",
      speedFast: "Fast",
      speedNormal: "Normal",
      speedCinematic: "Cinematic",

      // About
      disclaimerTitle: "Disclaimer",
      disclaimerWarranty: "Intended for adults. Not affiliated with any casino. Provided as is, without warranty of any kind.",
      versionLabel: "Version",
      licenseNotice: "Free software under the GNU AGPL v3",
      sourceCode: "Source code",

      // Playing cards, as a screen reader names them
      faceDownCard: "Face-down card",
      cardLabel: "{rank} of {suit}",
      rankAce: "Ace",
      rankTwo: "Two",
      rankThree: "Three",
      rankFour: "Four",
      rankFive: "Five",
      rankSix: "Six",
      rankSeven: "Seven",
      rankEight: "Eight",
      rankNine: "Nine",
      rankTen: "Ten",
      rankJack: "Jack",
      rankQueen: "Queen",
      rankKing: "King",
      suitSpades: "spades",
      suitHearts: "hearts",
      suitDiamonds: "diamonds",
      suitClubs: "clubs"
    },

    tr: {
      // The wallet and its account
      balance: "Bakiye",
      addFunds: "Oyun parası ekle",
      amount: "Tutar",
      deposit: "Ekle",
      quickAdd: "Hızlı bakiye ekle",
      deposited: "Bakiyenize {amount} eklendi",
      invalidDeposit: "Pozitif bir tam sayı tutarı girin",
      balanceLimit: "Bakiye {amount} tutarını aşamaz",
      minBet: "Önce bir bahis yapın",
      accountBusy: "Bu bakiyeyle başka bir masada ya da sekmede tur sürüyor. Bitince yeniden deneyin.",
      temporaryAccount: "Ortak kayıt koruması kullanılamıyor. Bu sekme ayrı bir oturum bakiyesi kullanıyor.",
      roundElsewhere: "Önce {table} masasında açık kalan turu bitirin.",

      // Moving around the pit and its settings
      backToLobby: "Lobiye dön",
      settings: "Ayarlar",
      close: "Kapat",
      language: "Dil",
      languageSelector: "Dil seçimi",
      controlsLabel: "Oyun kontrolleri",
      tableInformation: "Masa bilgileri",
      tableMinLabel: "EN AZ",
      tableMaxLabel: "EN ÇOK",
      profileApplied: "{profile} kuralları uygulandı",

      // Cloths
      tableCloth: "Masa çuhası",
      themeEmerald: "Zümrüt",
      themeMidnight: "Gece mavisi",
      themeBordeaux: "Bordo",
      themeOnyx: "Oniks",
      themeAmethyst: "Ametist",

      // Sound and pace
      soundLabel: "Ses",
      soundMixer: "Ses düzeyleri",
      masterVolume: "Ana ses",
      chipVolume: "Jetonlar",
      muteSound: "Sesi kapat",
      unmuteSound: "Sesi aç",
      speedFast: "Hızlı",
      speedNormal: "Normal",
      speedCinematic: "Sinematik",

      // About
      disclaimerTitle: "Sorumluluk reddi",
      disclaimerWarranty: "Yetişkinlere yöneliktir. Hiçbir kumarhaneyle bağlantısı yoktur. Olduğu gibi, hiçbir garanti verilmeden sunulur.",
      versionLabel: "Sürüm",
      licenseNotice: "GNU AGPL v3 lisanslı özgür yazılım",
      sourceCode: "Kaynak kodu",

      // Playing cards, as a screen reader names them
      faceDownCard: "Kapalı kart",
      cardLabel: "{suit} {rank}",
      rankAce: "Ası",
      rankTwo: "İkilisi",
      rankThree: "Üçlüsü",
      rankFour: "Dörtlüsü",
      rankFive: "Beşlisi",
      rankSix: "Altılısı",
      rankSeven: "Yedilisi",
      rankEight: "Sekizlisi",
      rankNine: "Dokuzlusu",
      rankTen: "Onlusu",
      rankJack: "Valesi",
      rankQueen: "Kızı",
      rankKing: "Papazı",
      suitSpades: "Maça",
      suitHearts: "Kupa",
      suitDiamonds: "Karo",
      suitClubs: "Sinek"
    }
  };
  var LANGUAGES = Object.keys(DICT);
  var SHARED_KEYS = Object.keys(DICT[DEFAULT_LANG]);

  var current = DEFAULT_LANG;
  var listeners = [];

  function has(table, key) {
    return Object.prototype.hasOwnProperty.call(table, key);
  }

  // Adds a page's own words, { en: {...}, tr: {...} }. Both languages must
  // be given, and a word the pit already has can never be redefined.
  function define(words) {
    LANGUAGES.forEach(function (lang) {
      if (!words || !words[lang]) throw new Error("I18n.define needs every language: " + lang);
    });
    LANGUAGES.forEach(function (lang) {
      Object.keys(words[lang]).forEach(function (key) {
        if (has(DICT[lang], key)) throw new Error("I18n.define cannot redefine \"" + key + "\"");
      });
    });
    LANGUAGES.forEach(function (lang) {
      Object.keys(words[lang]).forEach(function (key) { DICT[lang][key] = words[lang][key]; });
    });
  }

  function detectInitial() {
    // A previously saved choice always wins and is remembered across visits.
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (saved && has(DICT, saved)) return saved;
    // First-ever visit: English is the primary language.
    return DEFAULT_LANG;
  }

  function fill(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, function (m, p) { return params[p] != null ? params[p] : m; });
  }

  function lookup(key) {
    var table = DICT[current] || DICT[DEFAULT_LANG];
    return has(table, key) ? table[key] : (has(DICT[DEFAULT_LANG], key) ? DICT[DEFAULT_LANG][key] : null);
  }

  function t(key, params) {
    var str = lookup(key);
    if (str == null) str = key;
    if (Array.isArray(str)) str = str[0];
    return fill(str, params);
  }

  // Picks a random line from an array-valued key (falls back to t()).
  function pick(key, params) {
    var val = lookup(key);
    if (Array.isArray(val) && val.length) return fill(val[Math.floor(Math.random() * val.length)], params);
    return t(key, params);
  }

  var ATTRIBUTES = [
    ["data-i18n-title", "title"],
    ["data-i18n-aria-label", "aria-label"],
    ["data-i18n-aria-roledescription", "aria-roledescription"],
    ["data-i18n-placeholder", "placeholder"],
    ["data-i18n-content", "content"]
  ];

  function apply(root) {
    root = root || document;
    root.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    ATTRIBUTES.forEach(function (pair) {
      root.querySelectorAll("[" + pair[0] + "]").forEach(function (el) {
        el.setAttribute(pair[1], t(el.getAttribute(pair[0])));
      });
    });
    document.documentElement.setAttribute("lang", current);
    document.title = t("appTitle");
  }

  function setLanguage(lang) {
    if (!has(DICT, lang)) lang = DEFAULT_LANG;
    current = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    apply(document);
    listeners.forEach(function (fn) { try { fn(lang); } catch (e) {} });
  }

  function onChange(fn) { listeners.push(fn); }
  function get() { return current; }
  function locale() { return current === "tr" ? "tr-TR" : "en-US"; }

  // A share written the way the language writes it: 97.11% in English and
  // %97,11 in Turkish, the sign before the number. fraction is the share
  // itself (0.9711) and digits the decimals to show (none by default).
  function percent(fraction, digits) {
    digits = digits || 0;
    return new Intl.NumberFormat(locale(), { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(fraction);
  }

  // The words a control shows, in reading order, with one space between the
  // pieces of text: <b>2</b><b>3</b> reads "2 3", not "23". The chips stacked
  // on a betting spot (.spot-stack, .bet-stack) are the bet, not its label.
  function shownText(control) {
    var words = [];
    (function walk(node) {
      node.childNodes.forEach(function (child) {
        if (child.nodeType === 3) {
          var text = child.nodeValue.trim();
          if (text) words.push(text);
        } else if (child.nodeType === 1 && !child.matches(".spot-stack, .bet-stack")) {
          walk(child);
        }
      });
    })(control);
    return words.join(" ");
  }

  // An accessible name that begins with the words the control shows, so that
  // a player who speaks to the computer can say what they see (WCAG 2.5.3,
  // Label in Name). Each further part follows as a sentence of its own; a part
  // the shown words already hold is left out. Both lower cases are tried: in
  // Turkish "NIM" lowers to "nım", which would miss the "Nim" it already shows.
  function labelFor(control, parts) {
    var shown = shownText(control);
    var holds = function (part) {
      return shown.toLowerCase().indexOf(part.toLowerCase()) !== -1 ||
        shown.toLocaleLowerCase(locale()).indexOf(part.toLocaleLowerCase(locale())) !== -1;
    };
    return [shown].concat(parts.filter(function (part) {
      return part && !holds(String(part));
    })).filter(Boolean).join(". ");
  }

  current = detectInitial();

  global.I18n = {
    t: t,
    pick: pick,
    apply: apply,
    define: define,
    setLanguage: setLanguage,
    onChange: onChange,
    get: get,
    locale: locale,
    percent: percent,
    shownText: shownText,
    labelFor: labelFor,
    DEFAULT: DEFAULT_LANG,
    available: LANGUAGES.slice(),
    sharedKeys: SHARED_KEYS.slice(),
    // Exposed for the parity tests.
    _dict: DICT
  };
})(typeof window !== "undefined" ? window : globalThis);
