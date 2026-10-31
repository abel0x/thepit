/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var loadI18n = require("../helpers/i18n.js").loadI18n;
var Engine = require("../../games/craps/js/engine.js");

var root = path.resolve(__dirname, "../../games/craps");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };
var html = read("index.html");
var game = read("js/game.js");
var DICT = loadI18n("games/craps/js/strings.js").I18n._dict;

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

test("every word the page and the table ask for exists, and every bet has a name", function () {
  var used = [];
  var match;
  var attribute = /data-(?:i18n(?:-[a-z-]+)?|name)="(\w+)"/g;
  while ((match = attribute.exec(html))) if (!/^\d+$/.test(match[1])) used.push(match[1]);
  var call = /\b(?:t|I18n\.t|I18n\.pick|setBanner)\("(\w+)"\s*[,)]/g;
  while ((match = call.exec(game))) used.push(match[1]);
  var keyed = /\bkey: "(\w+)"/g;
  while ((match = keyed.exec(game))) used.push(match[1]);
  ["pass", "dontPass", "passOdds", "dontOdds", "come", "dontCome", "field", "any7", "anyCraps", "two", "three", "eleven", "twelve"]
    .forEach(function (key) { used.push(key + "Name"); });
  ["comeOutOnly", "pointOnly", "oddsNeedBet", "travels"].forEach(function (key) { used.push(key); });
  assert.ok(used.length > 90, used.length + " words");
  used.forEach(function (key) {
    assert.ok(Object.prototype.hasOwnProperty.call(DICT.en, key), "missing word: " + key);
  });
});

test("every bet the engine knows has its place on the layout", function () {
  Engine.BETS.forEach(function (key) {
    assert.match(html, new RegExp('data-stack="' + key + '"'), key + " has a stack");
    if (Engine.kindOf(key) !== "comePoint") assert.match(html, new RegExp('data-bet="' + key + '"'), key + " can be bet");
  });
  assert.equal((html.match(/class="number-box" data-number=/g) || []).length, 6);
});

test("the printed odds and house edges are the engine's", function () {
  assert.equal(DICT.en.payPlace6, Engine.PLACE_PAYS[6][0] + " TO " + Engine.PLACE_PAYS[6][1]);
  assert.equal(DICT.en.payPlace5, "7 TO 5");
  assert.equal(DICT.en.payPlace4, "9 TO 5");
  assert.equal(DICT.en.payHard6, "9 TO 1");
  assert.equal(DICT.en.payAny7, "4 TO 1");
  assert.equal(DICT.tr.payPlace6, "6'YA 7", "Turkish odds read the Turkish way round");
  assert.match(DICT.en.edgeLine, /Pass and Come 1\.41% · Don't pass and Don't come 1\.36%/);
  assert.match(DICT.tr.edgeLine, /Pass ve Come %1,41 · Don't pass ve Don't come %1,36/);
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
  assert.match(html, /<title>Table 7 · ThePit<\/title>/);
  var tray = Array.from(html.matchAll(/class="chip chip-\w+" data-value="(\d+)"/g), function (m) { return Number(m[1]); });
  assert.deepEqual(tray, [5, 25, 100, 500, 1000, 5000]);
});

test("scripts and stylesheets load in dependency order", function () {
  var scripts = Array.from(html.matchAll(/<script\b[^>]*src="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(scripts, ["../../shared/js/pit.js", "../../shared/js/i18n.js", "js/strings.js", "../../shared/js/card-sound.js",
    "../../shared/js/chips.js", "js/engine.js", "js/store.js", "js/game.js", "../../shared/js/pwa.js"]);
  var sheets = Array.from(html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(sheets, ["../../shared/css/pit.css", "../../shared/css/table.css", "../../shared/css/chip-tables.css", "css/styles.css"]);
});

test("the bets, the new money and the dice are saved before the dice are shown", function () {
  var rolling = game.slice(game.indexOf("  function roll()"), game.indexOf("  // The dice tumble"));
  var save = rolling.indexOf('account.write("round", Store.roundSnapshot(round))');
  var debit = rolling.indexOf('account.write("bankroll", bankroll - wager)');
  var show = rolling.indexOf("return playRoll(round)");
  assert.ok(save > 0 && debit > 0 && show > save && show > debit);
  assert.match(rolling, /roll: \{ dice: Engine\.rollDice\(\) \}/);
  assert.match(rolling, /account\.roundsElsewhere\(\)/, "a round open at another table comes first");
  assert.match(read("css/styles.css"), /@media \(prefers-reduced-motion: reduce\)/);
});
