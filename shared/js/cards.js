/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   ThePit — playing cards for every card table
   Each card is drawn with HTML and SVG only: value corners, the
   traditional pip layouts, mirrored court portraits and a back in
   the colours of the cloth (shared/css/cards.css). A card is
   { rank, suit, color } with rank A, 2-10, J, Q or K and a suit glyph.
   Exposed as window.PitCards.
   ========================================================= */
(function (global) {
  "use strict";

  function t(key, params) { return global.I18n.t(key, params); }

  // What a screen reader hears for a card: "Ace of spades", "Maça Ası".
  function label(card, faceDown) {
    if (faceDown) return t("faceDownCard");
    var rankKeys = {
      A: "rankAce", 2: "rankTwo", 3: "rankThree", 4: "rankFour", 5: "rankFive",
      6: "rankSix", 7: "rankSeven", 8: "rankEight", 9: "rankNine", 10: "rankTen",
      J: "rankJack", Q: "rankQueen", K: "rankKing"
    };
    var suitKeys = { "♠": "suitSpades", "♥": "suitHearts", "♦": "suitDiamonds", "♣": "suitClubs" };
    return t("cardLabel", {
      rank: rankKeys[card.rank] ? t(rankKeys[card.rank]) : card.rank,
      suit: t(suitKeys[card.suit])
    });
  }

  // Traditional casino-card pip positions on a three-column, five-row field.
  // Keeping these as DOM glyphs makes the deck sharp at every size and fully offline.
  var PIP_LAYOUTS = {
    A: [8],
    2: [2, 14],
    3: [2, 8, 14],
    4: [1, 3, 13, 15],
    5: [1, 3, 8, 13, 15],
    6: [1, 3, 7, 9, 13, 15],
    7: [1, 3, 5, 7, 9, 13, 15],
    8: [1, 3, 5, 7, 9, 11, 13, 15],
    9: [1, 3, 4, 6, 8, 10, 12, 13, 15],
    10: [1, 3, 4, 5, 6, 10, 11, 12, 13, 15]
  };

  function courtFigureMarkup(rank, suit) {
    var headwear;
    var accessory;
    if (rank === "J") {
      headwear = '<path class="court-headwear" d="M21 14 Q31 4 43 12 L40 17 Q32 12 23 18 Z"/>' +
        '<path class="court-feather" d="M39 11 Q49 4 47 18 Q44 12 39 15 Z"/>';
      accessory = '<path class="court-weapon" d="M14 43 L48 8"/><path class="court-guard" d="M39 13 L48 22"/>';
    } else if (rank === "Q") {
      headwear = '<path class="court-crown" d="M21 14 L23 5 L29 11 L32 3 L36 11 L42 5 L43 15 Z"/>';
      accessory = '<path class="court-weapon" d="M45 12 L43 43"/>' +
        '<circle class="court-jewel" cx="45" cy="11" r="3"/><path class="court-flower" d="M45 8 l-4-3 m4 3 4-3"/>';
    } else {
      headwear = '<path class="court-crown" d="M19 15 L21 4 L28 11 L32 2 L37 11 L44 4 L45 16 Z"/>' +
        '<circle class="court-jewel" cx="32" cy="8" r="1.5"/>';
      accessory = '<path class="court-weapon" d="M15 9 L47 43"/><path class="court-guard" d="M14 15 L21 8"/>';
    }

    return '<g class="court-person court-person-' + rank.toLowerCase() + '">' +
      '<path class="court-robe court-robe-back" d="M8 48 Q10 31 22 27 L42 27 Q54 31 56 48 Z"/>' +
      '<path class="court-robe court-robe-front" d="M20 48 L24 28 L40 28 L45 48 Z"/>' +
      '<path class="court-collar" d="M22 27 L32 36 L42 27 L38 24 L26 24 Z"/>' +
      '<ellipse class="court-face-shape" cx="32" cy="19" rx="8" ry="9"/>' +
      '<path class="court-hair" d="M24 20 Q23 9 32 9 Q42 9 40 22 L37 18 L35 25 L30 25 L27 18 Z"/>' +
      '<path class="court-feature" d="M28 19 h2 M34 19 h2 M30 23 q2 1 4 0"/>' +
      headwear + accessory +
      '<text class="court-suit-glyph" x="17" y="42">' + suit + '</text>' +
      '</g>';
  }

  // A card never lands perfectly square: a small turn and lift from its identity.
  function visualOffset(card) {
    var source = card.id || (card.rank + card.suit);
    var seed = 0;
    for (var i = 0; i < source.length; i++) seed = (seed * 31 + source.charCodeAt(i)) % 997;
    return {
      turn: (((seed % 9) - 4) * .24).toFixed(2) + "deg",
      lift: (((Math.floor(seed / 9) % 3) - 1) * .6).toFixed(1) + "px"
    };
  }

  // The card element: an outer box that moves, an inner body that flips, and
  // a front and a back face. animate === false lands it without the deal-in.
  function create(card, faceDown, animate) {
    // Outer card: handles dealing motion + landing shadow.
    var d = document.createElement("div");
    d.className = "card " + card.color;
    d.setAttribute("role", "img");
    d.setAttribute("aria-label", label(card, faceDown));
    // Only freshly-dealt cards play the deal-in animation; re-renders stay put.
    if (animate === false) d.classList.add("no-deal");
    else d.classList.add("deal-ready");
    var isFace = card.rank === "J" || card.rank === "Q" || card.rank === "K";
    if (isFace) d.classList.add("face");
    d.classList.add("rank-" + card.rank.toLowerCase());
    var offset = visualOffset(card);
    d.style.setProperty("--card-turn", offset.turn);
    d.style.setProperty("--card-lift", offset.lift);

    // Inner: flips between the two faces in 3D.
    var inner = document.createElement("div");
    inner.className = "card-inner" + (faceDown ? " facedown" : "");
    inner.setAttribute("aria-hidden", "true");

    // Front face (the real card — built even when face-down, simply rotated away).
    var front = document.createElement("div");
    front.className = "card-face front";
    var tl = document.createElement("div");
    tl.className = "corner tl";
    // Keep corner indices value-only. Suit glyphs belong to the main artwork,
    // so a six always reads as six pips instead of six plus two corner marks.
    tl.innerHTML = '<span class="r">' + card.rank + "</span>";
    var br = document.createElement("div");
    br.className = "corner br";
    br.innerHTML = '<span class="r">' + card.rank + "</span>";
    front.appendChild(tl);
    front.appendChild(br);
    if (isFace) {
      var court = document.createElement("div");
      court.className = "court court-" + card.rank.toLowerCase();
      var portrait = courtFigureMarkup(card.rank, card.suit);
      court.innerHTML = '<svg class="court-art" viewBox="0 0 64 96" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
        '<rect class="court-paper" x="1" y="1" width="62" height="94" rx="2"/>' +
        '<path class="court-diagonal court-diagonal-a" d="M2 66 L42 2 H62 V28 L22 94 H2 Z"/>' +
        '<path class="court-diagonal court-diagonal-b" d="M2 78 L50 2 H61 L13 94 H2 Z"/>' +
        portrait + '<g transform="rotate(180 32 48)">' + portrait + '</g>' +
        '<rect class="court-center-band" x="1" y="43" width="62" height="10"/>' +
        '<text class="court-center-rank" x="32" y="50.5">' + card.rank + '</text>' +
        '<rect class="court-frame" x="1" y="1" width="62" height="94" rx="2"/>' +
        '</svg>';
      front.appendChild(court);
    } else {
      var field = document.createElement("div");
      field.className = "pip-layout";
      (PIP_LAYOUTS[card.rank] || [8]).forEach(function (position) {
        var pip = document.createElement("span");
        pip.className = "pip-mark p" + position + (position >= 10 ? " inverted" : "");
        pip.textContent = card.suit;
        field.appendChild(pip);
      });
      front.appendChild(field);
    }

    // Back face (patterned).
    var back = document.createElement("div");
    back.className = "card-face back";

    inner.appendChild(front);
    inner.appendChild(back);
    d.appendChild(inner);
    return d;
  }

  global.PitCards = {
    PIP_LAYOUTS: PIP_LAYOUTS,
    courtFigureMarkup: courtFigureMarkup,
    label: label,
    create: create
  };
})(typeof window !== "undefined" ? window : globalThis);
