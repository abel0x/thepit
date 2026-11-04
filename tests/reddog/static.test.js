/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var loadI18n = require("../helpers/i18n.js").loadI18n;
var Engine = require("../../games/reddog/js/engine.js");

var root = path.resolve(__dirname, "../../games/reddog");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };
var html = read("index.html");
var game = read("js/game.js");
var DICT = loadI18n("games/reddog/js/strings.js").I18n._dict;

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
  var named = /: "((?:pay|first|second|third|ante|raise)\w*)"/g;
  while ((match = named.exec(game))) used.push(match[1]);
  for (var rank = 2; rank <= 14; rank++) used.push("rankName" + rank, "rankPlural" + rank);
  used.push("coachRaise", "coachCall", "winHand", "loseHand");
  assert.ok(used.length > 110, used.length + " words");
  used.forEach(function (key) {
    assert.ok(Object.prototype.hasOwnProperty.call(DICT.en, key), "missing word: " + key);
  });
});

test("the printed pays and odds are the engine's, in both languages", function () {
  var pays = { paySpreadOne: Engine.SPREAD_PAYS[1], paySpreadTwo: Engine.SPREAD_PAYS[2], paySpreadThree: Engine.SPREAD_PAYS[3],
    paySpreadWide: Engine.SPREAD_PAYS[4], payTrips: Engine.TRIPS_PAY };
  Object.keys(pays).forEach(function (key) {
    assert.equal(DICT.en[key], pays[key] + " TO 1", key);
    assert.equal(DICT.tr[key], "1'E " + pays[key], key + ": Turkish odds read the Turkish way round");
  });
  var best = (Engine.houseEdge() * 100).toFixed(2), never = (Engine.houseEdge(12) * 100).toFixed(2);
  assert.equal(DICT.en.houseEdge, "House edge with the best strategy: " + best + "% of the Ante. Calling every hand: " + never + "%.");
  assert.equal(DICT.tr.houseEdge, "En iyi stratejiyle kasa avantajı: Ante'nin %" + best.replace(".", ",") + "'i. Hiç artırmadan: %" + never.replace(".", ",") + ".");
  assert.match(DICT.en.spreadWideLabel, new RegExp("Spread 4 to " + Engine.MAX_SPREAD));
  assert.match(DICT.en.coachHint, new RegExp("spread of " + Engine.RAISE_FROM + " or more"));
  assert.match(DICT.tr.coachHint, new RegExp(Engine.RAISE_FROM + " ve üstü"));
  assert.match(DICT.en.rulesHint, /Eight decks, shuffled for every hand/);
  assert.equal(Engine.DECKS, 8);
});

test("the pays printed on the felt and in the settings are the same six lines", function () {
  var felt = html.slice(html.indexOf('<table class="paytable"'), html.indexOf("</table>"));
  var rows = Array.from(felt.matchAll(/<tr data-pay="(\w+)">/g), function (m) { return m[1]; });
  assert.deepEqual(rows, ["1", "2", "3", "wide", "consecutive", "trips"]);
  var labels = function (part) { return Array.from(part.matchAll(/data-i18n="(\w+)"/g), function (m) { return m[1]; }); };
  var settings = html.slice(html.indexOf('<details class="payout-table">'), html.indexOf("</details>"));
  var listed = settings.slice(settings.indexOf("<table>"), settings.indexOf("</table>"));
  assert.deepEqual(labels(listed), labels(felt).slice(1), "the felt adds only its caption");
});

test("the ladder shows the thirteen ranks, two to ace, with their values", function () {
  var cells = Array.from(html.matchAll(/<li data-value="(\d+)">([^<]+)<\/li>/g), function (m) { return [Number(m[1]), m[2]]; });
  assert.deepEqual(cells, Engine.RANKS.map(function (rank) { return [Engine.rankValue(rank), rank]; }));
});

test("a spot for the Ante and one for the Raise, each a real button", function () {
  var spots = Array.from(html.matchAll(/<button class="spot [^"]*" data-bet="(\w+)" type="button"/g), function (m) { return m[1]; });
  assert.deepEqual(spots, ["ante", "raise"]);
  assert.deepEqual(Engine.BETS, ["ante"], "the Raise is made after the deal, never before");
  assert.match(html, /data-bet="ante" type="button" aria-keyshortcuts="A"/);
  assert.match(html, /id="btnRaise"[^>]*aria-keyshortcuts="R"/);
  assert.match(html, /id="btnCall"[^>]*aria-keyshortcuts="C Space Enter"/);
  assert.match(html, /id="btnDeal"[^>]*aria-keyshortcuts="Space Enter"/);
});

test("the tray starts at the table minimum of $10", function () {
  var tray = Array.from(html.matchAll(/class="chip chip-\w+" data-value="(\d+)"/g), function (m) { return Number(m[1]); });
  assert.deepEqual(tray, [10, 25, 100, 500, 1000, 5000]);
  assert.match(html, /id="tableMin">\$10</);
  assert.match(html, /id="tableMax">\$2,500</);
  assert.equal(Engine.LIMITS.ante, 2500);
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
  assert.match(html, /<title>Table 13 · ThePit<\/title>/);
});

test("scripts and stylesheets load in dependency order", function () {
  var scripts = Array.from(html.matchAll(/<script\b[^>]*src="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(scripts, ["../../shared/js/pit.js", "../../shared/js/i18n.js", "js/strings.js", "../../shared/js/card-sound.js",
    "../../shared/js/cards.js", "../../shared/js/chips.js", "js/engine.js", "js/store.js", "js/game.js", "../../shared/js/pwa.js"]);
  var sheets = Array.from(html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(sheets, ["../../shared/css/pit.css", "../../shared/css/table.css", "../../shared/css/cards.css",
    "../../shared/css/chip-tables.css", "css/styles.css"]);
});

test("all three cards and the stake are saved before the first card is shown", function () {
  var dealing = game.slice(game.indexOf("  function deal()"), game.indexOf("  async function dealRound"));
  var draw = dealing.indexOf("Engine.deal(");
  var save = dealing.indexOf('account.write("round"');
  var debit = dealing.indexOf('account.write("bankroll", bankroll - stake)');
  var show = dealing.indexOf("return dealRound(round)");
  assert.ok(draw > 0 && save > draw && debit > 0 && show > save && show > debit);
  assert.match(dealing, /account\.roundsElsewhere\(\)/, "a round open at another table comes first");
});

test("the decision and the Raise are saved before the third card is turned", function () {
  var deciding = game.slice(game.indexOf("  function decide(decision)"), game.indexOf("  async function finishRound"));
  var save = deciding.indexOf('account.write("round", Store.roundSnapshot(saved))');
  var debit = deciding.indexOf('account.write("bankroll", bankroll - saved.bets.ante)');
  var show = deciding.indexOf("return finishRound(saved)");
  assert.ok(save > 0 && debit > 0 && show > save && show > debit);
  assert.match(deciding, /Store\.isDecided\(saved\)/, "a hand decided in another tab is not decided twice");
  assert.match(read("css/styles.css"), /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(game, /prefers-reduced-motion: reduce/);
});
