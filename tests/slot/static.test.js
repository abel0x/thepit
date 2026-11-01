/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var loadI18n = require("../helpers/i18n.js").loadI18n;
var Engine = require("../../games/slot/js/engine.js");

var root = path.resolve(__dirname, "../../games/slot");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };
var html = read("index.html");
var game = read("js/game.js");
var DICT = loadI18n("games/slot/js/strings.js").I18n._dict;

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

test("every word the page and the machine ask for exists, and every symbol has a name", function () {
  var used = [];
  var match;
  var attribute = /data-i18n(?:-[a-z-]+)?="(\w+)"/g;
  while ((match = attribute.exec(html))) used.push(match[1]);
  var call = /\b(?:t|I18n\.t|I18n\.pick|setBanner)\("(\w+)"\s*[,)]/g;
  while ((match = call.exec(game))) used.push(match[1]);
  var keyed = /\bkey: "(\w+)"/g;
  while ((match = keyed.exec(game))) used.push(match[1]);
  Engine.SYMBOLS.forEach(function (symbol) {
    var word = "sym" + symbol.charAt(0).toUpperCase() + symbol.slice(1);
    assert.match(game, new RegExp(symbol + ': "' + word + '"'), symbol);
    used.push(word);
  });
  assert.ok(used.length > 70, used.length + " words");
  used.forEach(function (key) {
    assert.ok(Object.prototype.hasOwnProperty.call(DICT.en, key), "missing word: " + key);
  });
});

test("the printed return is the engine's, in both languages", function () {
  var total = (Engine.returnToPlayer().total * 100).toFixed(2);
  assert.equal(total, "95.82");
  assert.match(DICT.en.returnNote, new RegExp(total.replace(".", "\\.") + "%"));
  assert.match(DICT.tr.returnNote, new RegExp("%" + total.replace(".", ",")));
  assert.match(DICT.en.disclaimerOdds, /95\.82%/);
  assert.match(DICT.tr.disclaimerOdds, /%95,82/);
  assert.match(html, /id="tableRtp">95\.82%</);
});

test("every symbol is drawn once in the sprite and listed in the pays", function () {
  Engine.SYMBOLS.forEach(function (symbol) {
    assert.equal((html.match(new RegExp('<symbol id="sym-' + symbol + '"', "g")) || []).length, 1, symbol);
    assert.match(html, new RegExp('<tr data-symbol="' + symbol + '"'), symbol + " in the pays");
  });
});

test("the tray offers the machine's line bets as the pit's chips", function () {
  var tray = Array.from(html.matchAll(/class="chip chip-\w+" data-value="(\d+)"/g), function (m) { return Number(m[1]); });
  assert.deepEqual(tray, Engine.LINE_BETS);
  assert.match(html, /id="tableMin">\$20</);
  assert.match(html, /id="tableMax">\$2,000</);
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
  assert.equal((html.match(/class="reel" data-reel="\d"/g) || []).length, Engine.REELS);
  assert.match(html, /<title>Slot 5 · ThePit<\/title>/);
  assert.match(html, /id="btnSpin"[^>]*aria-keyshortcuts="Space Enter"/);
});

test("scripts and stylesheets load in dependency order", function () {
  var scripts = Array.from(html.matchAll(/<script\b[^>]*src="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(scripts, ["../../shared/js/pit.js", "../../shared/js/i18n.js", "js/strings.js", "../../shared/js/card-sound.js",
    "../../shared/js/chips.js", "js/engine.js", "js/store.js", "js/game.js", "../../shared/js/pwa.js"]);
  var sheets = Array.from(html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(sheets, ["../../shared/css/pit.css", "../../shared/css/table.css", "../../shared/css/chip-tables.css", "css/styles.css"]);
});

test("the spin, its free spins and its stake are saved before the reels turn", function () {
  var spinning = game.slice(game.indexOf("  function spin()"), game.indexOf("  async function playRound"));
  var save = spinning.indexOf('account.write("round", Store.roundSnapshot(round))');
  var debit = spinning.indexOf('account.write("bankroll", bankroll - cost)');
  var show = spinning.indexOf("return playRound(round)");
  assert.ok(save > 0 && debit > 0 && show > save && show > debit);
  assert.match(spinning, /spin: Engine\.play\(\)/, "the free spins are drawn with the paid spin");
  assert.match(spinning, /account\.roundsElsewhere\(\)/, "a round open at another table comes first");
  assert.match(read("css/styles.css"), /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(game, /prefers-reduced-motion: reduce/);
});
