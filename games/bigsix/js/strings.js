/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Wheel 54 — the Big Six wheel's own words, in English and Turkish
   The words every page shares are in shared/js/i18n.js.
   ========================================================= */
(function (I18n) {
  "use strict";

  I18n.define({
    en: {
      statsTitle: "Statistics",
      statsResult: "Result",
      statsBar: "Share",
      statsSeen: "Seen",
      statsChance: "Chance",
      statsSince: "Last",
      statsNever: "not yet",
      statsLatest: "last spin",
      statsAgo: "{n} ago",
      statsEmpty: "No spins yet: the chart fills in as the table plays.",
      statsLead: "The last {n} spins, up to 500.",
      statsSymbols: "Symbols",
      statsHint: "The bar is how often each result came, the mark on it its exact chance. Every spin is independent: a result that has not come for a while is no more likely to come next.",
      appTitle: "Wheel 54 · ThePit",
      appDescription: "A free, play-money Big Six wheel simulation that works completely offline.",
      brandName: "Wheel 54",
      subtitle: "Big Six",
      wheelTable: "Big Six wheel",
      bettingAreas: "Betting areas",
      wheelLabel: "The wheel, stopped on {symbol}",
      wheelWaiting: "The wheel waiting for a spin",
      historyLabel: "Last spins",

      oneName: "$1",
      twoName: "$2",
      fiveName: "$5",
      tenName: "$10",
      twentyName: "$20",
      jokerName: "Joker",
      logoName: "Logo",
      spotCount: "{count} of 54",
      spotBet: "Bet: {amount}",
      payTo: "{n} TO 1",

      placeBets: "Place your bets",
      wheelSpinning: "The wheel is spinning",
      landedOn: "The wheel stops on {symbol}",
      winLine: "You win {amount}",
      lostLine: "Lost {amount}",

      chipsLabel: "Chip value",
      undo: "Undo",
      clear: "Clear",
      rebet: "Rebet",
      spin: "Spin",
      onLayout: "On the layout",
      lastWin: "Last win",

      insufficientFunds: "Not enough balance for that chip",
      tableLimit: "Table maximum for this bet: {amount}",
      rebetUnavailable: "Not enough balance to repeat the last bets",
      roundRestored: "Your unfinished spin was settled: {result}",
      roundVoided: "An unfinished spin could not be restored. Its stake was returned.",
      restake: [
        "Your balance was topped up to {amount}.",
        "Fresh play money on the table: {amount}."
      ],

      animationSpeed: "Wheel speed",
      wheelVolume: "Wheel",
      tableVolume: "Table cues",

      payoutsTitle: "Bets and payouts",
      rulesLine: "Bet on a symbol, then spin: when the wheel stops, the bet on the symbol under the pointer wins and every other bet loses. A dollar symbol pays its number to 1; the Joker and the logo pay 40 to 1.",
      rulesWheel: "The wheel has 54 segments: 24 of $1, 15 of $2, 7 of $5, 4 of $10, 2 of $20, one Joker and one logo. Each segment is as likely as any other.",
      rulesWhole: "Every bet is settled by the spin it was made for: winners are paid with their stake back and the layout clears for the next spin. Rebet puts the last bets down again.",
      houseEdgeTitle: "House edges",
      edgeLine: "$1 11.11% · $2 16.67% · $5 22.22% · $10 18.52% · $20 22.22% · Joker and logo 24.07%",

      sessionStats: "Statistics",
      statSpins: "Spins",
      winningSpins: "Winning spins",
      statJackpots: "Joker and logo",
      totalWagered: "Wagered",
      totalReturned: "Returned",
      netResult: "Net result",
      biggestWin: "Biggest win",
      resetStats: "Reset statistics",
      statsHint: "For entertainment: every spin is independent, so the last spins never make a symbol more or less likely.",

      disclaimerPlayMoney: "Wheel 54 is a Big Six wheel simulation for entertainment only. Chips and balances are play money with no cash value: they cannot be bought, sold or exchanged for money or prizes, and no real-money gambling is offered.",
      disclaimerOdds: "Every spin of the wheel is drawn at random on your device. If gambling is causing problems for you or someone close to you, please seek help."
    },

    tr: {
      statsTitle: "İstatistikler",
      statsResult: "Sonuç",
      statsBar: "Pay",
      statsSeen: "Görülen",
      statsChance: "Olasılık",
      statsSince: "Son",
      statsNever: "henüz yok",
      statsLatest: "son çevirme",
      statsAgo: "{n} önce",
      statsEmpty: "Henüz çevirme yok: grafik masa oynadıkça dolar.",
      statsLead: "Son {n} çevirme, en çok 500.",
      statsSymbols: "Semboller",
      statsHint: "Çubuk her sonucun ne sıklıkla geldiğini, üzerindeki işaret kesin olasılığını gösterir. Her çevirme bağımsızdır: bir süredir gelmeyen bir sonucun bir sonraki çevirmede gelme olasılığı artmaz.",
      appTitle: "Wheel 54 · ThePit",
      appDescription: "Tamamen çevrimdışı çalışan, oyun parasıyla oynanan ücretsiz bir Big Six çarkı simülasyonu.",
      brandName: "Wheel 54",
      subtitle: "Big Six",
      wheelTable: "Big Six çarkı",
      bettingAreas: "Bahis alanları",
      wheelLabel: "Çark {symbol} üzerinde durdu",
      wheelWaiting: "Çark çevrilmeyi bekliyor",
      historyLabel: "Son çevirmeler",

      oneName: "$1",
      twoName: "$2",
      fiveName: "$5",
      tenName: "$10",
      twentyName: "$20",
      jokerName: "Joker",
      logoName: "Logo",
      spotCount: "54'te {count}",
      spotBet: "Bahis: {amount}",
      payTo: "1'E {n}",

      placeBets: "Bahislerinizi yapın",
      wheelSpinning: "Çark dönüyor",
      landedOn: "Çark {symbol} üzerinde durdu",
      winLine: "{amount} kazandınız",
      lostLine: "{amount} kaybettiniz",

      chipsLabel: "Jeton değeri",
      undo: "Geri al",
      clear: "Temizle",
      rebet: "Tekrarla",
      spin: "Çevir",
      onLayout: "Masada",
      lastWin: "Son kazanç",

      insufficientFunds: "Bu jeton için bakiyeniz yetersiz",
      tableLimit: "Bu bahsin masa üst sınırı: {amount}",
      rebetUnavailable: "Son bahisleri tekrarlamak için bakiyeniz yetersiz",
      roundRestored: "Yarım kalan çevirmeniz sonuçlandı: {result}",
      roundVoided: "Yarım kalan bir çevirme geri yüklenemedi. Bahsi iade edildi.",
      restake: [
        "Bakiye {amount} olarak yenilendi.",
        "Masaya yeni oyun parası kondu: {amount}."
      ],

      animationSpeed: "Çark hızı",
      wheelVolume: "Çark",
      tableVolume: "Masa sesleri",

      payoutsTitle: "Bahisler ve ödemeler",
      rulesLine: "Bir sembole bahis yapın ve çevirin: çark durduğunda okun altındaki sembolün bahsi kazanır, diğer bütün bahisler kaybeder. Dolar sembolleri kendi sayılarının 1'e katını öder; Joker ve logo 1'e 40 öder.",
      rulesWheel: "Çarkta 54 dilim var: 24 tane $1, 15 tane $2, 7 tane $5, 4 tane $10, 2 tane $20, bir Joker ve bir logo. Her dilim diğerleri kadar olasıdır.",
      rulesWhole: "Her bahis yapıldığı çevirmeyle sonuçlanır: kazananlar bahisleriyle birlikte ödenir ve masa bir sonraki çevirme için boşalır. Tekrarla son bahisleri yeniden koyar.",
      houseEdgeTitle: "Kasa avantajları",
      edgeLine: "$1 %11,11 · $2 %16,67 · $5 %22,22 · $10 %18,52 · $20 %22,22 · Joker ve logo %24,07",

      sessionStats: "İstatistikler",
      statSpins: "Çevirmeler",
      winningSpins: "Kazandıran çevirmeler",
      statJackpots: "Joker ve logo",
      totalWagered: "Yatırılan",
      totalReturned: "Geri dönen",
      netResult: "Net sonuç",
      biggestWin: "En büyük kazanç",
      resetStats: "İstatistikleri sıfırla",
      statsHint: "Yalnızca eğlence için: her çevirme bağımsızdır, son çevirmeler bir sembolü daha olası ya da daha az olası yapmaz.",

      disclaimerPlayMoney: "Wheel 54 yalnızca eğlence amaçlı bir Big Six çarkı simülasyonudur. Jetonlar ve bakiye nakit değeri olmayan oyun parasıdır: satın alınamaz, satılamaz, paraya ya da ödüle çevrilemez. Gerçek parayla kumar sunulmaz.",
      disclaimerOdds: "Çarkın her çevirmesi cihazınızda rastgele çekilir. Kumar sizin ya da bir yakınınız için sorun olmaya başladıysa lütfen yardım alın."
    }
  });
})((typeof window !== "undefined" ? window : globalThis).I18n);
