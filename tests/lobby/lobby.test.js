/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");
var Pit = require("../../shared/js/pit.js");

var root = path.resolve(__dirname, "../..");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };
var html = read("index.html");

function loadI18n(saved) {
  var storage = { "pit.lang": saved };
  var sandbox = {
    localStorage: {
      getItem: function (key) { return storage[key] == null ? null : storage[key]; },
      setItem: function (key, value) { storage[key] = value; }
    },
    document: { querySelectorAll: function () { return []; }, documentElement: { setAttribute: function () {} } }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(require("../helpers/i18n.js").i18nSource("lobby/js/strings.js"), sandbox);
  return { I18n: sandbox.I18n, storage: storage };
}

var DICT = loadI18n(null).I18n._dict;

function placeholders(text) {
  return (text.match(/\{\w+\}/g) || []).sort();
}

test("English and Turkish define the same keys with the same placeholders", function () {
  assert.deepEqual(Object.keys(DICT).sort(), ["en", "tr"]);
  assert.deepEqual(Object.keys(DICT.tr).sort(), Object.keys(DICT.en).sort());
  Object.keys(DICT.en).forEach(function (key) {
    assert.equal(typeof DICT.tr[key], "string", key);
    assert.ok(DICT.tr[key].trim().length > 0, key);
    assert.deepEqual(placeholders(DICT.tr[key]), placeholders(DICT.en[key]), key);
  });
});

test("every key the lobby asks for exists", function () {
  var used = [];
  var match;
  var attribute = /data-i18n(?:-[a-z-]+)?="(\w+)"/g;
  while ((match = attribute.exec(html))) used.push(match[1]);
  var call = /\bt\("(\w+)"/g;
  var code = read("lobby/js/lobby.js");
  while ((match = call.exec(code))) used.push(match[1]);
  assert.ok(used.length > 30);
  used.forEach(function (key) {
    assert.ok(Object.prototype.hasOwnProperty.call(DICT.en, key), "missing key: " + key);
  });
});

test("the language is shared with every table and English comes first", function () {
  assert.equal(loadI18n(null).I18n.get(), "en");
  assert.equal(loadI18n("tr").I18n.get(), "tr");
  assert.equal(loadI18n("de").I18n.get(), "en");
  assert.equal(loadI18n("__proto__").I18n.get(), "en");
  var loaded = loadI18n(null);
  loaded.I18n.setLanguage("tr");
  assert.equal(loaded.storage["pit.lang"], "tr");
  assert.equal(loaded.I18n.locale(), "tr-TR");
  assert.match(read("shared/js/i18n.js"), /var STORAGE_KEY = "pit\.lang";/);
  ["index.html", "games/blackjack/index.html", "games/roulette/index.html"].forEach(function (page) {
    var html = read(page);
    var engine = html.search(/shared\/js\/i18n\.js/);
    var words = html.search(/js\/strings\.js/);
    assert.ok(engine !== -1 && words > engine, page + " loads the shared engine before its own words");
  });
});

test("the lobby speaks of play money, never of banking", function () {
  ["en", "tr"].forEach(function (lang) {
    Object.keys(DICT[lang]).forEach(function (key) {
      assert.doesNotMatch(DICT[lang][key], /deposit|withdraw|cash out|para yatır|para çek/i, lang + " " + key);
      assert.doesNotMatch(DICT[lang][key], /—|–/, "natural punctuation instead of long dashes: " + key);
    });
    assert.match(DICT[lang].disclaimerPlayMoney, /ThePit/);
    assert.ok(DICT[lang].disclaimerOdds.length > 60);
    assert.ok(DICT[lang].disclaimerWarranty.length > 40);
  });
  assert.equal(DICT.en.appTitle, "ThePit");
  assert.match(DICT.tr.blackjackSummary, /^Blackjack 2'ye 3 öder\./, "Turkish odds read the Turkish way round");
});

test("every table of the pit has a card that leads to its page", function () {
  Object.keys(Pit.TABLES).forEach(function (id) {
    var card = html.match(new RegExp('<li class="table-card" data-game="' + id + '">[\\s\\S]*?</li>'));
    assert.ok(card, "card for " + id);
    var link = card[0].match(/<a class="table-card-link" href="([^"]+)">/);
    assert.ok(link, id + " link");
    assert.equal(link[1], "games/" + id + "/index.html");
    assert.ok(fs.existsSync(path.join(root, link[1])), link[1]);
    // "Table 21", "Slot 5": the card's lockup shows the word and the number.
    var name = Pit.TABLES[id].split(" ");
    assert.match(card[0], new RegExp('<span class="table-word">' + name[0].toUpperCase() + '</span><span class="table-number">' + name[1] + "</span>"), id);
    assert.match(card[0], /data-i18n="roundOpen"/, id + " can show an unfinished round");
  });
  assert.equal((html.match(/class="table-card" data-game=/g) || []).length, Object.keys(Pit.TABLES).length);
});

test("the cloth picker offers exactly the pit's cloths", function () {
  var themes = Array.from(html.matchAll(/data-set-theme="([^"]+)"/g), function (match) { return match[1]; });
  assert.deepEqual(themes, Pit.THEMES);
  var css = read("shared/css/pit.css");
  Pit.THEMES.filter(function (theme) { return theme !== Pit.DEFAULT_THEME; }).forEach(function (theme) {
    assert.match(css, new RegExp('body\\[data-theme="' + theme + '"\\]'), theme);
  });
});

test("the page is well formed: unique ids, typed buttons, labelled controls", function () {
  var ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), function (match) { return match[1]; });
  assert.equal(new Set(ids).size, ids.length, "duplicate ids");
  (html.match(/<button\b[^>]*>/g) || []).forEach(function (button) {
    assert.match(button, /\btype="button"/, button);
  });
  Array.from(html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g), function (match) { return match[1]; }).forEach(function (target) {
    assert.ok(ids.indexOf(target) !== -1, "missing label target: " + target);
  });
  var code = read("lobby/js/lobby.js");
  Array.from(code.matchAll(/\$\("(\w+)"\)/g), function (match) { return match[1]; }).forEach(function (id) {
    assert.ok(ids.indexOf(id) !== -1, "lobby.js asks for a missing #" + id);
  });
  assert.match(html, /class="modal-card" role="dialog" aria-modal="true" aria-labelledby="settingsTitle"/);
  var viewport = html.match(/<meta name="viewport" content="([^"]+)"/)[1];
  assert.doesNotMatch(viewport, /user-scalable\s*=\s*no|maximum-scale/);
  assert.match(read("lobby/css/styles.css"), /@media \(prefers-reduced-motion: reduce\)/);
});

test("play money joins the wallet only through the shared account lock", function () {
  var code = read("lobby/js/lobby.js");
  assert.match(code, /Pit\.createAccount\(/);
  assert.match(code, /return account\.run\(function \(\) \{\s*var bankroll = readBankroll\(\);/);
  assert.match(code, /Math\.min\(Pit\.MAX_BANKROLL, bankroll \+ amount\)/);
  assert.match(code, /Number\.isSafeInteger\(amount\) && amount > 0/);
  assert.doesNotMatch(code, /localStorage\.setItem\(/, "the wallet is written through the account only");
});
