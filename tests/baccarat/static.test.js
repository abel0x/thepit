/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var loadI18n = require("../helpers/i18n.js").loadI18n;
var Engine = require("../../games/baccarat/js/engine.js");

var root = path.resolve(__dirname, "../../games/baccarat");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };
var html = read("index.html");
var game = read("js/game.js");
var DICT = loadI18n("games/baccarat/js/strings.js").I18n._dict;

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
  var call = /\b(?:t|I18n\.t|I18n\.pick|setBanner)\("(\w+)"/g;
  while ((match = call.exec(game))) used.push(match[1]);
  var keyed = /\{ key: "(\w+)"/g;
  while ((match = keyed.exec(game))) used.push(match[1]);
  ["playerName", "bankerName", "tieName", "playerPairName", "bankerPairName", "playerWins", "bankerWins", "tieWins",
    "payBankerClassic", "payBankerNoCommission", "profileShortClassic", "profileShortNoCommission"].forEach(function (key) { used.push(key); });
  assert.ok(used.length > 80, used.length + " words");
  used.forEach(function (key) {
    assert.ok(Object.prototype.hasOwnProperty.call(DICT.en, key), "missing word: " + key);
  });
});

test("the rules say the house edges the engine computes, in both languages", function () {
  assert.match(DICT.en.profileClassicSummary, /1\.06% on Banker and 1\.24% on Player/);
  assert.match(DICT.en.profileNoCommissionSummary, /1\.46% on Banker and 1\.24% on Player/);
  assert.match(DICT.tr.profileClassicSummary, /Bankoda %1,06, Oyuncuda %1,24/);
  assert.match(DICT.tr.profileNoCommissionSummary, /Bankoda %1,46, Oyuncuda %1,24/);
  assert.equal(DICT.tr.payBankerClassic, "20'YE 19", "Turkish odds read the Turkish way round");
  assert.equal(DICT.tr.payTie, "1'E 8");
});

test("a spot for every bet, each a real button", function () {
  var spots = Array.from(html.matchAll(/<button class="spot [^"]*" data-bet="(\w+)" type="button"/g), function (m) { return m[1]; });
  assert.deepEqual(spots, Engine.BETS);
  ["P", "T", "B"].forEach(function (key) { assert.match(html, new RegExp('aria-keyshortcuts="' + key + '"')); });
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
});

test("scripts and stylesheets load in dependency order", function () {
  var scripts = Array.from(html.matchAll(/<script\b[^>]*src="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(scripts, ["../../shared/js/pit.js", "../../shared/js/i18n.js", "js/strings.js", "../../shared/js/card-sound.js",
    "../../shared/js/cards.js", "../../shared/js/chips.js", "js/engine.js", "js/store.js", "js/game.js", "../../shared/js/pwa.js"]);
  var sheets = Array.from(html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(sheets, ["../../shared/css/pit.css", "../../shared/css/table.css", "../../shared/css/cards.css",
    "../../shared/css/chip-tables.css", "css/styles.css"]);
});

test("the coup and its stake are saved before the first card is shown", function () {
  var dealing = game.slice(game.indexOf("  function deal()"), game.indexOf("  async function playRound"));
  var save = dealing.indexOf('account.write("round"');
  var debit = dealing.indexOf('account.write("bankroll", bankroll - stake)');
  var show = dealing.indexOf("return playRound(round, fresh)");
  assert.ok(save > 0 && debit > 0 && show > save && show > debit);
  assert.match(dealing, /account\.roundsElsewhere\(\)/, "a round open at another table comes first");
  assert.match(read("css/styles.css"), /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(game, /prefers-reduced-motion: reduce/);
});
