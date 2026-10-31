/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

var root = path.resolve(__dirname, "../../games/blackjack");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };
var runtimeTextFiles = [
  "index.html", "css/styles.css", "js/strings.js", "js/engine.js",
  "js/rules.js", "js/chip-stack.js", "js/strategy.js", "js/round.js", "js/game.js"
];

runtimeTextFiles.forEach(function (file) {
  test("runtime file is nonempty UTF-8 text: " + file, function () {
    var buffer = fs.readFileSync(path.join(root, file));
    assert.ok(buffer.length > 0);
    assert.notDeepEqual(Array.from(buffer.subarray(0, 3)), [0xef, 0xbb, 0xbf], "unexpected BOM");
    assert.doesNotMatch(buffer.toString("utf8"), /\uFFFD/, "invalid UTF-8 replacement character");
  });
});

[
  "js/strings.js", "js/engine.js", "js/rules.js",
  "js/chip-stack.js", "js/strategy.js", "js/round.js", "js/game.js"
].forEach(function (file) {
  test("JavaScript parses successfully: " + file, function () {
    assert.doesNotThrow(function () { new vm.Script(read(file), { filename: file }); });
  });
});

test("every HTML id is unique", function () {
  var ids = Array.from(read("index.html").matchAll(/\bid=["']([^"']+)["']/g), function (match) { return match[1]; });
  var duplicates = ids.filter(function (id, index) { return ids.indexOf(id) !== index; });
  assert.deepEqual(duplicates, []);
});

test("every button declares a safe non-submit type", function () {
  var buttons = read("index.html").match(/<button\b[^>]*>/g) || [];
  assert.ok(buttons.length >= 25);
  buttons.forEach(function (button) {
    assert.match(button, /\btype=["']button["']/i, button);
  });
});

test("all label for attributes point to existing controls", function () {
  var html = read("index.html");
  var ids = new Set(Array.from(html.matchAll(/\bid=["']([^"']+)["']/g), function (match) { return match[1]; }));
  Array.from(html.matchAll(/<label\b[^>]*\bfor=["']([^"']+)["']/g), function (match) { return match[1]; })
    .forEach(function (target) { assert.ok(ids.has(target), "missing label target: " + target); });
});

test("runtime scripts load in dependency order", function () {
  var scripts = Array.from(read("index.html").matchAll(/<script\b[^>]*src=["']([^"']+)["']/g), function (match) {
    return match[1];
  });
  assert.deepEqual(scripts, [
    "../../shared/js/pit.js", "../../shared/js/i18n.js", "js/strings.js", "../../shared/js/card-sound.js", "../../shared/js/cards.js", "js/engine.js", "js/rules.js",
    "js/chip-stack.js", "js/strategy.js", "js/round.js", "js/game.js", "../../shared/js/pwa.js"
  ]);
});

test("the tab names Table 21 in the pit and every home screen names ThePit", function () {
  var html = read("index.html");
  assert.match(html, /<title>Table 21 · ThePit<\/title>/);
  assert.match(html, /<meta property="og:title" content="Table 21 · ThePit" \/>/);
  assert.match(html, /<meta name="application-name" content="ThePit" \/>/);
  // Without it iOS names the home-screen icon after the page title.
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="ThePit" \/>/);
  // English and Turkish tab titles alike.
  assert.equal((read("js/strings.js").match(/^\s+appTitle: "Table 21 · ThePit",$/gm) || []).length, 2);
});

test("balance controls speak of play money, never of banking", function () {
  var html = read("index.html");
  assert.match(html, /data-i18n="addFunds">Add play money</);
  assert.match(html, /id="btnDeposit"[^>]*data-i18n="deposit">Add</);
  var strings = Array.from((read("../../shared/js/i18n.js") + read("js/strings.js")).matchAll(/^\s+\w+: "([^"]*)"/gm), function (match) { return match[1]; });
  assert.ok(strings.length > 300);
  strings.forEach(function (text) {
    assert.doesNotMatch(text, /deposit|withdraw|cash out|para yatır|para çek/i, text);
  });
});

test("the app icon is a self-contained scalable vector", function () {
  var icon = read("icon.svg");
  assert.match(icon, /^<svg\b/);
  assert.match(icon, /viewBox="0 0 512 512"/);
  assert.doesNotMatch(icon, /<(?:image|script|foreignObject)\b/i);
  assert.doesNotMatch(icon, /\b(?:href|src)=["'](?:https?:)?\/\//i);
});

test("HTML has no inline executable event handlers", function () {
  assert.doesNotMatch(read("index.html"), /\son[a-z]+\s*=/i);
});

test("runtime JavaScript avoids dynamic code execution", function () {
  ["js/strings.js", "js/engine.js", "js/rules.js", "js/chip-stack.js", "js/strategy.js", "js/round.js", "js/game.js"]
    .forEach(function (file) {
      assert.doesNotMatch(read(file), /\beval\s*\(|\bnew\s+Function\b/, file);
    });
});

test("all stylesheet braces are balanced", function () {
  var css = read("css/styles.css").replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "");
  var depth = 0;
  Array.from(css).forEach(function (character) {
    if (character === "{") depth++;
    if (character === "}") depth--;
    assert.ok(depth >= 0, "closing brace without opener");
  });
  assert.equal(depth, 0);
});

test("every referenced CSS animation has a matching keyframe", function () {
  var css = read("css/styles.css");
  var keyframes = new Set(Array.from(css.matchAll(/@keyframes\s+([\w-]+)/g), function (match) { return match[1]; }));
  var references = Array.from(css.matchAll(/\banimation:\s*([\w-]+)/g), function (match) { return match[1]; });
  references.filter(function (name) { return name !== "none"; }).forEach(function (name) {
    assert.ok(keyframes.has(name), "missing keyframes: " + name);
  });
});

test("responsive rules cover phone width, short height, and reduced motion", function () {
  var css = read("css/styles.css");
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(max-width: 420px\)/);
  assert.match(css, /@media \(max-width: 350px\)/);
  assert.match(css, /@media \(max-height: 620px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("all visual themes define their own table and card-back palette", function () {
  // The felt of each cloth is the pit's; the card back that matches it is this table's.
  var palettes = { "../../shared/css/pit.css": ["--felt-highlight", "--felt-1", "--felt-2", "--felt-edge"], "../../shared/css/cards.css": ["--card-back-top", "--card-back-bottom"] };
  Object.keys(palettes).forEach(function (file) {
    var css = read(file);
    ["midnight", "bordeaux", "onyx", "amethyst"].forEach(function (theme) {
      var block = css.match(new RegExp('body\\[data-theme="' + theme + '"\\]\\s*\\{([\\s\\S]*?)\\}'));
      assert.ok(block, file + " " + theme);
      palettes[file].forEach(function (variable) { assert.ok(block[1].includes(variable + ":"), theme + " missing " + variable); });
    });
  });
});

test("settings and insurance dialogs declare modal semantics", function () {
  var html = read("index.html");
  assert.match(html, /class="modal-card" role="dialog" aria-modal="true" aria-labelledby="settingsTitle"/);
  assert.match(html, /class="ins-panel" role="dialog" aria-modal="true" aria-labelledby="insTitle" aria-describedby="insDesc"/);
});

test("settings switches and grouped controls have accessible names", function () {
  var html = read("index.html");
  assert.match(html, /<label for="setHitSoft17"[^>]*data-i18n="dealerHitsSoft17"/);
  assert.match(html, /<label for="setSound"[^>]*data-i18n="soundLabel"/);
  assert.match(html, /class="seg" role="group" aria-labelledby="settingsLanguageLabel"/);
  assert.match(html, /class="seg" role="group" aria-labelledby="deckCountLabel"/);
  ["Master", "Cards", "Chips", "Table"].forEach(function (name) {
    assert.match(html, new RegExp('id="sound' + name + '"[^>]*aria-labelledby="sound' + name + 'Label"'));
  });
});

test("all keyboard actions advertise their shortcuts", function () {
  var html = read("index.html");
  ["btnClear", "btnDeal", "btnRebet", "btnHit", "btnStand", "btnDouble", "btnSplit", "btnSurrender"]
    .forEach(function (id) {
      var button = html.match(new RegExp('<button\\b[^>]*id="' + id + '"[^>]*>'));
      assert.ok(button, id);
      assert.match(button[0], /aria-keyshortcuts=/, id);
    });
});

test("arbitrary whole-dollar deposits match exact chip settlement support", function () {
  var html = read("index.html");
  var game = read("js/game.js");
  assert.match(html, /id="depositAmount"[^>]*min="1" step="1"/);
  assert.match(game, /CHIP_DENOMS = \[25000, 5000, 1000, 500, 100, 50, 25, 10, 5, 1\]/);
});

test("per-hand high-limit stacks use a narrow row contract", function () {
  var game = read("js/game.js");
  var css = read("css/styles.css");
  assert.match(game, /maxColumnsPerRow: isHandStack \? 3 : 6/);
  assert.match(css, /\.hand-wager \.pile-dense \.pile-row/);
  assert.match(css, /--stack-w: 24px/);
  assert.match(game, /state\.hands\.length >= 3/);
  assert.match(game, /stackOptions\.exactChipLimit = 8/);
  assert.match(css, /\.hand-count-4 \.hand-wager \.pile-dense/);
});

test("split twenty-one is not presented as a natural blackjack", function () {
  var game = read("js/game.js");
  assert.match(game, /var split = state\.hands\.length > 1;/);
  assert.match(game, /naturalBlackjack = !split && !hand\.fromSplit && isBlackjack\(hand\.cards\)/);
  assert.match(game, /!state\.hands\[0\]\.fromSplit && isBlackjack\(state\.hands\[0\]\.cards\)/);
});

test("money messages contain no accidental double-space separators", function () {
  var game = read("js/game.js");
  var i18n = read("../../shared/js/i18n.js") + read("js/strings.js");
  assert.doesNotMatch(game, /["']  [+-]\$/);
  assert.doesNotMatch(i18n, /  \+\$/);
});

test("the bankroll is the pit's shared wallet, with room for legitimate large wins", function () {
  var game = read("js/game.js");
  var Pit = require("../../shared/js/pit.js");
  assert.match(game, /MAX_BANKROLL = Pit\.MAX_BANKROLL;/);
  assert.match(game, /bankroll: Pit\.KEYS\.bankroll,/);
  assert.doesNotMatch(game, /MAX_BANKROLL = 1e9/);
  assert.ok(Pit.MAX_BANKROLL >= 1e12);
});

test("small shoes use a penetration-based reserve instead of reshuffling every hand", function () {
  var game = read("js/game.js");
  assert.match(game, /penetrationReserve = Math\.ceil\(needed \* \(1 - PENETRATION\)\)/);
  assert.match(game, /Math\.min\(ROUND_CARD_RESERVE, Math\.max\(12, penetrationReserve\)\)/);
  assert.doesNotMatch(game, /Math\.min\(ROUND_CARD_RESERVE, needed\)/);
});

test("live visual settings never persist an in-progress wager deduction", function () {
  var game = read("js/game.js");
  assert.match(game, /function persistSettings\(\)\s*\{\s*save\(KEYS\.settings, state\.settings\);\s*save\(Pit\.KEYS\.theme, state\.settings\.theme\);\s*\}/);
  assert.match(game, /state\.settings\.theme = theme;\s*persistSettings\(\);/);
  assert.match(game, /state\.settings\.animationSpeed = speed;\s*persistSettings\(\);/);
  assert.match(game, /state\.settings\.hitSoft17 = e\.target\.checked;[\s\S]*?persistSettings\(\);/);
});

test("deposits are persisted independently and disabled throughout live rounds", function () {
  var game = read("js/game.js");
  assert.match(game, /function deposit\(amount\)\s*\{\s*if \(state\.phase !== "betting" \|\| state\.busy\) return false;/);
  assert.match(game, /state\.bankroll = nextBankroll;\s*persistBankroll\(\);/);
  assert.match(game, /var depositDisabled = !betting \|\| state\.busy;/);
  assert.match(game, /document\.querySelectorAll\("\[data-deposit\]"\)[\s\S]*?button\.disabled = depositDisabled;/);
});
