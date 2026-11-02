/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var loadI18n = require("../helpers/i18n.js").loadI18n;
var Engine = require("../../games/threecard/js/engine.js");

var root = path.resolve(__dirname, "../../games/threecard");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };
var html = read("index.html");
var game = read("js/game.js");
var DICT = loadI18n("games/threecard/js/strings.js").I18n._dict;

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
  used.push("dealerName", "playerName", "coachPlay", "coachFold");
  assert.ok(used.length > 120, used.length + " words");
  used.forEach(function (key) {
    assert.ok(Object.prototype.hasOwnProperty.call(DICT.en, key), "missing word: " + key);
  });
});

test("the printed odds are the engine's, in both languages", function () {
  assert.match(DICT.en.houseEdges, /3\.37% of the Ante on Ante and Play, 2\.32% on Pair Plus/);
  assert.match(DICT.tr.houseEdges, /Ante'nin %3,37'si, Pair Plus'ta %2,32/);
  assert.match(DICT.en.houseEdgesLowFlush, /3\.37% of the Ante on Ante and Play, 7\.28% on Pair Plus/);
  assert.match(DICT.tr.houseEdgesLowFlush, /Ante'nin %3,37'si, Pair Plus'ta %7,28/);
  assert.equal(DICT.en.profileStandardSummary, "Flush pays " + Engine.PAIR_PLUS.standard.flush + " to 1 · House edge 2.32% on Pair Plus");
  assert.equal(DICT.en.profileLowFlushSummary, "Flush pays " + Engine.PAIR_PLUS.lowFlush.flush + " to 1 · House edge 7.28% on Pair Plus");
  assert.equal(DICT.tr.profileStandardSummary, "Renk 1'e " + Engine.PAIR_PLUS.standard.flush + " öder · Pair Plus'ta kasa avantajı %2,32");
  assert.equal(DICT.tr.profileLowFlushSummary, "Renk 1'e " + Engine.PAIR_PLUS.lowFlush.flush + " öder · Pair Plus'ta kasa avantajı %7,28");
  var standard = Engine.PAIR_PLUS.standard;
  var pays = { payStraightFlush: standard.straightFlush, payTrips: standard.trips, payStraight: standard.straight,
    payFlush: standard.flush, payFlushLow: Engine.PAIR_PLUS.lowFlush.flush, payPair: standard.pair, bonusStraightFlush: Engine.ANTE_BONUS.straightFlush,
    bonusTrips: Engine.ANTE_BONUS.trips, bonusStraight: Engine.ANTE_BONUS.straight };
  Object.keys(pays).forEach(function (key) {
    assert.equal(DICT.en[key], pays[key] + " TO 1", key);
    assert.equal(DICT.tr[key], "1'E " + pays[key], key + ": Turkish odds read the Turkish way round");
  });
});

test("a choice of the two Pair Plus pay tables, one radio button each", function () {
  var profiles = Array.from(html.matchAll(/<button class="rule-profile" data-profile="(\w+)" type="button" role="radio"/g), function (m) { return m[1]; });
  assert.deepEqual(profiles, Engine.PAY_TABLES);
  assert.equal((html.match(/data-pay-flush/g) || []).length, 2, "the felt and the payout list both show the flush pay");
  assert.match(game, /Engine\.settle\(round\.bets, round\.player, round\.dealer, round\.decision, round\.payTable\)/);
  assert.doesNotMatch(game, /Engine\.settle\([^)]*round\.decision\)/, "every settlement names its pay table");
});

test("a spot for every bet, each a real button, and the Play spot beside them", function () {
  var spots = Array.from(html.matchAll(/<button class="spot [^"]*" data-bet="(\w+)" type="button"/g), function (m) { return m[1]; });
  assert.deepEqual(spots, ["pairPlus", "ante", "play", "sixCard"]);
  assert.deepEqual(spots.filter(function (key) { return key !== "play"; }), Engine.BETS);
  ["A", "S", "F", "B"].forEach(function (key) { assert.match(html, new RegExp('aria-keyshortcuts="' + key + '"')); });
  assert.match(html, /id="btnPlay"[^>]*aria-keyshortcuts="P Space Enter"/);
});

test("the tray starts at the table minimum of $10", function () {
  var tray = Array.from(html.matchAll(/class="chip chip-\w+" data-value="(\d+)"/g), function (m) { return Number(m[1]); });
  assert.deepEqual(tray, [10, 25, 100, 500, 1000, 5000]);
  assert.match(html, /id="tableMin">\$10</);
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
  assert.match(html, /<title>Table 3 · ThePit<\/title>/);
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
  assert.match(dealing, /stake \+ bets\.ante > bankroll/, "the balance must hold the Play bet too");
});

test("the decision and the Play bet are saved before the dealer's cards are turned", function () {
  var deciding = game.slice(game.indexOf("  function decide(decision)"), game.indexOf("  async function finishRound"));
  var save = deciding.indexOf('account.write("round", Store.roundSnapshot(saved))');
  var debit = deciding.indexOf('account.write("bankroll", bankroll - saved.bets.ante)');
  var show = deciding.indexOf("return finishRound(saved)");
  assert.ok(save > 0 && debit > 0 && show > save && show > debit);
  assert.match(read("css/styles.css"), /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(game, /prefers-reduced-motion: reduce/);
});
