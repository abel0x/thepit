/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var loadI18n = require("../helpers/i18n.js").loadI18n;
var Engine = require("../../games/bigsix/js/engine.js");

var root = path.resolve(__dirname, "../../games/bigsix");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };
var html = read("index.html");
var game = read("js/game.js");
var DICT = loadI18n("games/bigsix/js/strings.js").I18n._dict;

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
  Engine.BETS.forEach(function (key) { used.push(key + "Name"); });
  ["payTo", "spotCount", "wheelLabel"].forEach(function (key) { used.push(key); });
  assert.ok(used.length > 60, used.length + " words");
  used.forEach(function (key) {
    assert.ok(Object.prototype.hasOwnProperty.call(DICT.en, key), "missing word: " + key);
  });
});

test("every bet the engine knows has its spot, its stack, its printed pay and its share of the wheel", function () {
  Engine.BETS.forEach(function (key) {
    var spot = html.match(new RegExp('<button class="spot [^"]*" data-bet="' + key + '" type="button">([\\s\\S]*?)</button>'));
    assert.ok(spot, key + " can be bet");
    assert.match(spot[1], new RegExp('data-stack="' + key + '"'), key + " has a stack");
    assert.equal(Number(/data-pay="(\d+)"/.exec(spot[1])[1]), Engine.PAYS[key], key + " prints what it pays");
    assert.match(spot[1], new RegExp(Engine.countOf(key) + " of 54"), key + " prints its share of the wheel");
  });
  assert.equal((html.match(/data-bet=/g) || []).length, Engine.BETS.length);
});

test("the printed house edges are the engine's, in both languages", function () {
  var samples = { one: "$1", two: "$2", five: "$5", ten: "$10", twenty: "$20", joker: "Joker and logo" };
  Object.keys(samples).forEach(function (key) {
    var edge = (Engine.houseEdge(key) * 100).toFixed(2);
    assert.ok(DICT.en.edgeLine.indexOf(samples[key] + " " + edge + "%") !== -1, key);
    assert.ok(DICT.tr.edgeLine.indexOf("%" + edge.replace(".", ",")) !== -1, key + " in Turkish");
  });
  assert.equal(Engine.houseEdge("joker"), Engine.houseEdge("logo"));
  assert.equal(DICT.en.payTo.replace("{n}", 40), "40 TO 1");
  assert.equal(DICT.tr.payTo.replace("{n}", 40), "1'E 40", "Turkish odds read the Turkish way round");
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
  assert.match(html, /<title>Wheel 54 · ThePit<\/title>/);
  assert.doesNotMatch(html, /sic ?bo|Table 18|dice/i);
  var tray = Array.from(html.matchAll(/class="chip chip-\w+" data-value="(\d+)"/g), function (m) { return Number(m[1]); });
  assert.deepEqual(tray, [5, 25, 100, 500, 1000, 5000]);
  assert.equal(tray[tray.length - 1], Engine.LIMITS.one, "the largest chip is the largest bet");
});

test("scripts and stylesheets load in dependency order", function () {
  var scripts = Array.from(html.matchAll(/<script\b[^>]*src="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(scripts, ["../../shared/js/pit.js", "../../shared/js/i18n.js", "js/strings.js", "../../shared/js/card-sound.js",
    "../../shared/js/chips.js", "js/engine.js", "js/store.js", "js/game.js", "../../shared/js/pwa.js"]);
  var sheets = Array.from(html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(sheets, ["../../shared/css/pit.css", "../../shared/css/table.css", "../../shared/css/chip-tables.css", "css/styles.css"]);
});

test("the bets, the stake and the segment are saved before the wheel turns", function () {
  var spinning = game.slice(game.indexOf("  function spin()"), game.indexOf("  function wait("));
  var save = spinning.indexOf('account.write("round", Store.roundSnapshot(round))');
  var debit = spinning.indexOf('account.write("bankroll", bankroll - wager)');
  var show = spinning.indexOf("return playSpin(round)");
  assert.ok(save > 0 && debit > 0 && show > save && show > debit);
  assert.match(spinning, /segment: Engine\.spin\(\)/);
  assert.match(spinning, /account\.roundsElsewhere\(\)/, "a round open at another table comes first");
  assert.match(read("css/styles.css"), /@media \(prefers-reduced-motion: reduce\)/);
});
