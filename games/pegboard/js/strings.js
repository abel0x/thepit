/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Drop 16 — the peg board machine's own words, in English and Turkish
   The words every page shares are in shared/js/i18n.js.
   ========================================================= */
(function (I18n) {
  "use strict";

  I18n.define({
    en: {
      appTitle: "Drop 16 · ThePit",
      appDescription: "A free, play-money peg board machine that works completely offline.",
      brandName: "Drop 16",
      subtitle: "Peg board",
      machineLabel: "Peg board machine",
      boardLabel: "The board: {rows} rows of pegs, {risk} risk",
      tableRtpLabel: "RETURN",
      ballsLabel: "BALLS",
      lastLabel: "LAST",

      rowsLabel: "Rows",
      riskLabel: "Risk",
      riskLow: "Low",
      riskMedium: "Medium",
      riskHigh: "High",
      historyLabel: "Last drops",
      historyEmpty: "No drops yet",
      times: "{n}×",

      placeBet: "Choose a bet and drop",
      dropping: "The ball is on its way down",
      droppingMany: "{balls} balls on their way down",
      landedWin: "{pays}: you win {amount}",
      landedBack: "{pays}: {amount} back",
      manyResult: "{balls} balls: {amount} back",
      winLine: "You win {amount}",
      lostLine: "Down {amount} on this round",
      evenLine: "Your stake is back",

      chipsLabel: "Bet per ball",
      ballsPicker: "Balls per drop",
      betLabel: "Bet",
      ballsLine: "{balls} balls · {amount}",
      lastWin: "Last win",
      drop: "Drop",

      insufficientFunds: "Not enough balance for this drop",
      roundRestored: "Your unfinished drop was settled: {result}",
      roundVoided: "An unfinished drop could not be restored. Its stake was returned.",
      restake: [
        "Your balance was topped up to {amount}.",
        "Fresh play money in the machine: {amount}."
      ],

      animationSpeed: "Ball speed",
      pegVolume: "Pegs",
      tableVolume: "Machine cues",

      payoutsTitle: "Boards and payouts",
      howToPlay: "Choose the rows of pegs, the risk and a bet, then drop. At every row the ball bounces left or right, each with an even chance, and lands in a slot at the bottom that pays its multiple of the bet.",
      ballsRules: "Drop 1, 5, 10 or 20 balls at a time, each with the bet. Every ball's way down is drawn and saved before the first one falls, and they are paid together when the last one lands.",
      returnsCaption: "Return of every board",
      riskColumn: "Risk",
      returnsHint: "Every return is counted exactly over all the ways down a board: 256 for 8 rows, 4,096 for 12 and 65,536 for 16. A higher risk spreads about the same return over fewer, larger pays.",
      rulesHint: "Bets are whole tens of dollars, so every slot pays whole dollars. The rows and the risk change between drops.",

      sessionStats: "Statistics",
      statDrops: "Balls dropped",
      statWinningDrops: "Paid more than the bet",
      statBest: "Best multiple",
      totalWagered: "Wagered",
      totalReturned: "Returned",
      netResult: "Net result",
      biggestWin: "Biggest win",
      resetStats: "Reset statistics",
      noneYet: "None yet",
      statsHint: "For entertainment: every bounce is drawn fresh, so past drops never make the next one more or less likely.",

      disclaimerPlayMoney: "Drop 16 is a peg board simulation for entertainment only. Chips and balances are play money with no cash value: they cannot be bought, sold or exchanged for money or prizes, and no real-money gambling is offered.",
      disclaimerOdds: "Every bounce is drawn at random on your device. If gambling is causing problems for you or someone close to you, please seek help."
    },

    tr: {
      appTitle: "Drop 16 · ThePit",
      appDescription: "Tamamen çevrimdışı çalışan, oyun parasıyla oynanan ücretsiz bir çivili tahta makinesi.",
      brandName: "Drop 16",
      subtitle: "Çivili tahta",
      machineLabel: "Çivili tahta makinesi",
      boardLabel: "Tahta: {rows} sıra çivi, {risk} risk",
      tableRtpLabel: "GERİ ÖDEME",
      ballsLabel: "TOP",
      lastLabel: "SON",

      rowsLabel: "Sıra",
      riskLabel: "Risk",
      riskLow: "Düşük",
      riskMedium: "Orta",
      riskHigh: "Yüksek",
      historyLabel: "Son atışlar",
      historyEmpty: "Henüz atış yok",
      times: "{n}×",

      placeBet: "Bahsinizi seçin ve bırakın",
      dropping: "Top aşağı iniyor",
      droppingMany: "{balls} top aşağı iniyor",
      landedWin: "{pays}: {amount} kazandınız",
      landedBack: "{pays}: {amount} geri döndü",
      manyResult: "{balls} top: {amount} geri döndü",
      winLine: "{amount} kazandınız",
      lostLine: "Bu turda {amount} eksidesiniz",
      evenLine: "Bahsiniz geri döndü",

      chipsLabel: "Top başına bahis",
      ballsPicker: "Bir atıştaki top",
      betLabel: "Bahis",
      ballsLine: "{balls} top · {amount}",
      lastWin: "Son kazanç",
      drop: "Bırak",

      insufficientFunds: "Bu atış için bakiyeniz yetersiz",
      roundRestored: "Yarım kalan atışınız sonuçlandı: {result}",
      roundVoided: "Yarım kalan bir atış geri yüklenemedi. Bahsi iade edildi.",
      restake: [
        "Bakiye {amount} olarak yenilendi.",
        "Makineye yeni oyun parası kondu: {amount}."
      ],

      animationSpeed: "Top hızı",
      pegVolume: "Çiviler",
      tableVolume: "Makine sesleri",

      payoutsTitle: "Tahtalar ve ödemeler",
      howToPlay: "Çivi sırasını, riski ve bahsi seçip bırakın. Top her sırada eşit olasılıkla sağa ya da sola seker ve aşağıdaki bir yuvaya düşer; yuva bahsin üzerindeki katını öder.",
      ballsRules: "Bir seferde 1, 5, 10 ya da 20 top bırakın, her biri aynı bahisle. Her topun yolu ilk top düşmeden çekilip kaydedilir ve hepsi son top düştüğünde birlikte ödenir.",
      returnsCaption: "Her tahtanın geri ödemesi",
      riskColumn: "Risk",
      returnsHint: "Her geri ödeme, tahtanın bütün yolları üzerinden tam olarak sayılır: 8 sırada 256, 12 sırada 4.096 ve 16 sırada 65.536 yol. Risk yükseldikçe aşağı yukarı aynı geri ödeme daha az sayıda ama daha büyük ödemeye yayılır.",
      rulesHint: "Bahisler onlu dolarlardır, böylece her yuva tam dolar öder. Sıra ve risk atışlar arasında değişir.",

      sessionStats: "İstatistikler",
      statDrops: "Bırakılan top",
      statWinningDrops: "Bahisten fazla ödeyen",
      statBest: "En iyi kat",
      totalWagered: "Yatırılan",
      totalReturned: "Geri dönen",
      netResult: "Net sonuç",
      biggestWin: "En büyük kazanç",
      resetStats: "İstatistikleri sıfırla",
      noneYet: "Henüz yok",
      statsHint: "Yalnızca eğlence için: her sekme yeniden çekilir, geçmiş atışlar bir sonrakini daha olası ya da daha az olası yapmaz.",

      disclaimerPlayMoney: "Drop 16 yalnızca eğlence amaçlı bir çivili tahta simülasyonudur. Jetonlar ve bakiye nakit değeri olmayan oyun parasıdır: satın alınamaz, satılamaz, paraya ya da ödüle çevrilemez. Gerçek parayla kumar sunulmaz.",
      disclaimerOdds: "Her sekme cihazınızda rastgele çekilir. Kumar sizin ya da bir yakınınız için sorun olmaya başladıysa lütfen yardım alın."
    }
  });
})((typeof window !== "undefined" ? window : globalThis).I18n);
