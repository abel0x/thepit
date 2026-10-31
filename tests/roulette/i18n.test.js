/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

var root = path.resolve(__dirname, "../../games/roulette");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };

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
  vm.runInNewContext(read("js/i18n.js"), sandbox);
  return { I18n: sandbox.I18n, storage: storage };
}

var I18n = loadI18n(null).I18n;
var DICT = I18n._dict;

function placeholders(text) {
  return (Array.isArray(text) ? text.join(" ") : text).match(/\{\w+\}/g) || [];
}

test("English and Turkish define the same keys with the same placeholders", function () {
  assert.deepEqual(Object.keys(DICT).sort(), ["en", "tr"]);
  assert.deepEqual(Object.keys(DICT.tr).sort(), Object.keys(DICT.en).sort());
  Object.keys(DICT.en).forEach(function (key) {
    assert.equal(Array.isArray(DICT.en[key]), Array.isArray(DICT.tr[key]), key);
    assert.deepEqual(placeholders(DICT.tr[key]).sort(), placeholders(DICT.en[key]).sort(), key);
    assert.ok(String(DICT.tr[key]).trim().length > 0, key);
  });
});

test("every key the page and the game ask for exists", function () {
  var html = read("index.html");
  var used = [];
  var pattern = /data-i18n(?:-[a-z-]+)?="(\w+)"/g;
  var match;
  while ((match = pattern.exec(html))) used.push(match[1]);
  var code = read("js/game.js");
  var call = /\b(?:t|I18n\.t|I18n\.pick|setBanner)\("(\w+)"\s*[,)]/g;
  while ((match = call.exec(code))) used.push(match[1]);
  var keyed = /\bt\((\w+)\)/g;
  while ((match = keyed.exec(code))) {
    if (["key", "name", "section"].indexOf(match[1]) === -1) used.push(match[1]);
  }
  ["voisins", "tiers", "orphelins", "zero", "feltLow", "feltEven", "feltOdd", "feltHigh", "feltDozen1", "feltDozen2",
    "feltDozen3", "feltColumn", "betNameRed", "betNameBlack", "betNameOdd", "betNameEven", "betNameLow", "betNameHigh"].forEach(function (key) {
    used.push(key);
  });
  used.forEach(function (key) {
    assert.ok(Object.prototype.hasOwnProperty.call(DICT.en, key), "missing key: " + key);
  });
  assert.ok(used.length > 120);
});

test("English is the default and a saved choice is remembered", function () {
  assert.equal(loadI18n(null).I18n.get(), "en");
  assert.equal(loadI18n("tr").I18n.get(), "tr");
  assert.equal(loadI18n("de").I18n.get(), "en");
  var loaded = loadI18n(null);
  loaded.I18n.setLanguage("tr");
  assert.equal(loaded.storage["pit.lang"], "tr");
  assert.equal(loaded.I18n.locale(), "tr-TR");
  assert.equal(loaded.I18n.t("winLine", { amount: "$5" }), "$5 kazandınız");
  assert.equal(loaded.I18n.t("noSuchKey"), "noSuchKey");
});

test("Turkish odds read the Turkish way round", function () {
  assert.equal(DICT.tr.payoutPays, "1'e {profit} öder");
  assert.equal(DICT.tr.feltColumn, "1'E 2");
  assert.match(DICT.tr.profileEuropeanSummary, /%2,70/);
  assert.match(DICT.tr.profileFrenchSummary, /%1,35/);
});

test("the play-money disclaimer is present in both languages", function () {
  ["en", "tr"].forEach(function (lang) {
    assert.match(DICT[lang].disclaimerPlayMoney, /Table 37/);
    assert.ok(DICT[lang].disclaimerOdds.length > 60);
    assert.ok(DICT[lang].disclaimerWarranty.length > 40);
  });
  assert.equal(DICT.en.appTitle, "Table 37 · ThePit");
  assert.equal(DICT.tr.appTitle, "Table 37 · ThePit");
});
