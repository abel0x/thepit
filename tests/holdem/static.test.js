/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var loadI18n = require("../helpers/i18n.js").loadI18n;
var Engine = require("../../games/holdem/js/engine.js");

var root = path.resolve(__dirname, "../../games/holdem");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };
var html = read("index.html");
var game = read("js/game.js");
var DICT = loadI18n("games/holdem/js/strings.js").I18n._dict;

function placeholders(text) {
  return [].concat(text).join(" ").match(/\{\w+\}/g) || [];
}

test("English and Turkish define the same words with the same placeholders", function () {
  assert.deepEqual(Object.keys(DICT.tr).sort(), Object.keys(DICT.en).sort());
  Object.keys(DICT.en).forEach(function (key) {
    assert.equal(Array.isArray(DICT.en[key]), Array.isArray(DICT.tr[key]), key);
    assert.deepEqual(placeholders(DICT.tr[key]).sort(), placeholders(DICT.en[key]).sort(), key);
    assert.doesNotMatch(JSON.stringify(DICT.en[key]) + JSON.stringify(DICT.tr[key]), /—|–/, "natural punctuation: " + key);
  });
});

test("every word the page and the table ask for exists", function () {
  var used = [];
  var match;
  var attribute = /data-i18n(?:-[a-z-]+)?="(\w+)"/g;
  while ((match = attribute.exec(html))) used.push(match[1]);
  // Whole keys only; a key built from a prefix ("rankName" + rank) is listed below.
  var call = /\b(?:t|I18n\.t|I18n\.pick|setBanner)\("(\w+)"\s*[,)]/g;
  while ((match = call.exec(game))) used.push(match[1]);
  var keyed = /\{ key: "(\w+)"/g;
  while ((match = keyed.exec(game))) used.push(match[1]);
  // Words the table builds from a hand or a side.
  Engine.CATEGORIES.forEach(function (category) { used.push("hand" + category.charAt(0).toUpperCase() + category.slice(1)); });
  for (var rank = 2; rank <= 14; rank++) used.push("rankName" + rank, "rankPlural" + rank);
  used.push("dealerName", "playerName");
  assert.ok(used.length > 120, used.length + " words");
  used.forEach(function (key) {
    assert.ok(Object.prototype.hasOwnProperty.call(DICT.en, key), "missing word: " + key);
  });
});

test("the printed pays are the engine's", function () {
  var ante = Array.from(html.matchAll(/<tr><th scope="row" data-i18n="(print\w+)">[^<]*<\/th><td>(\d+) : 1<\/td><\/tr>/g));
  var names = { printRoyalFlush: "royalFlush", printStraightFlush: "straightFlush", printQuads: "quads", printFullHouse: "fullHouse",
    printFlush: "flush", printStraight: "straight", printTrips: "trips", printTwoPair: "twoPair", printAces: "pair", printStraightOrLess: null };
  assert.ok(ante.length >= 30, ante.length + " printed pays");
  ante.forEach(function (m) {
    var category = names[m[1]];
    var pay = Number(m[2]);
    if (category === null) assert.equal(pay, 1);
    else assert.ok(pay === Engine.ANTE_PAYS[category] || pay === Engine.AA_PAYS[category], m[1] + " " + pay);
  });
  assert.match(DICT.en.aaRules, /6\.26%/);
  assert.match(DICT.tr.aaRules, /%6,26/);
});

test("a spot for every bet, each a real button, and the Call spot beside them", function () {
  var spots = Array.from(html.matchAll(/<button class="spot [^"]*" data-bet="(\w+)" type="button"/g), function (m) { return m[1]; });
  assert.deepEqual(spots, Engine.BETS.concat(["call"]));
  ["A", "B", "F"].forEach(function (key) { assert.match(html, new RegExp('aria-keyshortcuts="' + key + '"')); });
  assert.match(html, /id="btnCall"[^>]*aria-keyshortcuts="L Space Enter"/);
});

test("the tray starts at the table minimum of $5", function () {
  var tray = Array.from(html.matchAll(/class="chip chip-\w+" data-value="(\d+)"/g), function (m) { return Number(m[1]); });
  assert.deepEqual(tray, [5, 25, 100, 500, 1000, 5000]);
  assert.match(html, /id="tableMin">\$5</);
});

test("the page is well formed: unique ids, typed buttons, labelled controls, every id the table asks for", function () {
  var ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), function (m) { return m[1]; });
  assert.equal(new Set(ids).size, ids.length, "duplicate ids");
  (html.match(/<button\b[^>]*>/g) || []).forEach(function (button) { assert.match(button, /\btype="button"/, button); });
  Array.from(html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g), function (m) { return m[1]; }).forEach(function (target) {
    assert.ok(ids.indexOf(target) !== -1, "missing label target: " + target);
  });
  Array.from(game.matchAll(/\$\("(\w+)"\)/g), function (m) { return m[1]; }).forEach(function (id) {
    assert.ok(ids.indexOf(id) !== -1, "game.js asks for a missing #" + id);
  });
  assert.match(html, /class="modal-card" role="dialog" aria-modal="true" aria-labelledby="settingsTitle"/);
  assert.match(html, /<title>Table 2 · ThePit<\/title>/);
});

test("scripts and stylesheets load in dependency order", function () {
  var scripts = Array.from(html.matchAll(/<script\b[^>]*src="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(scripts, ["../../shared/js/pit.js", "../../shared/js/i18n.js", "js/strings.js", "../../shared/js/card-sound.js",
    "../../shared/js/cards.js", "../../shared/js/chips.js", "js/engine.js", "js/store.js", "js/game.js", "../../shared/js/pwa.js"]);
  var sheets = Array.from(html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(sheets, ["../../shared/css/pit.css", "../../shared/css/table.css", "../../shared/css/cards.css",
    "../../shared/css/chip-tables.css", "css/styles.css"]);
});

test("the hand and its stake are saved before the first card is shown", function () {
  var dealing = game.slice(game.indexOf("  function deal()"), game.indexOf("  async function dealRound"));
  var save = dealing.indexOf('account.write("round"');
  var debit = dealing.indexOf('account.write("bankroll", bankroll - stake)');
  var show = dealing.indexOf("return dealRound(round)");
  assert.ok(save > 0 && debit > 0 && show > save && show > debit);
  assert.match(dealing, /account\.roundsElsewhere\(\)/, "a round open at another table comes first");
  assert.match(dealing, /stake \+ callOf\(bets\) > bankroll/, "the balance must hold the Call too");
});

test("the decision and the Call are saved before the rest of the cards are turned", function () {
  var deciding = game.slice(game.indexOf("  function decide(decision)"), game.indexOf("  async function finishRound"));
  var save = deciding.indexOf('account.write("round", Store.roundSnapshot(saved))');
  var debit = deciding.indexOf('account.write("bankroll", bankroll - callOf(saved.bets))');
  var show = deciding.indexOf("return finishRound(saved)");
  assert.ok(save > 0 && debit > 0 && show > save && show > debit);
  assert.match(read("css/styles.css"), /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(game, /prefers-reduced-motion: reduce/);
});
