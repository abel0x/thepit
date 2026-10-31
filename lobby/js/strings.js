/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   ThePit — the lobby's own words, in English and Turkish
   The words every page shares are in shared/js/i18n.js.
   ========================================================= */
(function (I18n) {
  "use strict";

  I18n.define({
    en: {
      appTitle: "ThePit",
      appDescription: "A free, play-money casino of table games that works completely offline.",
      brandName: "ThePit",
      subtitle: "Offline Casino",

      floorTitle: "Choose your table",
      floorLead: "Every table plays from the same play-money balance, entirely on this device.",
      tablesLabel: "Tables",
      takeSeat: "Take a seat",
      roundOpen: "Unfinished round",
      blackjackGame: "Blackjack",
      blackjackSummary: "Blackjack pays 3:2. Las Vegas, Atlantic City and European rules, with an optional basic-strategy coach.",
      rouletteGame: "Roulette",
      rouletteSummary: "A single-zero wheel with European and French rules, the racetrack and all 157 bets.",
      baccaratGame: "Baccarat",
      baccaratSummary: "Punto Banco from an eight-deck shoe: Player, Banker, Tie and both pairs, with the bead plate and the big road.",
      threecardGame: "Three Card Poker",
      threecardSummary: "Ante and Play against the dealer, with the Ante Bonus and the Pair Plus, from a deck shuffled for every hand.",
      footerNote: "Play money only. Chips have no cash value and can never be bought or exchanged for money.",

      clothHint: "The cloth you choose dresses every table in the pit.",

      disclaimerPlayMoney: "ThePit is a collection of casino table simulations for entertainment only. Chips and balances are play money with no cash value: they cannot be bought, sold or exchanged for money or prizes, and no real-money gambling is offered.",
      disclaimerOdds: "Every card and every spin is drawn at random on your device. Results here do not predict play at a real table. If gambling is causing problems for you or someone close to you, please seek help."
    },

    tr: {
      appTitle: "ThePit",
      appDescription: "Tamamen çevrimdışı çalışan, oyun parasıyla oynanan ücretsiz bir masa oyunları casinosu.",
      brandName: "ThePit",
      subtitle: "Çevrimdışı Casino",

      floorTitle: "Masanızı seçin",
      floorLead: "Bütün masalar aynı oyun parası bakiyesiyle, tamamen bu cihazda oynanır.",
      tablesLabel: "Masalar",
      takeSeat: "Masaya otur",
      roundOpen: "Yarım kalan tur",
      blackjackGame: "Blackjack",
      blackjackSummary: "Blackjack 2'ye 3 öder. Las Vegas, Atlantic City ve Avrupa kuralları, isteğe bağlı temel strateji koçuyla.",
      rouletteGame: "Rulet",
      rouletteSummary: "Avrupa ve Fransız kurallarıyla tek sıfırlı çark, yarış pisti ve 157 bahsin tamamı.",
      baccaratGame: "Bakara",
      baccaratSummary: "Sekiz desteli ayakkabıdan Punto Banco: Oyuncu, Banko, Beraberlik ve iki çift; boncuk tablosu ve büyük yol ile.",
      threecardGame: "Üç Kartlı Poker",
      threecardSummary: "Krupiyeye karşı Ante ve Play, Ante Bonusu ve Pair Plus ile; her elde yeniden karıştırılan bir desteden.",
      footerNote: "Yalnızca oyun parası. Jetonların nakit değeri yoktur; satın alınamaz, paraya çevrilemez.",

      clothHint: "Seçtiğiniz çuha salondaki bütün masalara serilir.",

      disclaimerPlayMoney: "ThePit yalnızca eğlence amaçlı casino masası simülasyonlarından oluşur. Jetonlar ve bakiye nakit değeri olmayan oyun parasıdır: satın alınamaz, satılamaz, paraya ya da ödüle çevrilemez. Gerçek parayla kumar sunulmaz.",
      disclaimerOdds: "Her kart ve her dönüş cihazınızda rastgele çekilir. Buradaki sonuçlar gerçek bir masada ne olacağını göstermez. Kumar sizin ya da bir yakınınız için sorun olmaya başladıysa lütfen yardım alın."
    }
  });
})((typeof window !== "undefined" ? window : globalThis).I18n);
