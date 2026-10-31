/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   i18n — English (default) + Turkish for the lobby, persisted in
   the browser under the same key as every table of the pit.
   ========================================================= */
(function (global) {
  "use strict";

  // Shared by every page of ThePit, so the language follows the player.
  var STORAGE_KEY = "pit.lang";
  var DEFAULT_LANG = "en";

  var DICT = {
    en: {
      appTitle: "ThePit",
      appDescription: "A free, play-money casino of table games that works completely offline.",
      brandName: "ThePit",
      subtitle: "Offline Casino",
      balance: "Balance",
      languageSelector: "Language selection",
      settings: "Settings",
      close: "Close",

      floorTitle: "Choose your table",
      floorLead: "Every table plays from the same play-money balance, entirely on this device.",
      tablesLabel: "Tables",
      takeSeat: "Take a seat",
      roundOpen: "Unfinished round",
      tableMinLabel: "MIN",
      tableMaxLabel: "MAX",
      blackjackGame: "Blackjack",
      blackjackSummary: "Blackjack pays 3:2. Las Vegas, Atlantic City and European rules, with an optional basic-strategy coach.",
      rouletteGame: "Roulette",
      rouletteSummary: "A single-zero wheel with European and French rules, the racetrack and all 157 bets.",
      footerNote: "Play money only. Chips have no cash value and can never be bought or exchanged for money.",

      language: "Language",
      tableCloth: "Table cloth",
      themeEmerald: "Emerald",
      themeMidnight: "Midnight",
      themeBordeaux: "Bordeaux",
      clothHint: "The cloth you choose dresses every table in the pit.",
      addFunds: "Add play money",
      amount: "Amount",
      deposit: "Add",
      quickAdd: "Quick add",
      deposited: "Added {amount} to your balance",
      invalidDeposit: "Enter a positive whole-number amount",
      balanceLimit: "The balance cannot exceed {amount}",
      accountBusy: "A round with this balance is still in play at another table or tab. Try again when it ends.",
      temporaryAccount: "Shared storage protection is unavailable. This tab uses a separate session balance.",

      disclaimerTitle: "Disclaimer",
      disclaimerPlayMoney: "ThePit is a collection of casino table simulations for entertainment only. Chips and balances are play money with no cash value: they cannot be bought, sold or exchanged for money or prizes, and no real-money gambling is offered.",
      disclaimerOdds: "Every card and every spin is drawn at random on your device. Results here do not predict play at a real table. If gambling is causing problems for you or someone close to you, please seek help.",
      disclaimerWarranty: "Intended for adults. Not affiliated with any casino. Provided as is, without warranty of any kind.",
      versionLabel: "Version",
      licenseNotice: "Free software under the GNU AGPL v3",
      sourceCode: "Source code"
    },

    tr: {
      appTitle: "ThePit",
      appDescription: "Tamamen çevrimdışı çalışan, oyun parasıyla oynanan ücretsiz bir masa oyunları casinosu.",
      brandName: "ThePit",
      subtitle: "Çevrimdışı Casino",
      balance: "Bakiye",
      languageSelector: "Dil seçimi",
      settings: "Ayarlar",
      close: "Kapat",

      floorTitle: "Masanızı seçin",
      floorLead: "Bütün masalar aynı oyun parası bakiyesiyle, tamamen bu cihazda oynanır.",
      tablesLabel: "Masalar",
      takeSeat: "Masaya otur",
      roundOpen: "Yarım kalan tur",
      tableMinLabel: "EN AZ",
      tableMaxLabel: "EN ÇOK",
      blackjackGame: "Blackjack",
      blackjackSummary: "Blackjack 2'ye 3 öder. Las Vegas, Atlantic City ve Avrupa kuralları, isteğe bağlı temel strateji koçuyla.",
      rouletteGame: "Rulet",
      rouletteSummary: "Avrupa ve Fransız kurallarıyla tek sıfırlı çark, yarış pisti ve 157 bahsin tamamı.",
      footerNote: "Yalnızca oyun parası. Jetonların nakit değeri yoktur; satın alınamaz, paraya çevrilemez.",

      language: "Dil",
      tableCloth: "Masa çuhası",
      themeEmerald: "Zümrüt",
      themeMidnight: "Gece mavisi",
      themeBordeaux: "Bordo",
      clothHint: "Seçtiğiniz çuha salondaki bütün masalara serilir.",
      addFunds: "Oyun parası ekle",
      amount: "Tutar",
      deposit: "Ekle",
      quickAdd: "Hızlı bakiye ekle",
      deposited: "Bakiyenize {amount} eklendi",
      invalidDeposit: "Pozitif bir tam sayı tutarı girin",
      balanceLimit: "Bakiye {amount} tutarını aşamaz",
      accountBusy: "Bu bakiyeyle başka bir masada ya da sekmede tur sürüyor. Bitince yeniden deneyin.",
      temporaryAccount: "Ortak kayıt koruması kullanılamıyor. Bu sekme ayrı bir oturum bakiyesi kullanıyor.",

      disclaimerTitle: "Sorumluluk reddi",
      disclaimerPlayMoney: "ThePit yalnızca eğlence amaçlı casino masası simülasyonlarından oluşur. Jetonlar ve bakiye nakit değeri olmayan oyun parasıdır: satın alınamaz, satılamaz, paraya ya da ödüle çevrilemez. Gerçek parayla kumar sunulmaz.",
      disclaimerOdds: "Her kart ve her dönüş cihazınızda rastgele çekilir. Buradaki sonuçlar gerçek bir masada ne olacağını göstermez. Kumar sizin ya da bir yakınınız için sorun olmaya başladıysa lütfen yardım alın.",
      disclaimerWarranty: "Yetişkinlere yöneliktir. Hiçbir kumarhaneyle bağlantısı yoktur. Olduğu gibi, hiçbir garanti verilmeden sunulur.",
      versionLabel: "Sürüm",
      licenseNotice: "GNU AGPL v3 lisanslı özgür yazılım",
      sourceCode: "Kaynak kodu"
    }
  };

  var current = DEFAULT_LANG;
  var listeners = [];

  function detectInitial() {
    // A previously saved choice always wins and is remembered across visits.
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (saved && Object.prototype.hasOwnProperty.call(DICT, saved)) return saved;
    // First-ever visit: English is the primary language.
    return DEFAULT_LANG;
  }

  function fill(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, function (m, p) { return params[p] != null ? params[p] : m; });
  }

  function t(key, params) {
    var table = DICT[current] || DICT[DEFAULT_LANG];
    var str = table[key];
    if (str == null) str = DICT[DEFAULT_LANG][key] != null ? DICT[DEFAULT_LANG][key] : key;
    return fill(str, params);
  }

  function apply(root) {
    root = root || document;
    root.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    root.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
    });
    root.querySelectorAll("[data-i18n-aria-label]").forEach(function (el) {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label")));
    });
    root.querySelectorAll("[data-i18n-content]").forEach(function (el) {
      el.setAttribute("content", t(el.getAttribute("data-i18n-content")));
    });
    document.documentElement.setAttribute("lang", current);
    document.title = t("appTitle");
  }

  function setLanguage(lang) {
    if (!Object.prototype.hasOwnProperty.call(DICT, lang)) lang = DEFAULT_LANG;
    current = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    apply(document);
    listeners.forEach(function (fn) { try { fn(lang); } catch (e) {} });
  }

  function onChange(fn) { listeners.push(fn); }
  function get() { return current; }
  function locale() { return current === "tr" ? "tr-TR" : "en-US"; }

  current = detectInitial();

  global.I18n = {
    t: t,
    apply: apply,
    setLanguage: setLanguage,
    onChange: onChange,
    get: get,
    locale: locale,
    DEFAULT: DEFAULT_LANG,
    available: Object.keys(DICT),
    // Exposed for the parity tests.
    _dict: DICT
  };
})(typeof window !== "undefined" ? window : globalThis);
