/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var loadI18n = require("../helpers/i18n.js").loadI18n;
var Engine = require("../../games/keno/js/engine.js");

var root = path.resolve(__dirname, "../../games/keno");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };
var html = read("index.html");
var game = read("js/game.js");
var DICT = loadI18n("games/keno/js/strings.js").I18n._dict;

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
  var keyed = /\bkey: "(\w+)"/g;
  while ((match = keyed.exec(game))) used.push(match[1]);
  ["numberLabel", "numberMarked", "numberDrawn", "numberCaught", "readyLine", "readyLineOne"].forEach(function (key) { used.push(key); });
  assert.ok(used.length > 60, used.length + " words");
  used.forEach(function (key) {
    assert.ok(Object.prototype.hasOwnProperty.call(DICT.en, key), "missing word: " + key);
  });
  assert.equal(DICT.en.payFor.replace("{n}", 15), "15 for 1");
  assert.equal(DICT.tr.payFor.replace("{n}", 15), "1'e 15");
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
  assert.match(html, /<title>Keno 80 · ThePit<\/title>/);
  assert.doesNotMatch(html, /sic ?bo|Table 18|dice/i);
  var tray = Array.from(html.matchAll(/class="chip chip-\w+" data-value="(\d+)"/g), function (m) { return Number(m[1]); });
  assert.deepEqual(tray, Engine.BETS, "the tray offers exactly the bets the machine takes");
});

test("scripts and stylesheets load in dependency order", function () {
  var scripts = Array.from(html.matchAll(/<script\b[^>]*src="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(scripts, ["../../shared/js/pit.js", "../../shared/js/i18n.js", "js/strings.js", "../../shared/js/card-sound.js",
    "../../shared/js/chips.js", "js/engine.js", "js/store.js", "js/game.js", "../../shared/js/pwa.js"]);
  var sheets = Array.from(html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(sheets, ["../../shared/css/pit.css", "../../shared/css/table.css", "../../shared/css/chip-tables.css", "css/styles.css"]);
});

test("the ticket, the bet and all twenty balls are saved before the first ball is shown", function () {
  var playing = game.slice(game.indexOf("  function play()"), game.indexOf("  // The twenty balls come out"));
  var save = playing.indexOf('account.write("round", Store.roundSnapshot(round))');
  var debit = playing.indexOf('account.write("bankroll", bankroll - stake)');
  var show = playing.indexOf("return playGame(round)");
  assert.ok(save > 0 && debit > 0 && show > save && show > debit);
  assert.match(playing, /balls: Engine\.draw\(\)/);
  assert.match(playing, /account\.roundsElsewhere\(\)/, "a round open at another table comes first");
  assert.match(read("css/styles.css"), /@media \(prefers-reduced-motion: reduce\)/);
});
