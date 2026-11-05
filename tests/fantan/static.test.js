/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var loadI18n = require("../helpers/i18n.js").loadI18n;
var Engine = require("../../games/fantan/js/engine.js");

var root = path.resolve(__dirname, "../../games/fantan");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };
var html = read("index.html");
var game = read("js/game.js");
var DICT = loadI18n("games/fantan/js/strings.js").I18n._dict;
var PAY_KEYS = { fan: "payFan", nim: "payNim", pair: "payPair", tan: "payTan", ssh: "paySsh" };

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
  var call = /\b(?:t|I18n\.t|I18n\.pick|setBanner)\("(\w+)"\s*[,)]/g;
  while ((match = call.exec(game))) used.push(match[1]);
  var keyed = /\{ key: "(\w+)"/g;
  while ((match = keyed.exec(game))) used.push(match[1]);
  Object.keys(PAY_KEYS).forEach(function (kind) { used.push(PAY_KEYS[kind]); });
  assert.ok(used.length > 90, used.length + " words");
  used.forEach(function (key) {
    assert.ok(Object.prototype.hasOwnProperty.call(DICT.en, key), "missing word: " + key);
  });
});

test("the printed odds and house edges are the engine's, in both languages", function () {
  // Turkish states the stake first: 3 to 1 is "1'e 3", 1 to 2 is "2'ye 1".
  var turkish = { "3/1": "1'E 3", "2/1": "1'E 2", "1/1": "1'E 1", "1/2": "2'YE 1", "1/3": "3'E 1" };
  Object.keys(PAY_KEYS).forEach(function (kind) {
    var odds = Engine.KINDS[kind];
    assert.equal(DICT.en[PAY_KEYS[kind]], odds.num + " TO " + odds.den, kind);
    assert.equal(DICT.tr[PAY_KEYS[kind]], turkish[odds.num + "/" + odds.den], kind);
  });
  var edge = function (kind) { return (Engine.houseEdge(Engine.BETS.filter(function (key) { return Engine.kindOf(key) === kind; })[0]) * 100).toFixed(2); };
  assert.equal(DICT.en.houseEdges, "House edge: Fan " + edge("fan") + "%; Nim, Kwok, Odd and Even " + edge("nim") + "%; Nga Tan and Sheh Sam Hong " + edge("tan") + "%.");
  assert.equal(edge("pair"), edge("nim"));
  assert.equal(edge("ssh"), edge("tan"));
  assert.match(DICT.tr.houseEdges, new RegExp("Fan %" + edge("fan").replace(".", ",")));
  assert.match(DICT.en.beadsHint, new RegExp(Engine.MIN_BEADS + " to " + (Engine.MIN_BEADS + Engine.BEAD_COUNTS - 1) + " beads"));
  assert.match(DICT.tr.beadsHint, new RegExp(Engine.MIN_BEADS + " ile " + (Engine.MIN_BEADS + Engine.BEAD_COUNTS - 1)));
  assert.match(DICT.en.commissionRules, /less 5% commission/);
});

test("a spot for every bet, in the engine's order, named for the numbers it covers", function () {
  // A space parts the name from the sub so that "1" and "NIM 2" read as two words.
  var spots = Array.from(html.matchAll(/<button class="spot spot-(\w+)" data-bet="(\w+)" type="button"><span class="spot-name"[^>]*>([^<]+)<\/span>(?: <span class="spot-sub">([^<]+)<\/span>)?/g),
    function (m) { return { kind: m[1], key: m[2], name: m[3], sub: m[4] || "" }; });
  assert.deepEqual(spots.map(function (spot) { return spot.key; }), Engine.BETS);
  spots.forEach(function (spot) {
    var def = Engine.DEFS[spot.key];
    assert.equal(spot.kind, def.kind, spot.key);
    if (spot.key === "odd" || spot.key === "even") { assert.equal(spot.sub, def.wins.join(" · "), spot.key); return; }
    assert.equal(spot.name, def.wins.join("·"), spot.key);
    assert.equal(spot.sub, def.push.length ? def.kind.toUpperCase() + " " + def.push[0] : "", spot.key);
  });
  assert.match(html, /id="btnOpen"[^>]*aria-keyshortcuts="Space Enter"/);
});

test("the tray starts at the table minimum of $5, and the plaque shows the largest limit", function () {
  var tray = Array.from(html.matchAll(/class="chip chip-\w+" data-value="(\d+)"/g), function (m) { return Number(m[1]); });
  assert.deepEqual(tray, [5, 25, 100, 500, 1000, 5000]);
  assert.match(html, /id="tableMin">\$5</);
  assert.match(html, /id="tableMax">\$5,000</);
  assert.equal(Math.max.apply(null, Engine.BETS.map(Engine.maxBet)), 5000);
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
  assert.match(html, /<title>Table 4 · ThePit<\/title>/);
});

test("scripts and stylesheets load in dependency order", function () {
  var scripts = Array.from(html.matchAll(/<script\b[^>]*src="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(scripts, ["../../shared/js/pit.js", "../../shared/js/i18n.js", "js/strings.js", "../../shared/js/card-sound.js",
    "../../shared/js/chips.js", "js/engine.js", "js/store.js", "js/game.js", "../../shared/js/pwa.js"]);
  var sheets = Array.from(html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g), function (m) { return m[1]; });
  assert.deepEqual(sheets, ["../../shared/css/pit.css", "../../shared/css/table.css", "../../shared/css/chip-tables.css", "css/styles.css"]);
});

test("the bets, the stake and the pile are saved before the bowl is lifted", function () {
  var opening = game.slice(game.indexOf("  function open()"), game.indexOf("  async function playRound"));
  var draw = opening.indexOf("Engine.drawBeads()");
  var save = opening.indexOf('account.write("round"');
  var debit = opening.indexOf('account.write("bankroll", bankroll - stake)');
  var show = opening.indexOf("return playRound(round)");
  assert.ok(draw > 0 && save > draw && debit > 0 && show > save && show > debit);
  assert.match(opening, /account\.roundsElsewhere\(\)/, "a round open at another table comes first");
  assert.match(game, /account\.write\("box", settlement\.box\)/, "the change is kept with the balance");
  assert.match(read("css/styles.css"), /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(game, /prefers-reduced-motion: reduce/);
});
