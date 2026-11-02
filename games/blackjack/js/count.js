/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 21 card counting trainer
   Pure and dependency-free. The Hi-Lo count: every two to six seen adds
   one, every ten-value card and ace takes one away, sevens to nines count
   nothing. A full deck counts to zero, so the running count of the cards
   seen is the opposite of the count of the cards not seen yet, which is
   how the table works it out: from the cards still in the shoe and those
   dealt face down. Covered by tests/blackjack/count.test.js.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CardCount = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MODES = ["off", "show", "check"];
  var DECK = 52;

  function hiLo(rank) {
    if (rank === "2" || rank === "3" || rank === "4" || rank === "5" || rank === "6") return 1;
    if (rank === "10" || rank === "J" || rank === "Q" || rank === "K" || rank === "A") return -1;
    return 0;
  }

  // The running count of every card seen since the shuffle, from the cards
  // not seen: those in the shoe and those face down or not yet turned.
  function runningCount(unseen) {
    var count = 0;
    for (var i = 0; i < unseen.length; i++) count -= hiLo(unseen[i].rank);
    return count;
  }

  // The running count divided by the decks not seen yet, to one decimal.
  function trueCount(running, unseenCards) {
    if (!(unseenCards > 0)) return 0;
    var value = Math.round(running / (unseenCards / DECK) * 10) / 10;
    return value === 0 ? 0 : value;
  }

  // An answer to "what is the running count?": a whole number, or null.
  function parseAnswer(text) {
    var match = /^\s*([+\-−]?)\s*(\d{1,4})\s*$/.exec(String(text == null ? "" : text));
    if (!match) return null;
    var value = Number(match[2]);
    return match[1] === "-" || match[1] === "−" ? -value : value;
  }

  // "+3", "0", "−2": a count as the table shows it.
  function signed(value, decimals) {
    var text = Math.abs(value).toFixed(decimals || 0);
    if (Number(text) === 0) return decimals ? (0).toFixed(decimals) : "0";
    return (value > 0 ? "+" : "−") + text;
  }

  return {
    MODES: MODES,
    hiLo: hiLo,
    runningCount: runningCount,
    trueCount: trueCount,
    parseAnswer: parseAnswer,
    signed: signed
  };
});
