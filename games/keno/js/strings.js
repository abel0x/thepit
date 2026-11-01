/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Keno 80 — the keno machine's own words, in English and Turkish
   The words every page shares are in shared/js/i18n.js.
   ========================================================= */
(function (I18n) {
  "use strict";

  I18n.define({
    en: {
      appTitle: "Keno 80 · ThePit",
      appDescription: "A free, play-money keno simulation that works completely offline.",
      brandName: "Keno 80",
      subtitle: "Pick up to 10 · 20 drawn",
      kenoBoard: "Keno board",
      boardLabel: "Numbers 1 to 80",
      tableRtpLabel: "RETURN",
      drawnLabel: "DRAWN",
      caughtLabel: "CAUGHT",
      numberLabel: "{number}",
      numberMarked: "{number}, marked",
      numberDrawn: "{number}, drawn",
      numberCaught: "{number}, marked and drawn",

      paytableTitle: "Pays for {count} marks",
      paytableTitleOne: "Pays for 1 mark",
      paytableEmpty: "Mark numbers on the board to see what they pay.",
      catchColumn: "Catch",
      paysColumn: "Pays",
      payFor: "{n} for 1",

      markNumbers: "Mark 1 to 10 numbers",
      readyLine: "{count} marked: play for {amount}",
      readyLineOne: "1 marked: play for {amount}",
      drawing: "Drawing",
      caughtLine: "Caught {hits} of {spots}",
      winLine: "You win {amount}",
      noWin: "No win this game",

      chipsLabel: "Bet per game",
      quickPick: "Quick pick",
      clear: "Clear",
      betLabel: "Bet",
      lastWin: "Last win",
      play: "Play",

      tooManyMarks: "A ticket holds up to 10 numbers",
      markFirst: "Mark at least one number first",
      insufficientFunds: "Not enough balance for this bet",
      roundRestored: "Your unfinished game was settled: {result}",
      roundVoided: "An unfinished game could not be restored. Its stake was returned.",
      restake: [
        "Your balance was topped up to {amount}.",
        "Fresh play money in the machine: {amount}."
      ],

      animationSpeed: "Draw speed",
      ballVolume: "Balls",
      tableVolume: "Machine cues",

      payoutsTitle: "How to play and pays",
      rulesLine: "Mark 1 to 10 of the 80 numbers, choose a bet with a chip and play: the machine draws 20 numbers at random. You are paid by how many of your marks are caught, from the pay table for the number of marks.",
      rulesPays: "Pays are for 1 and include the bet: 15 for 1 returns 15 times the bet. Your marks stay on the ticket, so Play again draws for the same numbers. Quick pick marks as many numbers as you have marked, or 10 on an empty ticket.",
      spotsColumn: "Marks",
      returnColumn: "Return",
      topPayColumn: "Top pay",
      returnNote: "Each return is exact, from the odds of the draw. With whole-dollar pays a ticket of 1 mark returns less than the others.",

      sessionStats: "Statistics",
      statGames: "Games",
      winningGames: "Winning games",
      statBestCatch: "Best catch",
      totalWagered: "Wagered",
      totalReturned: "Returned",
      netResult: "Net result",
      biggestWin: "Biggest win",
      resetStats: "Reset statistics",
      statsHint: "For entertainment: every draw is independent, so numbers that have not come up for a while are no more likely to come next.",

      disclaimerPlayMoney: "Keno 80 is a keno simulation for entertainment only. Chips and balances are play money with no cash value: they cannot be bought, sold or exchanged for money or prizes, and no real-money gambling is offered.",
      disclaimerOdds: "Every ball is drawn at random on your device, and every pay table returns exactly what the settings show only over a very long run; any session can lose. If gambling is causing problems for you or someone close to you, please seek help."
    },

    tr: {
      appTitle: "Keno 80 · ThePit",
      appDescription: "Tamamen çevrimdışı çalışan, oyun parasıyla oynanan ücretsiz bir keno simülasyonu.",
      brandName: "Keno 80",
      subtitle: "10'a kadar seç · 20 çekilir",
      kenoBoard: "Keno tahtası",
      boardLabel: "1'den 80'e sayılar",
      tableRtpLabel: "GERİ DÖNÜŞ",
      drawnLabel: "ÇEKİLEN",
      caughtLabel: "TUTAN",
      numberLabel: "{number}",
      numberMarked: "{number}, işaretli",
      numberDrawn: "{number}, çekildi",
      numberCaught: "{number}, işaretli ve çekildi",

      paytableTitle: "{count} işaret için ödemeler",
      paytableTitleOne: "1 işaret için ödemeler",
      paytableEmpty: "Ne ödediğini görmek için tahtada sayı işaretleyin.",
      catchColumn: "Tutan",
      paysColumn: "Öder",
      payFor: "1'e {n}",

      markNumbers: "1 ile 10 arası sayı işaretleyin",
      readyLine: "{count} işaretli: {amount} ile oynayın",
      readyLineOne: "1 işaretli: {amount} ile oynayın",
      drawing: "Çekiliyor",
      caughtLine: "{spots} işaretten {hits} tuttu",
      winLine: "{amount} kazandınız",
      noWin: "Bu oyunda kazanç yok",

      chipsLabel: "Oyun başına bahis",
      quickPick: "Hızlı seç",
      clear: "Temizle",
      betLabel: "Bahis",
      lastWin: "Son kazanç",
      play: "Oyna",

      tooManyMarks: "Bir bilet en çok 10 sayı alır",
      markFirst: "Önce en az bir sayı işaretleyin",
      insufficientFunds: "Bu bahis için bakiyeniz yetersiz",
      roundRestored: "Yarım kalan oyununuz sonuçlandı: {result}",
      roundVoided: "Yarım kalan bir oyun geri yüklenemedi. Bahsi iade edildi.",
      restake: [
        "Bakiye {amount} olarak yenilendi.",
        "Makineye yeni oyun parası kondu: {amount}."
      ],

      animationSpeed: "Çekiliş hızı",
      ballVolume: "Toplar",
      tableVolume: "Makine sesleri",

      payoutsTitle: "Nasıl oynanır ve ödemeler",
      rulesLine: "80 sayıdan 1 ile 10 arasını işaretleyin, bir jetonla bahsi seçin ve oynayın: makine rastgele 20 sayı çeker. İşaretlerinizden kaçının tuttuğuna göre, işaret sayısının ödeme tablosundan ödenirsiniz.",
      rulesPays: "Ödemeler 1'e göredir ve bahsi içerir: 1'e 15, bahsin 15 katını geri verir. İşaretleriniz bilette kalır, Oyna yeniden aynı sayılar için çeker. Hızlı seç, işaretlediğiniz kadar sayıyı, boş bilette 10 sayıyı işaretler.",
      spotsColumn: "İşaret",
      returnColumn: "Geri dönüş",
      topPayColumn: "En yüksek",
      returnNote: "Her geri dönüş, çekilişin olasılıklarından tam olarak hesaplanır. Ödemeler tam dolar olduğundan 1 işaretli bilet diğerlerinden az geri verir.",

      sessionStats: "İstatistikler",
      statGames: "Oyunlar",
      winningGames: "Kazandıran oyunlar",
      statBestCatch: "En iyi tutan",
      totalWagered: "Yatırılan",
      totalReturned: "Geri dönen",
      netResult: "Net sonuç",
      biggestWin: "En büyük kazanç",
      resetStats: "İstatistikleri sıfırla",
      statsHint: "Yalnızca eğlence için: her çekiliş bağımsızdır, uzun süredir çıkmayan sayılar bir sonrakinde daha olası değildir.",

      disclaimerPlayMoney: "Keno 80 yalnızca eğlence amaçlı bir keno simülasyonudur. Jetonlar ve bakiye nakit değeri olmayan oyun parasıdır: satın alınamaz, satılamaz, paraya ya da ödüle çevrilemez. Gerçek parayla kumar sunulmaz.",
      disclaimerOdds: "Her top cihazınızda rastgele çekilir ve her ödeme tablosu ayarlarda gösterilen geri dönüşü yalnızca çok uzun vadede verir; her oturum kaybettirebilir. Kumar sizin ya da bir yakınınız için sorun olmaya başladıysa lütfen yardım alın."
    }
  });
})((typeof window !== "undefined" ? window : globalThis).I18n);
