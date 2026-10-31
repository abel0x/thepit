/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   i18n — English (default) + Turkish, persisted in the browser
   ========================================================= */
(function (global) {
  "use strict";

  // Shared by every page of ThePit, so the language follows the player.
  var STORAGE_KEY = "pit.lang";
  var DEFAULT_LANG = "en";

  var DICT = {
    en: {
      appTitle: "Table 37 · ThePit",
      appDescription: "A free, play-money European roulette simulation that works completely offline.",
      brandName: "Table 37",
      subtitle: "European Roulette",
      subtitleFrench: "French Roulette",
      balance: "Balance",
      languageSelector: "Language selection",
      statistics: "Statistics",
      settings: "Settings",
      backToLobby: "Back to the lobby",
      muteSound: "Mute sound",
      unmuteSound: "Turn sound on",
      close: "Close",
      rouletteTable: "Roulette table",
      rouletteWheel: "Roulette wheel",
      wheelResult: "Roulette wheel. Last result: {result}",
      lastResults: "Last results",
      noResultsYet: "No spins yet",
      tableInformation: "Table information",
      tableMinLabel: "MIN",
      tableMaxLabel: "MAX",
      tableRulesLabel: "RULES",
      profileShortEuropean: "EUROPEAN",
      profileShortFrench: "LA PARTAGE",
      bettingLayoutRole: "betting layout",
      boardLabel: "Betting layout. Arrow keys choose a bet, Enter places a chip, Delete removes one.",
      racetrack: "Racetrack",
      controlsLabel: "Game controls",
      chipsLabel: "Chip value",
      undo: "Undo",
      clear: "Clear",
      double: "Double",
      rebet: "Rebet",
      spin: "Spin",
      totalBet: "Total bet",
      lastWin: "Last win",

      language: "Language",
      tableCloth: "Table cloth",
      themeEmerald: "Emerald",
      themeMidnight: "Midnight",
      themeBordeaux: "Bordeaux",
      tableRules: "Table rules",
      profileEuropean: "European",
      profileFrench: "French",
      profileEuropeanSummary: "Single zero · Every bet loses on zero · House edge 2.70%",
      profileFrenchSummary: "Single zero · La Partage returns half of even-money bets on zero · House edge 1.35% on those bets · French terms on the cloth",
      profileHint: "Rules change between spins. Amounts use whole dollars; half of an odd stake rounds down.",
      profileApplied: "{profile} rules applied",
      animationSpeed: "Spin speed",
      speedFast: "Fast",
      speedNormal: "Normal",
      speedCinematic: "Cinematic",
      neighboursSetting: "Racetrack neighbours",
      fewerNeighbours: "Fewer neighbours",
      moreNeighbours: "More neighbours",
      neighboursHint: "A number on the racetrack bets it and this many neighbours on each side of the wheel.",
      soundLabel: "Sound",
      soundMixer: "Sound levels",
      masterVolume: "Master",
      wheelVolume: "Wheel & ball",
      chipVolume: "Chips",
      tableVolume: "Table cues",

      payoutsTitle: "Bets and payouts",
      betStraight: "Straight up",
      betStraightCovers: "1 number",
      betSplit: "Split",
      betSplitCovers: "2 numbers",
      betStreet: "Street",
      betStreetCovers: "3 numbers in a row",
      betTrio: "Trio",
      betTrioCovers: "0 with 1-2 or 2-3",
      betCorner: "Corner",
      betCornerCovers: "4 numbers",
      betFirstFour: "First four",
      betFirstFourCovers: "0, 1, 2 and 3",
      betSixLine: "Six line",
      betSixLineCovers: "2 rows, 6 numbers",
      betColumnDozen: "Column · Dozen",
      betColumnDozenCovers: "12 numbers",
      betEvenMoney: "Red/Black · Odd/Even · 1-18/19-36",
      betEvenMoneyCovers: "18 numbers",
      announcedHint: "Racetrack call bets place their chips on the layout: Voisins du Zéro 9 chips, Tiers du Cylindre 6, Orphelins 5, Jeu Zéro 4.",

      sessionStats: "Statistics",
      spinsPlayed: "Spins",
      winningSpins: "Winning spins",
      totalWagered: "Wagered",
      totalReturned: "Returned",
      netResult: "Net result",
      biggestWin: "Biggest win",
      addFunds: "Add play money",
      deposit: "Add",
      amount: "Amount",
      quickAdd: "Quick add",
      deposited: "Added {amount} to your balance",
      invalidDeposit: "Enter a positive whole-number amount",
      balanceLimit: "The balance cannot exceed {amount}",
      resetStats: "Reset statistics",
      statsReset: "Statistics and results history cleared",
      disclaimerTitle: "Disclaimer",
      disclaimerPlayMoney: "Table 37 is a roulette simulation for entertainment only. Chips and balances are play money with no cash value: they cannot be bought, sold or exchanged for money or prizes, and no real-money gambling is offered.",
      disclaimerOdds: "Every result is drawn at random on your device and the wheel is animated to show it. Past results never change the odds of the next spin. If gambling is causing problems for you or someone close to you, please seek help.",
      disclaimerWarranty: "Intended for adults. Not affiliated with any casino. Provided as is, without warranty of any kind.",
      versionLabel: "Version",
      licenseNotice: "Free software under the GNU AGPL v3",
      sourceCode: "Source code",

      statsSample: "Based on the last {count} spins",
      statsEmpty: "Spin the wheel to start collecting results.",
      hotNumbers: "Hot numbers",
      coldNumbers: "Cold numbers",
      distribution: "Distribution",
      recentSpins: "Recent spins",
      statsHint: "For entertainment: every spin is independent, so earlier results never make a number more or less likely.",
      hitCount: "{count}×",
      spinsAgo: "{count} ago",
      notSeen: "not yet",
      distColors: "Red · Zero · Black",
      distParity: "Odd · Even",
      distRange: "1-18 · 19-36",
      distDozens: "Dozens",
      distColumns: "Columns",

      // Printed on the cloth
      feltLow: "1 to 18",
      feltEven: "EVEN",
      feltRed: "RED",
      feltBlack: "BLACK",
      feltOdd: "ODD",
      feltHigh: "19 to 36",
      feltDozen1: "1st 12",
      feltDozen2: "2nd 12",
      feltDozen3: "3rd 12",
      feltColumn: "2 to 1",

      // Bet names for tips and assistive technology
      betNameStraight: "Straight up {numbers}",
      betNameSplit: "Split {numbers}",
      betNameStreet: "Street {numbers}",
      betNameTrio: "Trio {numbers}",
      betNameCorner: "Corner {numbers}",
      betNameFirstFour: "First four {numbers}",
      betNameSixLine: "Six line {numbers}",
      betNameColumn: "Column {n}",
      betNameDozen: "Dozen {n}, {range}",
      betNameRed: "Red",
      betNameBlack: "Black",
      betNameOdd: "Odd",
      betNameEven: "Even",
      betNameLow: "1 to 18",
      betNameHigh: "19 to 36",
      payoutPays: "pays {profit} to 1",
      chipsOnBet: "{amount} on it",
      noChipsOnBet: "no chips",
      betFocus: "{name}, {pays}, {stake}",

      voisins: "Voisins du Zéro",
      tiers: "Tiers du Cylindre",
      orphelins: "Orphelins",
      zero: "Jeu Zéro",
      announcedLabel: "{name}: {chips} chips, numbers {numbers}",
      announcedPlaced: "{name}: {chips} chips of {unit}",
      neighbourLabel: "{number} with {count} neighbours each side",
      neighboursPlaced: "{number} and {count} neighbours each side: {chips} chips of {unit}",

      // Croupier calls and results
      placeBets: "Place your bets",
      noMoreBets: "No more bets",
      colorRed: "Red",
      colorBlack: "Black",
      colorGreen: "Zero",
      parityOdd: "Odd",
      parityEven: "Even",
      rangeLow: "1-18",
      rangeHigh: "19-36",
      resultLine: "{number} {color}",
      winLine: "You win {amount}",
      returnedLine: "Returned {amount}",
      noWin: "No win this time",
      partageLine: "La Partage: half of the even-money bets returned",
      netGain: "Net +{amount}",
      netLoss: "Net −{amount}",
      winBadge: "WIN",

      minBet: "Place a bet first",
      insufficientFunds: "Not enough balance for that chip",
      tableLimit: "Table maximum for this bet: {amount}",
      rebetUnavailable: "Not enough balance to repeat the last bets",
      doubleUnavailable: "Not enough balance to double every bet",
      announcedUnavailable: "Not enough balance for that call bet",
      accountBusy: "A round with this balance is still in play at another table or tab. Try again when it ends.",
      roundElsewhere: "Finish the round still open at {table} first.",
      temporaryAccount: "Shared storage protection is unavailable. This tab uses a separate session balance.",
      roundRestored: "Your unfinished spin was settled: {result}",
      roundVoided: "An unfinished spin could not be restored. Its stake was returned.",
      restake: [
        "Balance restored to {amount}.",
        "Fresh play money on the table: {amount}."
      ]
    },

    tr: {
      appTitle: "Table 37 · ThePit",
      appDescription: "Tamamen çevrimdışı çalışan, oyun parasıyla oynanan ücretsiz bir Avrupa ruleti simülasyonu.",
      brandName: "Table 37",
      subtitle: "Avrupa Ruleti",
      subtitleFrench: "Fransız Ruleti",
      balance: "Bakiye",
      languageSelector: "Dil seçimi",
      statistics: "İstatistikler",
      settings: "Ayarlar",
      backToLobby: "Lobiye dön",
      muteSound: "Sesi kapat",
      unmuteSound: "Sesi aç",
      close: "Kapat",
      rouletteTable: "Rulet masası",
      rouletteWheel: "Rulet çarkı",
      wheelResult: "Rulet çarkı. Son sonuç: {result}",
      lastResults: "Son sonuçlar",
      noResultsYet: "Henüz dönüş yok",
      tableInformation: "Masa bilgileri",
      tableMinLabel: "EN AZ",
      tableMaxLabel: "EN ÇOK",
      tableRulesLabel: "KURAL",
      profileShortEuropean: "AVRUPA",
      profileShortFrench: "LA PARTAGE",
      bettingLayoutRole: "bahis düzeni",
      boardLabel: "Bahis düzeni. Ok tuşları bahsi seçer, Enter jeton koyar, Delete bir jeton kaldırır.",
      racetrack: "Yarış pisti",
      controlsLabel: "Oyun kontrolleri",
      chipsLabel: "Jeton değeri",
      undo: "Geri al",
      clear: "Temizle",
      double: "Katla",
      rebet: "Tekrarla",
      spin: "Çevir",
      totalBet: "Toplam bahis",
      lastWin: "Son kazanç",

      language: "Dil",
      tableCloth: "Masa çuhası",
      themeEmerald: "Zümrüt",
      themeMidnight: "Gece mavisi",
      themeBordeaux: "Bordo",
      tableRules: "Masa kuralları",
      profileEuropean: "Avrupa",
      profileFrench: "Fransız",
      profileEuropeanSummary: "Tek sıfır · Sıfır gelince bütün bahisler kaybeder · Kasa avantajı %2,70",
      profileFrenchSummary: "Tek sıfır · La Partage: sıfır gelince eşit ödemeli bahislerin yarısı geri verilir · Bu bahislerde kasa avantajı %1,35 · Çuhada Fransızca terimler",
      profileHint: "Kurallar dönüşler arasında değişir. Tutarlar tam dolardır; tek sayılı bir bahsin yarısı aşağı yuvarlanır.",
      profileApplied: "{profile} kuralları uygulandı",
      animationSpeed: "Dönüş hızı",
      speedFast: "Hızlı",
      speedNormal: "Normal",
      speedCinematic: "Sinematik",
      neighboursSetting: "Pistteki komşu sayısı",
      fewerNeighbours: "Daha az komşu",
      moreNeighbours: "Daha çok komşu",
      neighboursHint: "Pistte bir sayıya dokunmak o sayıya ve çarkta iki yanındaki bu kadar komşusuna bahis yapar.",
      soundLabel: "Ses",
      soundMixer: "Ses düzeyleri",
      masterVolume: "Ana ses",
      wheelVolume: "Çark ve top",
      chipVolume: "Jetonlar",
      tableVolume: "Masa sesleri",

      payoutsTitle: "Bahisler ve ödemeler",
      betStraight: "Tek numara",
      betStraightCovers: "1 sayı",
      betSplit: "İkili",
      betSplitCovers: "2 sayı",
      betStreet: "Üçlü sıra",
      betStreetCovers: "Bir sıradaki 3 sayı",
      betTrio: "Sıfırlı üçlü",
      betTrioCovers: "0 ile 1-2 ya da 2-3",
      betCorner: "Köşe",
      betCornerCovers: "4 sayı",
      betFirstFour: "İlk dört",
      betFirstFourCovers: "0, 1, 2 ve 3",
      betSixLine: "Altılı sıra",
      betSixLineCovers: "2 sıra, 6 sayı",
      betColumnDozen: "Sütun · Düzine",
      betColumnDozenCovers: "12 sayı",
      betEvenMoney: "Kırmızı/Siyah · Tek/Çift · 1-18/19-36",
      betEvenMoneyCovers: "18 sayı",
      announcedHint: "Pistteki anons bahisleri jetonlarını düzene yerleştirir: Voisins du Zéro 9 jeton, Tiers du Cylindre 6, Orphelins 5, Jeu Zéro 4.",

      sessionStats: "İstatistikler",
      spinsPlayed: "Dönüşler",
      winningSpins: "Kazandıran dönüşler",
      totalWagered: "Yatırılan",
      totalReturned: "Geri dönen",
      netResult: "Net sonuç",
      biggestWin: "En büyük kazanç",
      addFunds: "Oyun parası ekle",
      deposit: "Ekle",
      amount: "Tutar",
      quickAdd: "Hızlı bakiye ekle",
      deposited: "Bakiyenize {amount} eklendi",
      invalidDeposit: "Pozitif bir tam sayı tutarı girin",
      balanceLimit: "Bakiye {amount} tutarını aşamaz",
      resetStats: "İstatistikleri sıfırla",
      statsReset: "İstatistikler ve sonuç geçmişi temizlendi",
      disclaimerTitle: "Sorumluluk reddi",
      disclaimerPlayMoney: "Table 37 yalnızca eğlence amaçlı bir rulet simülasyonudur. Jetonlar ve bakiye nakit değeri olmayan oyun parasıdır: satın alınamaz, satılamaz, paraya ya da ödüle çevrilemez. Gerçek parayla kumar sunulmaz.",
      disclaimerOdds: "Her sonuç cihazınızda rastgele çekilir ve çark onu göstermek için canlandırılır. Geçmiş sonuçlar bir sonraki dönüşün olasılıklarını asla değiştirmez. Kumar sizin ya da bir yakınınız için sorun olmaya başladıysa lütfen yardım alın.",
      disclaimerWarranty: "Yetişkinlere yöneliktir. Hiçbir kumarhaneyle bağlantısı yoktur. Olduğu gibi, hiçbir garanti verilmeden sunulur.",
      versionLabel: "Sürüm",
      licenseNotice: "GNU AGPL v3 lisanslı özgür yazılım",
      sourceCode: "Kaynak kodu",

      statsSample: "Son {count} dönüşe göre",
      statsEmpty: "Sonuç toplamaya başlamak için çarkı çevirin.",
      hotNumbers: "Sıcak sayılar",
      coldNumbers: "Soğuk sayılar",
      distribution: "Dağılım",
      recentSpins: "Son dönüşler",
      statsHint: "Yalnızca eğlence için: her dönüş bağımsızdır, önceki sonuçlar hiçbir sayıyı daha olası ya da daha az olası yapmaz.",
      hitCount: "{count}×",
      spinsAgo: "{count} önce",
      notSeen: "henüz yok",
      distColors: "Kırmızı · Sıfır · Siyah",
      distParity: "Tek · Çift",
      distRange: "1-18 · 19-36",
      distDozens: "Düzineler",
      distColumns: "Sütunlar",

      feltLow: "1 - 18",
      feltEven: "ÇİFT",
      feltRed: "KIRMIZI",
      feltBlack: "SİYAH",
      feltOdd: "TEK",
      feltHigh: "19 - 36",
      feltDozen1: "1. 12",
      feltDozen2: "2. 12",
      feltDozen3: "3. 12",
      feltColumn: "1'E 2",

      betNameStraight: "Tek numara {numbers}",
      betNameSplit: "İkili {numbers}",
      betNameStreet: "Üçlü sıra {numbers}",
      betNameTrio: "Sıfırlı üçlü {numbers}",
      betNameCorner: "Köşe {numbers}",
      betNameFirstFour: "İlk dört {numbers}",
      betNameSixLine: "Altılı sıra {numbers}",
      betNameColumn: "{n}. sütun",
      betNameDozen: "{n}. düzine, {range}",
      betNameRed: "Kırmızı",
      betNameBlack: "Siyah",
      betNameOdd: "Tek",
      betNameEven: "Çift",
      betNameLow: "1-18",
      betNameHigh: "19-36",
      payoutPays: "1'e {profit} öder",
      chipsOnBet: "üzerinde {amount}",
      noChipsOnBet: "jeton yok",
      betFocus: "{name}, {pays}, {stake}",

      voisins: "Voisins du Zéro",
      tiers: "Tiers du Cylindre",
      orphelins: "Orphelins",
      zero: "Jeu Zéro",
      announcedLabel: "{name}: {chips} jeton, sayılar {numbers}",
      announcedPlaced: "{name}: {chips} × {unit} jeton",
      neighbourLabel: "{number} ve iki yanından {count} komşu",
      neighboursPlaced: "{number} ve iki yanından {count} komşu: {chips} × {unit} jeton",

      placeBets: "Bahislerinizi yapın",
      noMoreBets: "Bahisler kapandı",
      colorRed: "Kırmızı",
      colorBlack: "Siyah",
      colorGreen: "Sıfır",
      parityOdd: "Tek",
      parityEven: "Çift",
      rangeLow: "1-18",
      rangeHigh: "19-36",
      resultLine: "{number} {color}",
      winLine: "{amount} kazandınız",
      returnedLine: "{amount} geri döndü",
      noWin: "Bu dönüşte kazanç yok",
      partageLine: "La Partage: eşit ödemeli bahislerin yarısı geri verildi",
      netGain: "Net +{amount}",
      netLoss: "Net −{amount}",
      winBadge: "KAZANÇ",

      minBet: "Önce bir bahis yapın",
      insufficientFunds: "Bu jeton için bakiyeniz yetersiz",
      tableLimit: "Bu bahsin masa üst sınırı: {amount}",
      rebetUnavailable: "Son bahisleri tekrarlamak için bakiyeniz yetersiz",
      doubleUnavailable: "Bütün bahisleri katlamak için bakiyeniz yetersiz",
      announcedUnavailable: "Bu anons bahsi için bakiyeniz yetersiz",
      accountBusy: "Bu bakiyeyle başka bir masada ya da sekmede tur sürüyor. Bitince yeniden deneyin.",
      roundElsewhere: "Önce {table} masasında açık kalan turu bitirin.",
      temporaryAccount: "Ortak kayıt koruması kullanılamıyor. Bu sekme ayrı bir oturum bakiyesi kullanıyor.",
      roundRestored: "Yarım kalan dönüşünüz sonuçlandı: {result}",
      roundVoided: "Yarım kalan bir dönüş geri yüklenemedi. Bahsi iade edildi.",
      restake: [
        "Bakiye {amount} olarak yenilendi.",
        "Masaya yeni oyun parası kondu: {amount}."
      ]
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
    if (Array.isArray(str)) str = str[0];
    return fill(str, params);
  }

  // Picks a random line from an array-valued key (falls back to t()).
  function pick(key, params) {
    var table = DICT[current] || DICT[DEFAULT_LANG];
    var val = table[key] != null ? table[key] : DICT[DEFAULT_LANG][key];
    if (Array.isArray(val) && val.length) return fill(val[Math.floor(Math.random() * val.length)], params);
    return t(key, params);
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
    root.querySelectorAll("[data-i18n-aria-roledescription]").forEach(function (el) {
      el.setAttribute("aria-roledescription", t(el.getAttribute("data-i18n-aria-roledescription")));
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
    pick: pick,
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
