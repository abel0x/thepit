/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Poker 11 — the video poker machine's own words, in English and Turkish
   The words every page shares are in shared/js/i18n.js.
   ========================================================= */
(function (I18n) {
  "use strict";

  I18n.define({
    en: {
      appTitle: "Poker 11 · ThePit",
      appDescription: "A free, play-money Jacks or Better video poker simulation that works completely offline.",
      brandName: "Poker 11",
      subtitle: "Jacks or Better",
      pokerMachine: "Video poker machine",
      tableRtpLabel: "RETURN",
      payTableLabel: "Pay table",
      handHeader: "Hand",
      handCards: "Your hand",

      catRoyalFlush: "Royal flush",
      catStraightFlush: "Straight flush",
      catQuads: "Four of a kind",
      catFullHouse: "Full house",
      catFlush: "Flush",
      catStraight: "Straight",
      catTrips: "Three of a kind",
      catTwoPair: "Two pair",
      catJacksOrBetter: "Jacks or better",
      handPair: "Pair of {ranks}",
      rankPlural11: "Jacks", rankPlural12: "Queens", rankPlural13: "Kings", rankPlural14: "Aces",

      placeBet: "Pick a coin value and deal",
      holdPrompt: "Hold the cards you want, then draw",
      resultWin: "{hand}: you win {amount}",
      resultNothing: "No paying hand",
      coachHold: "Strategy: hold the marked cards",
      coachDrawAll: "Strategy: draw five new cards",
      coachStand: "Strategy: keep all five",

      chipsLabel: "Coin value",
      hold: "Hold",
      held: "Held",
      holdCard: "Hold {card}",
      betOne: "Bet one",
      betMax: "Bet max",
      deal: "Deal",
      draw: "Draw",
      coinsLine: "{coins} × {amount}",
      totalBet: "Total bet",
      win: "Win",
      lastWin: "Last win",

      insufficientFunds: "Not enough balance for this bet",
      roundRestored: "Your unfinished hand was settled: {result}",
      roundResumed: "Your hand is still on the machine: hold and draw",
      roundVoided: "An unfinished hand could not be restored. Its stake was returned.",
      restake: [
        "Your balance was topped up to {amount}.",
        "Fresh play money in the machine: {amount}."
      ],

      tableRules: "Pay table",
      profileNineSix: "9/6",
      profileEightFive: "8/5",
      profileNineSixSummary: "Full house pays 9, flush 6 · Returns 99.54% with the best play",
      profileEightFiveSummary: "Full house pays 8, flush 5 · Returns 97.30% with the best play",
      profileHint: "The pay table changes between hands.",
      coachLabel: "Strategy hint",
      coachHint: "Marks the hold that returns the most on average, worked out exactly from every possible draw.",
      animationSpeed: "Dealing speed",
      cardVolume: "Cards",
      tableVolume: "Machine cues",

      payoutsTitle: "How to play",
      howToPlay: "Pick a coin value and bet one to five coins, then deal five cards. Hold any of them and draw once: every card you let go is replaced from the same deck. The hand you end with pays by the table.",
      paysHint: "Pays are in coins for the coins bet, the bet included. A pair pays only when it is Jacks or better.",
      royalNote: "A royal flush pays 250 a coin, and 800 a coin when all five coins are bet.",
      returnNote: "With the best play on every hand and five coins bet, the 9/6 table returns 99.54% and the 8/5 table 97.30%. With fewer coins the return is lower.",
      rulesHint: "One deck, shuffled for every hand. Amounts use whole dollars.",

      sessionStats: "Statistics",
      statHands: "Hands",
      winningHands: "Winning hands",
      statRoyals: "Royal flushes",
      statBestHand: "Best hand",
      totalWagered: "Wagered",
      totalReturned: "Returned",
      netResult: "Net result",
      biggestWin: "Biggest win",
      resetStats: "Reset statistics",
      noHandYet: "None yet",
      statsHint: "For entertainment: every hand is dealt from a freshly shuffled deck, so past hands never make the next one more or less likely.",

      disclaimerPlayMoney: "Poker 11 is a video poker simulation for entertainment only. Chips and balances are play money with no cash value: they cannot be bought, sold or exchanged for money or prizes, and no real-money gambling is offered.",
      disclaimerOdds: "Every card is drawn at random on your device from a deck shuffled for each hand, and the return is reached only over a very long run with the best play; any session can lose. If gambling is causing problems for you or someone close to you, please seek help."
    },

    tr: {
      appTitle: "Poker 11 · ThePit",
      appDescription: "Tamamen çevrimdışı çalışan, oyun parasıyla oynanan ücretsiz bir Jacks or Better video poker simülasyonu.",
      brandName: "Poker 11",
      subtitle: "Jacks or Better",
      pokerMachine: "Video poker makinesi",
      tableRtpLabel: "GERİ DÖNÜŞ",
      payTableLabel: "Ödeme tablosu",
      handHeader: "El",
      handCards: "Eliniz",

      catRoyalFlush: "Royal flush",
      catStraightFlush: "Sıralı renk",
      catQuads: "Kare",
      catFullHouse: "Ful",
      catFlush: "Renk",
      catStraight: "Kent",
      catTrips: "Üçlü",
      catTwoPair: "Döper",
      catJacksOrBetter: "Vale ya da üstü per",
      handPair: "{ranks} per",
      rankPlural11: "Vale", rankPlural12: "Kız", rankPlural13: "Papaz", rankPlural14: "As",

      placeBet: "Bir jeton değeri seçin ve dağıtın",
      holdPrompt: "İstediğiniz kartları tutun, sonra çekin",
      resultWin: "{hand}: {amount} kazandınız",
      resultNothing: "Ödeme yapan el yok",
      coachHold: "Strateji: işaretli kartları tutun",
      coachDrawAll: "Strateji: beş yeni kart çekin",
      coachStand: "Strateji: beşini de tutun",

      chipsLabel: "Jeton değeri",
      hold: "Tut",
      held: "Tutuldu",
      holdCard: "{card} kartını tut",
      betOne: "Bir jeton",
      betMax: "En yüksek",
      deal: "Dağıt",
      draw: "Çek",
      coinsLine: "{coins} × {amount}",
      totalBet: "Toplam bahis",
      win: "Kazanç",
      lastWin: "Son kazanç",

      insufficientFunds: "Bu bahis için bakiyeniz yetersiz",
      roundRestored: "Yarım kalan eliniz sonuçlandı: {result}",
      roundResumed: "Eliniz hâlâ makinede: tutun ve çekin",
      roundVoided: "Yarım kalan bir el geri yüklenemedi. Bahsi iade edildi.",
      restake: [
        "Bakiye {amount} olarak yenilendi.",
        "Makineye yeni oyun parası kondu: {amount}."
      ],

      tableRules: "Ödeme tablosu",
      profileNineSix: "9/6",
      profileEightFive: "8/5",
      profileNineSixSummary: "Ful 9, renk 6 öder · En iyi oyunla geri dönüş %99,54",
      profileEightFiveSummary: "Ful 8, renk 5 öder · En iyi oyunla geri dönüş %97,30",
      profileHint: "Ödeme tablosu eller arasında değişir.",
      coachLabel: "Strateji ipucu",
      coachHint: "Ortalamada en çok geri döndüren tutuşu işaretler; her olası çekiş tek tek hesaplanır.",
      animationSpeed: "Dağıtım hızı",
      cardVolume: "Kartlar",
      tableVolume: "Makine sesleri",

      payoutsTitle: "Nasıl oynanır",
      howToPlay: "Bir jeton değeri seçip bir ile beş arası jeton yatırın, sonra beş kart dağıtın. İstediklerinizi tutup bir kez çekin: bıraktığınız her kartın yerine aynı desteden yenisi gelir. Elinizde kalan el tabloya göre ödenir.",
      paysHint: "Ödemeler, yatırılan jetonlar için jeton cinsindendir ve bahsi de içerir. Per yalnızca vale ya da üstüyse öder.",
      royalNote: "Royal flush jeton başına 250, beş jetonun hepsi yatırıldığında jeton başına 800 öder.",
      returnNote: "Her elde en iyi oyunla ve beş jetonla 9/6 tablo %99,54, 8/5 tablo %97,30 geri döndürür. Daha az jetonla geri dönüş düşer.",
      rulesHint: "Tek deste, her elde yeniden karıştırılır. Tutarlar tam dolardır.",

      sessionStats: "İstatistikler",
      statHands: "Eller",
      winningHands: "Kazandıran eller",
      statRoyals: "Royal flush",
      statBestHand: "En iyi el",
      totalWagered: "Yatırılan",
      totalReturned: "Geri dönen",
      netResult: "Net sonuç",
      biggestWin: "En büyük kazanç",
      resetStats: "İstatistikleri sıfırla",
      noHandYet: "Henüz yok",
      statsHint: "Yalnızca eğlence için: her el yeni karıştırılmış bir desteden dağıtılır, geçmiş eller bir sonrakini daha olası ya da daha az olası yapmaz.",

      disclaimerPlayMoney: "Poker 11 yalnızca eğlence amaçlı bir video poker simülasyonudur. Jetonlar ve bakiye nakit değeri olmayan oyun parasıdır: satın alınamaz, satılamaz, paraya ya da ödüle çevrilemez. Gerçek parayla kumar sunulmaz.",
      disclaimerOdds: "Her kart cihazınızda, her el için karıştırılan bir desteden rastgele çekilir; geri dönüşe ancak çok uzun bir sürede ve en iyi oyunla ulaşılır, her oturum kaybedebilir. Kumar sizin ya da bir yakınınız için sorun olmaya başladıysa lütfen yardım alın."
    }
  });
})((typeof window !== "undefined" ? window : globalThis).I18n);
