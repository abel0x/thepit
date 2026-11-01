/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var loadI18n = require("../helpers/i18n.js").loadI18n;
var Engine = require("../../games/sicbo/js/engine.js");

var root = path.resolve(__dirname, "../../games/sicbo");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };
var html = read("index.html");
var game = read("js/game.js");
var DICT = loadI18n("games/sicbo/js/strings.js").I18n._dict;

function placeholders(text) {
  return [].concat(text).join(" ").match(/\{\w+\}/g) || [];
}

function percent(edge, lang) {
  var text = (edge * 100).toFixed(2);
  return lang === "tr" ? "%" + text.replace(".", ",") : text + "%";
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
  var attribute = /data-i18n(?:-[a-z-]+)?="(\w+)"/g;
  while ((match = attribute.exec(html))) used.push(match[1]);
  var call = /\b(?:t|I18n\.t|I18n\.pick|setBanner)\("(\w+)"\s*[,)]/g;
  while ((match = call.exec(game))) used.push(match[1]);
  var keyed = /\bkey: "(\w+)"/g;
  while ((match = keyed.exec(game))) used.push(match[1]);
  ["small", "big", "odd", "even", "anyTriple", "total", "triple", "double", "combo", "single"].forEach(function (key) { used.push(key + "Name"); });
  ["sizeSmall", "sizeBig", "payTo", "paySingle"].forEach(function (key) { used.push(key); });
  assert.ok(used.length > 70, used.length + " words");
  used.forEach(function (key) {
    assert.ok(Object.prototype.hasOwnProperty.call(DICT.en, key), "missing word: " + key);
  });
});

test("every bet the engine knows has its spot, its stack and its printed pay", function () {
  Engine.BETS.forEach(function (key) {
    var spot = html.match(new RegExp('<button class="spot [^"]*" data-bet="' + key + '" type="button">([\\s\\S]*?)</button>'));
    assert.ok(spot, key + " can be bet");
    assert.match(spot[1], new RegExp('data-stack="' + key + '"'), key + " has a stack");
    var printed = /data-pay="(\w+)"/.exec(spot[1])[1];
    var best = Math.max.apply(null, [1, 2, 3, 4, 5, 6].map(function (n) {
      return Math.max.apply(null, [1, 2, 3, 4, 5, 6].map(function (m) { return Engine.payFor(key, [n, m, m]); }));
    }).concat([Engine.payFor(key, [1, 2, 3]), Engine.payFor(key, [4, 5, 6])]));
    if (Engine.kindOf(key) === "single") assert.equal(printed, "single", key);
    else assert.equal(Number(printed), best, key + " prints what it pays");
  });
  assert.equal((html.match(/data-bet=/g) || []).length, Engine.BETS.length);
});

test("the printed house edges are the engine's, in both languages", function () {
  var samples = { small: "Small, Big, Odd and Even", single1: "Number", total7: "Total 7 and 14", total8: "Total 8, 10, 11 and 13",
    total5: "Total 5 and 16", total4: "Total 4 and 17", total6: "Total 6 and 15", total9: "Total 9 and 12",
    anyTriple: "Any triple", triple1: "Triple", combo12: "Combination", double1: "Double" };
  Object.keys(samples).forEach(function (key) {
    assert.ok(DICT.en.edgeLine.indexOf(samples[key] + " " + percent(Engine.houseEdge(key), "en")) !== -1, key);
    assert.ok(DICT.tr.edgeLine.indexOf(percent(Engine.houseEdge(key), "tr")) !== -1, key + " in Turkish");
  });
  assert.equal(DICT.en.edgeLine.split(" · ").length, Object.keys(samples).length);
  assert.equal(DICT.tr.edgeLine.split(" · ").length, Object.keys(samples).length);
  assert.equal(DICT.en.payTo.replace("{n}", 60), "60 TO 1");
  assert.equal(DICT.tr.payTo.replace("{n}", 60), "1'E 60", "Turkish odds read the Turkish way round");
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
  assert.match(html, /<title>Table 18 · ThePit<\/title>/);
  assert.doesNotMatch(html, /craps|Table 7/i);
  var tray = Array.from(html.matchAll(/class="chip chip-\w+" data-value="(\d+)"/g), function (m) { return Number(m[1]); });
  assert.deepEqual(tray, [5, 25, 100, 500, 1000, 5000]);
  assert.equal(tray[tray.length - 1], Engine.LIMITS.even, "the largest chip is the largest bet");
});

test("scripts and stylesheets load in dependency order", function () {
  var scripts = Array.from(html.matchAll(/<script\b[^>]*src="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(scripts, ["../../shared/js/pit.js", "../../shared/js/i18n.js", "js/strings.js", "../../shared/js/card-sound.js",
    "../../shared/js/chips.js", "js/engine.js", "js/store.js", "js/game.js", "../../shared/js/pwa.js"]);
  var sheets = Array.from(html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(sheets, ["../../shared/css/pit.css", "../../shared/css/table.css", "../../shared/css/chip-tables.css", "css/styles.css"]);
});

test("the bets, the stake and the dice are saved before the dice are shown", function () {
  var rolling = game.slice(game.indexOf("  function roll()"), game.indexOf("  // The dice shake"));
  var save = rolling.indexOf('account.write("round", Store.roundSnapshot(round))');
  var debit = rolling.indexOf('account.write("bankroll", bankroll - wager)');
  var show = rolling.indexOf("return playRoll(round)");
  assert.ok(save > 0 && debit > 0 && show > save && show > debit);
  assert.match(rolling, /dice: Engine\.rollDice\(\)/);
  assert.match(rolling, /account\.roundsElsewhere\(\)/, "a round open at another table comes first");
  assert.match(read("css/styles.css"), /@media \(prefers-reduced-motion: reduce\)/);
});
