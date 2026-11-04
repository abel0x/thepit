/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 4 — the Fan-Tan table's own words, in English and Turkish
   The words every page shares are in shared/js/i18n.js.
   ========================================================= */
(function (I18n) {
  "use strict";

  I18n.define({
    en: {
      appTitle: "Table 4 · ThePit",
      appDescription: "A free, play-money Fan-Tan simulation that works completely offline.",
      brandName: "Table 4",
      subtitle: "Fan-Tan",
      fantanTable: "Fan-Tan table",
      bettingAreas: "Betting areas",
      bowlLabel: "The croupier's beads",
      bowlIdle: "The beads wait under the bowl",
      bowlCount: "{beads} beads, {left} left",
      resultsLabel: "Last results",
      tableBoxLabel: "CREDIT",
      boxTitle: "Change waiting in the box: {amount}",

      fanSection: "Fan",
      pairSection: "Kwok, Odd and Even",
      sshSection: "Sheh Sam Hong",
      nimSection: "Nim",
      tanSection: "Nga Tan",
      nimNote: "RETURNED ON THE SECOND NUMBER",
      tanNote: "RETURNED ON THE THIRD NUMBER",
      payFan: "3 TO 1",
      payPair: "1 TO 1",
      payNim: "2 TO 1",
      payTan: "1 TO 2",
      paySsh: "1 TO 3",
      oddName: "Odd",
      evenName: "Even",
      fanName: "Fan {a}",
      kwokName: "Kwok {a}·{b}",
      sshName: "{a}·{b}·{c}",
      nimName: "{a} Nim {b}",
      tanName: "{a}·{b} Tan {c}",
      spotLabel: "{name}: wins on {wins}{push}, pays {pays}. Bet: {amount}",
      pushPart: ", returned on {push}",
      orWord: " or ",

      placeBets: "Place your bets",
      noMoreBets: "No more bets",
      counting: "The croupier counts the beads in fours",
      resultLine: "{beads} beads: {left} left",
      winLine: "You win {amount}",
      returnedLine: "Returned {amount}",
      noWin: "No win this round",

      chipsLabel: "Chip value",
      undo: "Undo",
      clear: "Clear",
      double: "Double",
      rebet: "Rebet",
      open: "Open",
      totalBet: "Total bet",
      lastWin: "Last win",

      betRequired: "Place a bet to open the bowl",
      insufficientFunds: "Not enough balance for that chip",
      tableLimit: "Table maximum for this bet: {amount}",
      rebetUnavailable: "Not enough balance to repeat the last bets",
      doubleUnavailable: "Not enough balance to double every bet",
      roundRestored: "Your unfinished round was settled: {result}",
      roundVoided: "An unfinished round could not be restored. Its stake was returned.",
      restake: [
        "Your balance was topped up to {amount}.",
        "Fresh play money on the table: {amount}."
      ],

      animationSpeed: "Counting speed",
      tableVolume: "Table cues",

      payoutsTitle: "Bets and payouts",
      howToPlay: "Bet on the numbers 1 to 4. The croupier takes a pile of beads and counts them off four at a time; the one to four beads left at the end are the number that wins.",
      betsRules: "Fan wins on its number. Kwok wins on the two numbers at a corner, Odd on 1 and 3, Even on 2 and 4, and Sheh Sam Hong on three numbers. Nim wins on its first number and is returned on its second; Nga Tan wins on its first two and is returned on its third.",
      commissionRules: "Every win is paid its odds less 5% commission. The whole dollars are paid at once and the change waits in the box for a later win, so every bet is paid exactly its odds less 5%.",
      houseEdges: "House edge: Fan 3.75%; Nim, Kwok, Odd and Even 2.50%; Nga Tan and Sheh Sam Hong 1.25%.",
      beadsHint: "The pile holds 41 to 104 beads, drawn on your device: each of the four numbers is left by sixteen of the sixty-four piles.",

      sessionStats: "Statistics",
      statRounds: "Rounds",
      winningRounds: "Winning rounds",
      statResults: "Results 1 · 2 · 3 · 4",
      totalWagered: "Wagered",
      totalReturned: "Returned",
      netResult: "Net result",
      biggestWin: "Biggest win",
      resetStats: "Reset statistics",
      statsHint: "For entertainment: every pile is drawn fresh, so past results never make a number more or less likely.",

      disclaimerPlayMoney: "Table 4 is a Fan-Tan simulation for entertainment only. Chips and balances are play money with no cash value: they cannot be bought, sold or exchanged for money or prizes, and no real-money gambling is offered.",
      disclaimerOdds: "Every pile of beads is drawn at random on your device. If gambling is causing problems for you or someone close to you, please seek help."
    },

    tr: {
      appTitle: "Table 4 · ThePit",
      appDescription: "Tamamen çevrimdışı çalışan, oyun parasıyla oynanan ücretsiz bir Fan-Tan simülasyonu.",
      brandName: "Table 4",
      subtitle: "Fan-Tan",
      fantanTable: "Fan-Tan masası",
      bettingAreas: "Bahis alanları",
      bowlLabel: "Krupiyenin boncukları",
      bowlIdle: "Boncuklar kâsenin altında bekliyor",
      bowlCount: "{beads} boncuk, {left} kaldı",
      resultsLabel: "Son sonuçlar",
      tableBoxLabel: "ALACAK",
      boxTitle: "Kutuda bekleyen bozukluk: {amount}",

      fanSection: "Fan",
      pairSection: "Kwok, Tek ve Çift",
      sshSection: "Sheh Sam Hong",
      nimSection: "Nim",
      tanSection: "Nga Tan",
      nimNote: "İKİNCİ SAYIDA GERİ DÖNER",
      tanNote: "ÜÇÜNCÜ SAYIDA GERİ DÖNER",
      payFan: "1'E 3",
      payPair: "1'E 1",
      payNim: "1'E 2",
      payTan: "2'YE 1",
      paySsh: "3'E 1",
      oddName: "Tek",
      evenName: "Çift",
      fanName: "Fan {a}",
      kwokName: "Kwok {a}·{b}",
      sshName: "{a}·{b}·{c}",
      nimName: "{a} Nim {b}",
      tanName: "{a}·{b} Tan {c}",
      spotLabel: "{name}: {wins} gelirse kazanır{push}, {pays} öder. Bahis: {amount}",
      pushPart: ", {push} gelirse geri döner",
      orWord: " ya da ",

      placeBets: "Bahislerinizi yapın",
      noMoreBets: "Bahisler kapandı",
      counting: "Krupiye boncukları dörder dörder sayıyor",
      resultLine: "{beads} boncuk: {left} kaldı",
      winLine: "{amount} kazandınız",
      returnedLine: "{amount} geri döndü",
      noWin: "Bu turda kazanç yok",

      chipsLabel: "Jeton değeri",
      undo: "Geri al",
      clear: "Temizle",
      double: "Katla",
      rebet: "Tekrarla",
      open: "Aç",
      totalBet: "Toplam bahis",
      lastWin: "Son kazanç",

      betRequired: "Kâseyi açmak için bir bahis yapın",
      insufficientFunds: "Bu jeton için bakiyeniz yetersiz",
      tableLimit: "Bu bahsin masa üst sınırı: {amount}",
      rebetUnavailable: "Son bahisleri tekrarlamak için bakiyeniz yetersiz",
      doubleUnavailable: "Bütün bahisleri katlamak için bakiyeniz yetersiz",
      roundRestored: "Yarım kalan turunuz sonuçlandı: {result}",
      roundVoided: "Yarım kalan bir tur geri yüklenemedi. Bahsi iade edildi.",
      restake: [
        "Bakiye {amount} olarak yenilendi.",
        "Masaya yeni oyun parası kondu: {amount}."
      ],

      animationSpeed: "Sayım hızı",
      tableVolume: "Masa sesleri",

      payoutsTitle: "Bahisler ve ödemeler",
      howToPlay: "1'den 4'e kadar sayılara bahis yapın. Krupiye bir avuç boncuk alır ve onları dörder dörder ayırır; sonunda kalan bir ile dört boncuk kazanan sayıdır.",
      betsRules: "Fan kendi sayısında kazanır. Kwok bir köşedeki iki sayıda, Tek 1 ve 3'te, Çift 2 ve 4'te, Sheh Sam Hong üç sayıda kazanır. Nim ilk sayısında kazanır, ikinci sayısında geri döner; Nga Tan ilk iki sayısında kazanır, üçüncüsünde geri döner.",
      commissionRules: "Her kazanç, oranından %5 komisyon düşülerek ödenir. Tam dolarlar hemen ödenir, bozukluk kutuda bir sonraki kazancı bekler; böylece her bahis tam olarak oranının %5 eksiğini alır.",
      houseEdges: "Kasa avantajı: Fan %3,75; Nim, Kwok, Tek ve Çift %2,50; Nga Tan ve Sheh Sam Hong %1,25.",
      beadsHint: "Yığında 41 ile 104 arasında boncuk vardır ve cihazınızda çekilir: dört sayının her biri altmış dört yığının on altısında kalır.",

      sessionStats: "İstatistikler",
      statRounds: "Turlar",
      winningRounds: "Kazandıran turlar",
      statResults: "Sonuçlar 1 · 2 · 3 · 4",
      totalWagered: "Yatırılan",
      totalReturned: "Geri dönen",
      netResult: "Net sonuç",
      biggestWin: "En büyük kazanç",
      resetStats: "İstatistikleri sıfırla",
      statsHint: "Yalnızca eğlence için: her yığın yeniden çekilir, geçmiş sonuçlar bir sayıyı daha olası ya da daha az olası yapmaz.",

      disclaimerPlayMoney: "Table 4 yalnızca eğlence amaçlı bir Fan-Tan simülasyonudur. Jetonlar ve bakiye nakit değeri olmayan oyun parasıdır: satın alınamaz, satılamaz, paraya ya da ödüle çevrilemez. Gerçek parayla kumar sunulmaz.",
      disclaimerOdds: "Her boncuk yığını cihazınızda rastgele çekilir. Kumar sizin ya da bir yakınınız için sorun olmaya başladıysa lütfen yardım alın."
    }
  });
})((typeof window !== "undefined" ? window : globalThis).I18n);
