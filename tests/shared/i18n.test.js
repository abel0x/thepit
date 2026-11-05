/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");
var loadI18n = require("../helpers/i18n.js").loadI18n;

var root = path.resolve(__dirname, "../..");
var engine = fs.readFileSync(path.join(root, "shared/js/i18n.js"), "utf8");
var PAGES = { lobby: "lobby/js/strings.js", blackjack: "games/blackjack/js/strings.js", roulette: "games/roulette/js/strings.js" };

// The engine alone, before any page has added its words.
function bare(saved) {
  var storage = { "pit.lang": saved };
  var sandbox = {
    localStorage: { getItem: function (key) { return storage[key] == null ? null : storage[key]; }, setItem: function (key, value) { storage[key] = value; } },
    document: { querySelectorAll: function () { return []; }, documentElement: { setAttribute: function () {} } }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(engine, sandbox);
  return sandbox.I18n;
}

function placeholders(text) {
  return [].concat(text).join(" ").match(/\{\w+\}/g) || [];
}

test("the shared words exist in English and Turkish with the same placeholders", function () {
  var I18n = bare();
  var dict = I18n._dict;
  assert.deepEqual(Array.from(I18n.available), ["en", "tr"]);
  assert.deepEqual(Object.keys(dict.tr), Object.keys(dict.en));
  assert.deepEqual(Array.from(I18n.sharedKeys), Object.keys(dict.en));
  assert.ok(I18n.sharedKeys.length >= 40);
  I18n.sharedKeys.forEach(function (key) {
    assert.equal(typeof dict.tr[key], "string", key);
    assert.ok(dict.tr[key].trim().length > 0, key);
    assert.deepEqual(placeholders(dict.tr[key]).sort(), placeholders(dict.en[key]).sort(), key);
  });
});

test("every page adds its own words without touching a shared one", function () {
  Object.keys(PAGES).forEach(function (page) {
    var I18n = loadI18n(PAGES[page]).I18n;
    var shared = bare()._dict;
    I18n.sharedKeys.forEach(function (key) {
      assert.equal(I18n._dict.en[key], shared.en[key], page + " changed " + key);
      assert.equal(I18n._dict.tr[key], shared.tr[key], page + " changed " + key);
    });
    assert.deepEqual(Object.keys(I18n._dict.tr).sort(), Object.keys(I18n._dict.en).sort(), page);
    // A page's own file never even mentions a shared word as a key.
    var own = fs.readFileSync(path.join(root, PAGES[page]), "utf8");
    I18n.sharedKeys.forEach(function (key) {
      assert.doesNotMatch(own, new RegExp("^\\s+" + key + ":", "m"), page + " redefines " + key);
    });
  });
});

test("define refuses to redefine a word, and adds nothing when it refuses", function () {
  var I18n = bare();
  assert.throws(function () { I18n.define({ en: { balance: "Cash" }, tr: { balance: "Nakit" } }); }, /cannot redefine "balance"/);
  assert.throws(function () { I18n.define({ en: { fresh: "New", close: "Shut" }, tr: { fresh: "Yeni", close: "Kapa" } }); }, /cannot redefine "close"/);
  assert.equal(I18n.t("fresh"), "fresh", "a refused definition leaves no half-added words");
  assert.equal(I18n.t("close"), "Close");
  I18n.define({ en: { fresh: "New" }, tr: { fresh: "Yeni" } });
  assert.equal(I18n.t("fresh"), "New");
  assert.throws(function () { I18n.define({ en: { fresh: "Again" }, tr: { fresh: "Yine" } }); }, /cannot redefine "fresh"/);
  assert.throws(function () { I18n.define({ en: { other: "Other" } }); }, /needs every language: tr/);
});

test("lookups never reach inherited names and fall back to the key", function () {
  var I18n = bare();
  ["constructor", "toString", "__proto__", "hasOwnProperty"].forEach(function (key) {
    assert.equal(I18n.t(key), key);
  });
  assert.equal(I18n.t("noSuchWord"), "noSuchWord");
  assert.equal(I18n.t("deposited", { amount: "$5" }), "Added $5 to your balance");
  assert.equal(I18n.t("roundElsewhere", {}), "Finish the round still open at {table} first.", "a missing value keeps its placeholder");
  I18n.define({ en: { lines: ["first {n}", "second {n}"] }, tr: { lines: ["birinci {n}", "ikinci {n}"] } });
  assert.equal(I18n.t("lines", { n: 1 }), "first 1");
  assert.match(I18n.pick("lines", { n: 2 }), /^(?:first|second) 2$/);
  assert.equal(I18n.pick("balance"), "Balance");
});

test("the saved language is shared by every page and only known languages are kept", function () {
  assert.equal(bare(null).get(), "en");
  assert.equal(bare("tr").get(), "tr");
  ["de", "__proto__", "constructor", ""].forEach(function (saved) {
    assert.equal(bare(saved).get(), "en", JSON.stringify(saved));
  });
  var loaded = loadI18n(PAGES.lobby, null);
  loaded.I18n.setLanguage("tr");
  assert.equal(loaded.storage["pit.lang"], "tr");
  assert.equal(loaded.I18n.locale(), "tr-TR");
  assert.equal(loaded.I18n.t("balance"), "Bakiye");
  loaded.I18n.setLanguage("toString");
  assert.equal(loaded.I18n.get(), "en");
});

test("apply fills text and every translated attribute", function () {
  var nodes = {
    "[data-i18n]": { attr: "data-i18n", key: "settings" },
    "[data-i18n-title]": { attr: "data-i18n-title", key: "close" },
    "[data-i18n-aria-label]": { attr: "data-i18n-aria-label", key: "languageSelector" },
    "[data-i18n-aria-roledescription]": { attr: "data-i18n-aria-roledescription", key: "controlsLabel" },
    "[data-i18n-placeholder]": { attr: "data-i18n-placeholder", key: "amount" },
    "[data-i18n-content]": { attr: "data-i18n-content", key: "appDescription" }
  };
  Object.keys(nodes).forEach(function (selector) {
    var node = nodes[selector];
    node.attributes = {};
    node.getAttribute = function (name) { return name === node.attr ? node.key : null; };
    node.setAttribute = function (name, value) { node.attributes[name] = value; };
  });
  var lang = null;
  var sandbox = {
    localStorage: { getItem: function () { return "tr"; }, setItem: function () {} },
    document: {
      querySelectorAll: function (selector) { return nodes[selector] ? [nodes[selector]] : []; },
      documentElement: { setAttribute: function (name, value) { lang = value; } },
      title: ""
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(engine + "\n" + fs.readFileSync(path.join(root, PAGES.lobby), "utf8"), sandbox);
  sandbox.I18n.apply(sandbox.document);
  assert.equal(nodes["[data-i18n]"].textContent, "Ayarlar");
  assert.equal(nodes["[data-i18n-title]"].attributes.title, "Kapat");
  assert.equal(nodes["[data-i18n-aria-label]"].attributes["aria-label"], "Dil seçimi");
  assert.equal(nodes["[data-i18n-aria-roledescription]"].attributes["aria-roledescription"], "Oyun kontrolleri");
  assert.equal(nodes["[data-i18n-placeholder]"].attributes.placeholder, "Tutar");
  assert.match(nodes["[data-i18n-content]"].attributes.content, /çevrimdışı/);
  assert.equal(lang, "tr");
  assert.equal(sandbox.document.title, "ThePit");
});

test("a share is written the way each language writes it: the sign goes first in Turkish", function () {
  var en = bare("en"), tr = bare("tr");
  assert.equal(en.percent(0.9711, 2), "97.11%");
  assert.equal(tr.percent(0.9711, 2), "%97,11");
  assert.equal(en.percent(0.444, 1), "44.4%");
  assert.equal(tr.percent(0.444, 1), "%44,4");
  assert.equal(en.percent(0.5), "50%");
  assert.equal(tr.percent(0.5), "%50");
  assert.equal(tr.percent(0), "%0");
  assert.equal(tr.percent(2 / 3), "%67", "no decimals unless asked");
  assert.equal(tr.percent(0.9954, 2), "%99,54");
});

// Every share a page prints goes through I18n.percent, so none can put the
// sign after the number in Turkish. A "%" joined to a number in a script is
// only a CSS length (a fill, a position, a width).
test("no page writes a share by appending a percent sign", function () {
  var scripts = [];
  fs.readdirSync(path.join(root, "games")).forEach(function (game) {
    var file = path.join(root, "games", game, "js", "game.js");
    if (fs.existsSync(file)) scripts.push(file);
  });
  scripts.push(path.join(root, "lobby/js/lobby.js"));
  scripts.forEach(function (file) {
    fs.readFileSync(file, "utf8").split("\n").forEach(function (line, index) {
      if (!/\+ ?["']%|["']%["']/.test(line)) return;
      assert.match(line, /style\.(left|top|width|height)\s*=|setProperty\("--fill"|gradient\(/, path.relative(root, file) + ":" + (index + 1) + " " + line.trim());
    });
  });
});
