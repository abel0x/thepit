/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Slot 5 — the slot machine's own words, in English and Turkish
   The words every page shares are in shared/js/i18n.js.
   ========================================================= */
(function (I18n) {
  "use strict";

  I18n.define({
    en: {
      appTitle: "Slot 5 · ThePit",
      appDescription: "A free, play-money slot machine simulation that works completely offline.",
      brandName: "Slot 5",
      subtitle: "Five reels · 20 lines",
      slotMachine: "Slot machine",
      reelsLabel: "Reels: {symbols}",
      reelColumn: "Reel {reel}: {symbols}",
      tableRtpLabel: "RETURN",

      symWild: "Wild", symStar: "Star", symSeven: "Seven", symDiamond: "Diamond", symBell: "Bell",
      symHorseshoe: "Horseshoe", symAce: "Ace", symKing: "King", symQueen: "Queen", symJack: "Jack",
      symWatermelon: "Watermelon", symGrapes: "Grapes", symLemon: "Lemon", symCherry: "Cherry",
      symbolSet: "Symbols",
      symbolsClassic: "Cards",
      symbolsFruit: "Fruits",

      placeBet: "Pick a chip for each line and spin",
      goodLuck: "Good luck",
      noWin: "No win this spin",
      winLine: "You win {amount}",
      lineWinItem: "Line {line}: {count} × {symbol}, {amount}",
      scatterWinItem: "{count} stars: {amount}",
      featureStart: "{count} stars: {spins} free spins, every win pays ×{multiplier}",
      freeSpinLine: "Free spin {n} of {total} · ×{multiplier}",
      featureTotal: "The free spins won {amount}",
      featureWon: "Free spins: {amount}",

      chipsLabel: "Bet per line",
      perLine: "{amount} a line × 20 lines",
      totalBet: "Total bet",
      win: "Win",
      lastWin: "Last win",
      spin: "Spin",
      autoplay: "Auto",
      autoplayTitle: "Autoplay",
      autoSpins: "Spins",
      autoLoss: "Stop after losing",
      autoWin: "Stop on a win of",
      autoNoLimit: "No limit",
      autoFeature: "Stop when free spins start",
      autoHint: "Limits count in total bets: 25× is 25 times what one spin costs. Autoplay also stops when the balance cannot pay the next spin, and whenever you press Stop.",
      autoStart: "Start autoplay",
      autoStop: "Stop · {left}",
      autoDone: "Autoplay finished",
      autoStopped: "Autoplay stopped",
      autoStopLoss: "Autoplay stopped at its loss limit",
      autoStopWin: "Autoplay stopped on a big win",
      autoStopFeature: "Autoplay stopped for the free spins",
      autoStopBalance: "Autoplay stopped: the balance cannot pay the next spin",

      insufficientFunds: "Not enough balance for this bet",
      roundRestored: "Your unfinished spin was settled: {result}",
      roundVoided: "An unfinished spin could not be restored. Its stake was returned.",
      restake: [
        "Your balance was topped up to {amount}.",
        "Fresh play money in the machine: {amount}."
      ],

      animationSpeed: "Reel speed",
      cardVolume: "Reels",
      tableVolume: "Machine cues",

      payoutsTitle: "Pays",
      paysHint: "Line pays are multiplied by the bet per line. A line pays from the leftmost reel, on any of the 20 lines, and only its best win counts.",
      wildRule: "The wild stands in for every symbol but the star, and pays on its own too; five sevens are the top prize.",
      scatterRule: "Stars pay wherever they land, multiplied by the total bet. Three or more start 10 free spins at the same bet, where every win pays triple. Free spins never start more free spins.",
      returnNote: "Return to player: 95.82% over the long run, as the reel strips and pays give it exactly. Free spins come about once in 140 paid spins.",
      linesTitle: "The 20 lines",
      payCount: "{count} in a row",
      scatterCount: "{count} stars",

      sessionStats: "Statistics",
      statSpins: "Paid spins",
      winningSpins: "Winning spins",
      statFeatures: "Free spin rounds",
      statFreeSpins: "Free spins",
      totalWagered: "Wagered",
      totalReturned: "Returned",
      netResult: "Net result",
      biggestWin: "Biggest win",
      resetStats: "Reset statistics",
      statsHint: "For entertainment: every spin is independent, so a long wait never makes a win more likely.",

      disclaimerPlayMoney: "Slot 5 is a slot machine simulation for entertainment only. Chips and balances are play money with no cash value: they cannot be bought, sold or exchanged for money or prizes, and no real-money gambling is offered.",
      disclaimerOdds: "Every reel stops at random on your device, and the machine returns 95.82% of what is wagered only over a very long run; any session can lose. If gambling is causing problems for you or someone close to you, please seek help."
    },

    tr: {
      appTitle: "Slot 5 · ThePit",
      appDescription: "Tamamen çevrimdışı çalışan, oyun parasıyla oynanan ücretsiz bir slot makinesi simülasyonu.",
      brandName: "Slot 5",
      subtitle: "Beş makara · 20 çizgi",
      slotMachine: "Slot makinesi",
      reelsLabel: "Makaralar: {symbols}",
      reelColumn: "{reel}. makara: {symbols}",
      tableRtpLabel: "GERİ DÖNÜŞ",

      symWild: "Joker", symStar: "Yıldız", symSeven: "Yedi", symDiamond: "Elmas", symBell: "Çan",
      symHorseshoe: "Nal", symAce: "As", symKing: "Papaz", symQueen: "Kız", symJack: "Vale",
      symWatermelon: "Karpuz", symGrapes: "Üzüm", symLemon: "Limon", symCherry: "Kiraz",
      symbolSet: "Semboller",
      symbolsClassic: "Kartlar",
      symbolsFruit: "Meyveler",

      placeBet: "Her çizgi için bir jeton seçin ve çevirin",
      goodLuck: "Bol şans",
      noWin: "Bu çevirmede kazanç yok",
      winLine: "{amount} kazandınız",
      lineWinItem: "{line}. çizgi: {count} × {symbol}, {amount}",
      scatterWinItem: "{count} yıldız: {amount}",
      featureStart: "{count} yıldız: {spins} bedava çevirme, her kazanç ×{multiplier} öder",
      freeSpinLine: "Bedava çevirme {n}/{total} · ×{multiplier}",
      featureTotal: "Bedava çevirmeler {amount} kazandırdı",
      featureWon: "Bedava çevirmeler: {amount}",

      chipsLabel: "Çizgi başına bahis",
      perLine: "Çizgi başına {amount} × 20 çizgi",
      totalBet: "Toplam bahis",
      win: "Kazanç",
      lastWin: "Son kazanç",
      spin: "Çevir",
      autoplay: "Oto",
      autoplayTitle: "Otomatik oyun",
      autoSpins: "Dönüş",
      autoLoss: "Şu kadar kayıpta dur",
      autoWin: "Şu kadar kazançta dur",
      autoNoLimit: "Sınır yok",
      autoFeature: "Bedava dönüşler başlayınca dur",
      autoHint: "Sınırlar toplam bahis cinsindendir: 25×, bir dönüşün 25 katıdır. Otomatik oyun bakiye bir sonraki dönüşü karşılayamadığında ve Durdur'a her bastığınızda da durur.",
      autoStart: "Otomatik oyunu başlat",
      autoStop: "Durdur · {left}",
      autoDone: "Otomatik oyun bitti",
      autoStopped: "Otomatik oyun durduruldu",
      autoStopLoss: "Otomatik oyun kayıp sınırında durdu",
      autoStopWin: "Otomatik oyun büyük bir kazançta durdu",
      autoStopFeature: "Otomatik oyun bedava dönüşler için durdu",
      autoStopBalance: "Otomatik oyun durdu: bakiye bir sonraki dönüşü karşılamıyor",

      insufficientFunds: "Bu bahis için bakiyeniz yetersiz",
      roundRestored: "Yarım kalan çevirmeniz sonuçlandı: {result}",
      roundVoided: "Yarım kalan bir çevirme geri yüklenemedi. Bahsi iade edildi.",
      restake: [
        "Bakiye {amount} olarak yenilendi.",
        "Makineye yeni oyun parası kondu: {amount}."
      ],

      animationSpeed: "Makara hızı",
      cardVolume: "Makaralar",
      tableVolume: "Makine sesleri",

      payoutsTitle: "Ödemeler",
      paysHint: "Çizgi ödemeleri çizgi başına bahisle çarpılır. Bir çizgi en soldaki makaradan başlayarak, 20 çizginin herhangi birinde öder ve yalnızca en iyi kazancı sayılır.",
      wildRule: "Joker yıldız dışındaki her sembolün yerine geçer; kendi başına da öder. En büyük ödül beş yedidir.",
      scatterRule: "Yıldızlar nereye düşerse düşsün toplam bahisle çarpılarak öder. Üç ya da daha fazlası aynı bahisle 10 bedava çevirme başlatır; bunlarda her kazanç üç katı öder. Bedava çevirmeler yeniden bedava çevirme başlatmaz.",
      returnNote: "Oyuncuya geri dönüş: uzun vadede %95,82; makara şeritleri ve ödemeler bunu tam olarak verir. Bedava çevirmeler yaklaşık 140 ücretli çevirmede bir gelir.",
      linesTitle: "20 çizgi",
      payCount: "Art arda {count}",
      scatterCount: "{count} yıldız",

      sessionStats: "İstatistikler",
      statSpins: "Ücretli çevirmeler",
      winningSpins: "Kazandıran çevirmeler",
      statFeatures: "Bedava çevirme turları",
      statFreeSpins: "Bedava çevirmeler",
      totalWagered: "Yatırılan",
      totalReturned: "Geri dönen",
      netResult: "Net sonuç",
      biggestWin: "En büyük kazanç",
      resetStats: "İstatistikleri sıfırla",
      statsHint: "Yalnızca eğlence için: her çevirme bağımsızdır, uzun bir bekleyiş kazancı daha olası yapmaz.",

      disclaimerPlayMoney: "Slot 5 yalnızca eğlence amaçlı bir slot makinesi simülasyonudur. Jetonlar ve bakiye nakit değeri olmayan oyun parasıdır: satın alınamaz, satılamaz, paraya ya da ödüle çevrilemez. Gerçek parayla kumar sunulmaz.",
      disclaimerOdds: "Her makara cihazınızda rastgele durur ve makine yatırılanın %95,82'ini yalnızca çok uzun vadede geri verir; her oturum kaybettirebilir. Kumar sizin ya da bir yakınınız için sorun olmaya başladıysa lütfen yardım alın."
    }
  });
})((typeof window !== "undefined" ? window : globalThis).I18n);
