/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var loadI18n = require("../helpers/i18n.js").loadI18n;
var Engine = require("../../games/videopoker/js/engine.js");

var root = path.resolve(__dirname, "../../games/videopoker");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };
var html = read("index.html");
var game = read("js/game.js");
var DICT = loadI18n("games/videopoker/js/strings.js").I18n._dict;

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

test("every word the page and the machine ask for exists", function () {
  var used = [];
  var match;
  var attribute = /data-i18n(?:-[a-z-]+)?="(\w+)"/g;
  while ((match = attribute.exec(html))) used.push(match[1]);
  var call = /\b(?:t|I18n\.t|I18n\.pick|setBanner)\("(\w+)"\s*[,)]/g;
  while ((match = call.exec(game))) used.push(match[1]);
  var keyed = /\{ key: "(\w+)"/g;
  while ((match = keyed.exec(game))) used.push(match[1]);
  // Words the machine builds from a hand, a game and a pay table.
  Engine.CATEGORIES.slice(1).forEach(function (name) { used.push("cat" + name.charAt(0).toUpperCase() + name.slice(1)); });
  for (var rank = 11; rank <= 14; rank++) used.push("rankPlural" + rank);
  used.push("coachHold", "coachDrawAll", "coachStand", "held", "draw");
  Array.from(game.matchAll(/: "((?:cat|subtitle|profile)\w+)"/g), function (m) { used.push(m[1]); });
  assert.ok(used.length > 80, used.length + " words");
  used.forEach(function (key) {
    assert.ok(Object.prototype.hasOwnProperty.call(DICT.en, key), "missing word: " + key);
  });
});

test("the printed returns are the engine's, in both languages", function () {
  assert.deepEqual(Engine.RETURN_PERCENT, { nineSix: 99.54, eightFive: 97.30, doubleBonus: 99.11, deucesWild: 99.73 });
  assert.match(DICT.en.profileDoubleBonusSummary, /Returns 99\.11% /);
  assert.match(DICT.en.profileDeucesWildSummary, /Returns 99\.73% /);
  assert.match(DICT.tr.profileDoubleBonusSummary, /%99,11$/);
  assert.match(DICT.tr.profileDeucesWildSummary, /%99,73$/);
  assert.match(DICT.en.returnNote, /Double Bonus 99\.11% and Deuces Wild 99\.73%/);
  assert.match(DICT.tr.returnNote, /Double Bonus %99,11, Deuces Wild %99,73/);
  assert.match(DICT.en.profileNineSixSummary, /^Full house pays 9, flush 6 · Returns 99\.54% /);
  assert.match(DICT.en.profileEightFiveSummary, /^Full house pays 8, flush 5 · Returns 97\.30% /);
  assert.match(DICT.tr.profileNineSixSummary, /^Ful 9, renk 6 öder · .*%99,54$/);
  assert.match(DICT.tr.profileEightFiveSummary, /^Ful 8, renk 5 öder · .*%97,30$/);
  assert.match(DICT.en.returnNote, /returns 99\.54% at 9\/6 and 97\.30% at 8\/5/);
  assert.match(DICT.tr.returnNote, /9\/6'da %99,54, 8\/5'te %97,30/);
  assert.match(DICT.en.royalNote, new RegExp(Engine.PAYS.nineSix.royalFlush + " a coin, and " + Engine.ROYAL_MAX_COINS + " a coin"));
  assert.match(DICT.tr.royalNote, new RegExp("jeton başına " + Engine.PAYS.nineSix.royalFlush + ".*jeton başına " + Engine.ROYAL_MAX_COINS));
});

test("the pay table has a column for every coin, its rows laid by the machine for each game", function () {
  var head = html.match(/<thead>([\s\S]*?)<\/thead>/)[1];
  assert.deepEqual(Array.from(head.matchAll(/data-coins="(\d)"/g), function (m) { return Number(m[1]); }), [1, 2, 3, 4, 5]);
  assert.match(html, /<tbody id="payRows"><\/tbody>/);
  assert.match(game, /Engine\.PAY_ROWS\[payTable\]\.forEach/);
  var profiles = Array.from(html.matchAll(/<button class="rule-profile" data-profile="(\w+)" type="button" role="radio"/g), function (m) { return m[1]; });
  assert.deepEqual(profiles, Engine.PAY_TABLES);
});

test("five cards with a hold button each, and the keys that play them", function () {
  var holds = Array.from(html.matchAll(/<button class="hold-btn" data-hold="(\d)" type="button" aria-pressed="false" aria-keyshortcuts="(\d)">/g),
    function (m) { return [Number(m[1]), Number(m[2])]; });
  assert.deepEqual(holds, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]);
  assert.match(html, /id="btnDeal"[^>]*aria-keyshortcuts="Space Enter"/);
  assert.match(html, /id="btnBetOne"[^>]*aria-keyshortcuts="B"/);
  assert.match(html, /id="btnBetMax"[^>]*aria-keyshortcuts="X"/);
});

test("the tray is the engine's coin values, from the $1 minimum", function () {
  var tray = Array.from(html.matchAll(/class="chip chip-\w+" data-value="(\d+)"/g), function (m) { return Number(m[1]); });
  assert.deepEqual(tray, Engine.DENOMINATIONS);
  assert.match(html, /id="tableMin">\$1</);
  assert.match(html, /id="tableMax">\$2,500</);
});

test("the page is well formed: unique ids, typed buttons, labelled controls, every id the machine asks for", function () {
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
  assert.match(html, /<title>Poker 11 · ThePit<\/title>/);
});

test("scripts and stylesheets load in dependency order", function () {
  var scripts = Array.from(html.matchAll(/<script\b[^>]*src="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(scripts, ["../../shared/js/pit.js", "../../shared/js/i18n.js", "js/strings.js", "../../shared/js/card-sound.js",
    "../../shared/js/cards.js", "../../shared/js/chips.js", "js/engine.js", "js/store.js", "js/game.js", "../../shared/js/pwa.js"]);
  var sheets = Array.from(html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(sheets, ["../../shared/css/pit.css", "../../shared/css/table.css", "../../shared/css/cards.css",
    "../../shared/css/chip-tables.css", "css/styles.css"]);
});

test("the hand, its draw and its stake are saved before the first card is shown", function () {
  var dealing = game.slice(game.indexOf("  function deal()"), game.indexOf("  async function dealRound"));
  var save = dealing.indexOf('account.write("round", Store.roundSnapshot(round))');
  var debit = dealing.indexOf('account.write("bankroll", bankroll - stake)');
  var show = dealing.indexOf("return dealRound(round)");
  assert.ok(save > 0 && debit > 0 && show > save && show > debit);
  assert.match(dealing, /account\.roundsElsewhere\(\)/, "a round open at another table comes first");
});

test("the hold is saved before the new cards are turned", function () {
  var drawing = game.slice(game.indexOf("  function drawCards()"), game.indexOf("  async function finishRound"));
  var save = drawing.indexOf('account.write("round", Store.roundSnapshot(saved))');
  var show = drawing.indexOf("return finishRound(saved, judged)");
  assert.ok(save > 0 && show > save);
  assert.match(read("css/styles.css"), /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(game, /prefers-reduced-motion: reduce/);
});
