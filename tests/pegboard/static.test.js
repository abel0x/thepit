/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var loadI18n = require("../helpers/i18n.js").loadI18n;
var Engine = require("../../games/pegboard/js/engine.js");

var root = path.resolve(__dirname, "../../games/pegboard");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };
var html = read("index.html");
var game = read("js/game.js");
var DICT = loadI18n("games/pegboard/js/strings.js").I18n._dict;

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
  var keyFor = /key: [^,}]+\? "(\w+)" : "(\w+)"/g;
  while ((match = keyFor.exec(game))) used.push(match[1], match[2]);
  Engine.RISKS.forEach(function (risk) { used.push("risk" + risk.charAt(0).toUpperCase() + risk.slice(1)); });
  used.push("landedWin", "landedBack", "manyResult", "droppingMany", "dropping");
  assert.ok(used.length > 80, used.length + " words");
  used.forEach(function (key) {
    assert.ok(Object.prototype.hasOwnProperty.call(DICT.en, key), "missing word: " + key);
  });
});

test("the printed ways down are the boards' own", function () {
  Engine.ROWS.forEach(function (rows) {
    assert.match(DICT.en.returnsHint, new RegExp(Math.pow(2, rows).toLocaleString("en-US") + " for " + rows), rows + " rows");
    assert.match(DICT.tr.returnsHint, new RegExp(rows + " sırada " + Math.pow(2, rows).toLocaleString("tr-TR")), rows + " sıra");
  });
  assert.match(DICT.en.ballsRules, new RegExp("Drop " + Engine.BALLS.slice(0, -1).join(", ") + " or " + Engine.BALLS[Engine.BALLS.length - 1] + " balls"));
});

test("a button for every board, risk and count of balls the engine knows", function () {
  var values = function (attribute) { return Array.from(html.matchAll(new RegExp(attribute + '="(\\w+)" type="button" role="radio"', "g")), function (m) { return m[1]; }); };
  assert.deepEqual(values("data-rows").map(Number), Engine.ROWS);
  assert.deepEqual(values("data-risk"), Engine.RISKS);
  assert.deepEqual(values("data-balls").map(Number), Engine.BALLS);
  ["W", "K", "B"].forEach(function (key) { assert.match(html, new RegExp('aria-keyshortcuts="' + key + '"')); });
  assert.match(html, /id="btnDrop"[^>]*aria-keyshortcuts="Space Enter"/);
});

test("the tray offers bets the machine takes, from $10 to its maximum", function () {
  var tray = Array.from(html.matchAll(/class="chip chip-\w+" data-value="(\d+)"/g), function (m) { return Number(m[1]); });
  assert.deepEqual(tray, [10, 50, 100, 500, 1000, 5000]);
  tray.forEach(function (value) { assert.equal(Engine.normalizeBet(value), value, "$" + value); });
  assert.equal(tray[tray.length - 1], Engine.MAX_BET);
  assert.match(html, /id="tableMin">\$10</);
  assert.match(html, /id="tableMax">\$5,000</);
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
  assert.match(html, /<title>Drop 16 · ThePit<\/title>/);
});

test("scripts and stylesheets load in dependency order", function () {
  var scripts = Array.from(html.matchAll(/<script\b[^>]*src="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(scripts, ["../../shared/js/pit.js", "../../shared/js/i18n.js", "js/strings.js", "../../shared/js/card-sound.js",
    "../../shared/js/chips.js", "js/engine.js", "js/store.js", "js/game.js", "../../shared/js/pwa.js"]);
  var sheets = Array.from(html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(sheets, ["../../shared/css/pit.css", "../../shared/css/table.css", "../../shared/css/chip-tables.css", "css/styles.css"]);
});

test("every ball's path and the stake are saved before the first ball falls", function () {
  var dropping = game.slice(game.indexOf("  function drop()"), game.indexOf("  async function playRound"));
  var draw = dropping.indexOf("Engine.drop(rows)");
  var save = dropping.indexOf('account.write("round"');
  var debit = dropping.indexOf('account.write("bankroll", bankroll - cost)');
  var show = dropping.indexOf("return playRound(round)");
  assert.ok(draw > 0 && save > draw && debit > 0 && show > save && show > debit);
  assert.match(dropping, /account\.roundsElsewhere\(\)/, "a round open at another table comes first");
  assert.match(read("css/styles.css"), /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(game, /prefers-reduced-motion: reduce/);
});
