/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");
var i18nSource = require("../helpers/i18n.js").i18nSource;

var root = path.resolve(__dirname, "../..");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };
var Pit = require("../../shared/js/pit.js");

// Just enough of a DOM for the card maker: elements with classes, attributes,
// children, inline custom properties and inner HTML.
function element(tag) {
  var node = {
    tagName: tag.toUpperCase(),
    className: "",
    attributes: {},
    children: [],
    style: { props: {}, setProperty: function (name, value) { this.props[name] = value; } },
    innerHTML: "",
    textContent: "",
    setAttribute: function (name, value) { this.attributes[name] = String(value); },
    appendChild: function (child) { this.children.push(child); return child; }
  };
  node.classList = { add: function () { node.className += " " + [].join.call(arguments, " "); } };
  return node;
}

function loadCards(lang) {
  var sandbox = {
    localStorage: { getItem: function () { return lang || null; }, setItem: function () {} },
    document: { createElement: element, querySelectorAll: function () { return []; }, documentElement: { setAttribute: function () {} } }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(i18nSource("games/blackjack/js/strings.js") + "\n" + read("shared/js/cards.js"), sandbox);
  return sandbox.PitCards;
}

function find(node, test) {
  if (test(node)) return node;
  for (var i = 0; i < node.children.length; i++) {
    var found = find(node.children[i], test);
    if (found) return found;
  }
  return null;
}
function classes(node) { return node.className.trim().split(/\s+/); }

var Cards = loadCards();

test("number cards show exactly their value in the central pip field", function () {
  for (var value = 2; value <= 10; value++) {
    assert.equal(Cards.PIP_LAYOUTS[value].length, value, value + " pips");
    var card = Cards.create({ rank: String(value), suit: "♣", color: "black" }, false);
    var field = find(card, function (node) { return classes(node).indexOf("pip-layout") !== -1; });
    assert.equal(field.children.length, value, value + " pips on the card");
    field.children.forEach(function (pip) { assert.equal(pip.textContent, "♣"); });
  }
  assert.deepEqual(Array.from(Cards.PIP_LAYOUTS.A), [8], "the Ace has one central pip");
});

test("corner indices show the value only, never an extra suit", function () {
  ["A", "6", "10", "K"].forEach(function (rank) {
    var card = Cards.create({ rank: rank, suit: "♥", color: "red" }, false);
    ["tl", "br"].forEach(function (corner) {
      var node = find(card, function (n) { return classes(n).indexOf(corner) !== -1; });
      assert.equal(node.innerHTML, '<span class="r">' + rank + "</span>", rank + " " + corner);
    });
  });
});

test("a card is an image with its name, built to flip between two faces", function () {
  var card = Cards.create({ rank: "Q", suit: "♦", color: "red" }, false);
  assert.equal(card.attributes.role, "img");
  assert.equal(card.attributes["aria-label"], "Queen of diamonds");
  assert.deepEqual(classes(card).slice(0, 2), ["card", "red"]);
  assert.ok(classes(card).indexOf("face") !== -1 && classes(card).indexOf("rank-q") !== -1);
  var inner = card.children[0];
  assert.equal(inner.className, "card-inner");
  assert.deepEqual(inner.children.map(function (face) { return face.className; }), ["card-face front", "card-face back"]);
  assert.match(card.style.props["--card-turn"], /^-?\d+(\.\d+)?deg$/);

  var hole = Cards.create({ rank: "7", suit: "♠", color: "black" }, true, false);
  assert.equal(hole.attributes["aria-label"], "Face-down card");
  assert.equal(hole.children[0].className, "card-inner facedown");
  assert.ok(classes(hole).indexOf("no-deal") !== -1, "laid without the deal-in when asked");
});

test("every card is named in both languages", function () {
  var english = loadCards("en"), turkish = loadCards("tr");
  assert.equal(english.label({ rank: "A", suit: "♠" }), "Ace of spades");
  assert.equal(turkish.label({ rank: "A", suit: "♠" }), "Maça Ası");
  assert.equal(turkish.label({ rank: "10", suit: "♥" }), "Kupa Onlusu");
  assert.equal(turkish.label({ rank: "K", suit: "♣" }, true), "Kapalı kart");
  ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].forEach(function (rank) {
    ["♠", "♥", "♦", "♣"].forEach(function (suit) {
      [english, turkish].forEach(function (cards) {
        assert.doesNotMatch(cards.label({ rank: rank, suit: suit }), /\{|rank[A-Z]|suit[A-Z]|undefined/, rank + suit);
      });
    });
  });
});

test("court cards wear their own local vector portraits", function () {
  var jack = Cards.courtFigureMarkup("J", "♠");
  var queen = Cards.courtFigureMarkup("Q", "♥");
  var king = Cards.courtFigureMarkup("K", "♦");
  assert.match(jack, /court-feather/);
  assert.match(queen, /court-flower/);
  assert.match(king, /court-jewel/);
  assert.notEqual(jack.replace("♠", ""), king.replace("♦", ""));
  var card = Cards.create({ rank: "J", suit: "♠", color: "black" }, false);
  var court = find(card, function (node) { return classes(node).indexOf("court") !== -1; });
  assert.match(court.innerHTML, /class="court-art"/);
  assert.equal((court.innerHTML.match(/court-person-j/g) || []).length, 2, "mirrored top and bottom");
  var css = read("shared/css/cards.css");
  assert.match(css, /\.court-person-j/);
  assert.match(css, /\.court-center-rank/);
});

test("every cloth has its own card back", function () {
  var css = read("shared/css/cards.css");
  var tokens = ["--card-back-top", "--card-back-mid", "--card-back-bottom", "--card-medallion-top", "--card-medallion-bottom"];
  var rootBlock = css.match(/:root \{([^}]*)\}/)[1];
  tokens.forEach(function (token) { assert.ok(rootBlock.indexOf(token + ":") !== -1, "emerald " + token); });
  Pit.THEMES.filter(function (theme) { return theme !== Pit.DEFAULT_THEME; }).forEach(function (theme) {
    var block = css.match(new RegExp('body\\[data-theme="' + theme + '"\\]\\s*\\{([^}]*)\\}'));
    assert.ok(block, theme);
    tokens.forEach(function (token) { assert.ok(block[1].indexOf(token + ":") !== -1, theme + " " + token); });
  });
  assert.match(css, /\.card-face\.back \{[^}]*var\(--card-back-top\)/);
  // A table sizes its cards; the shared look never fixes the width.
  assert.doesNotMatch(css, /--w:/);
});
