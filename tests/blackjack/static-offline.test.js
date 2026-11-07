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

test("every runtime asset is local and present", function () {
  // A canonical link names the page's published address; it never loads anything.
  var html = read("index.html").replace(/<link rel="canonical"[^>]*>/g, "");
  var refs = [];
  var pattern = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/g;
  var match;
  while ((match = pattern.exec(html))) refs.push(match[1]);

  refs.forEach(function (ref) {
    assert.doesNotMatch(ref, /^(?:https?:)?\/\//, "external runtime reference: " + ref);
    assert.ok(fs.existsSync(path.join(root, ref)), "missing runtime asset: " + ref);
  });
});

test("the pit's service worker precaches everything the table loads", function () {
  var html = read("index.html").replace(/<link rel="canonical"[^>]*>/g, "");
  var worker = read("../../sw.js");
  var refs = ["index.html"];
  var pattern = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"'#]+)["']/g;
  var match;
  while ((match = pattern.exec(html))) refs.push(match[1]);

  refs.forEach(function (ref) {
    var cached = "./" + path.posix.normalize("games/blackjack/" + ref);
    assert.ok(worker.indexOf('"' + cached + '"') !== -1, "not precached: " + cached);
  });
});

test("runtime files contain no remote fetch, script, stylesheet, or image URL", function () {
  ["index.html", "css/styles.css", "js/strings.js", "js/engine.js", "js/rules.js", "js/chip-stack.js", "js/game.js"].forEach(function (file) {
    // A plain <a href> only navigates when followed and the canonical link only
    // names the published page: neither loads anything.
    var source = read(file).replace(/<a\b[^>]*>/gi, "").replace(/<link rel="canonical"[^>]*>/gi, "");
    assert.doesNotMatch(source, /(?:src|href)\s*=\s*["']https?:\/\//i, file);
    assert.doesNotMatch(source, /url\(\s*["']?https?:\/\//i, file);
    assert.doesNotMatch(source, /fetch\(\s*["']https?:\/\//i, file);
  });
});

test("links lead back to the lobby or out to the source code only", function () {
  var links = read("index.html").match(/<a\b[^>]*>/gi) || [];
  assert.equal(links.length, 2);
  assert.match(links[0], /class="icon-btn lobby-link" href="\.\.\/\.\.\/index\.html"/);
  assert.doesNotMatch(links[0], /target=/, "the lobby opens in the same tab");
  assert.match(links[1], /href="https:\/\/github\.com\/abel0x\/thepit"/);
  assert.match(links[1], /target="_blank"/);
  assert.match(links[1], /rel="noopener"/);
});

test("the settings dialog carries the disclaimer, version and license", function () {
  var html = read("index.html");
  var about = html.match(/<section class="about"[\s\S]*?<\/section>/);
  assert.ok(about, "about section");
  ["disclaimerTitle", "disclaimerPlayMoney", "disclaimerOdds", "disclaimerWarranty", "licenseNotice", "sourceCode"].forEach(function (key) {
    assert.match(about[0], new RegExp('data-i18n="' + key + '"'), key);
  });
  var version = JSON.parse(read("../../package.json")).version;
  assert.match(about[0], new RegExp("</span> " + version.replace(/\./g, "\\.") + "</span>"), "version matches package.json");
  assert.match(read("js/game.js"), /'a\[href\], button:not\(\[disabled\]\)/, "the dialog focus trap includes links");
});

test("all DOM ids requested by game.js exist in index.html", function () {
  var html = read("index.html");
  var game = read("js/game.js");
  var ids = new Set();
  var pattern = /\$\("([A-Za-z][\w-]*)"\)/g;
  var match;
  while ((match = pattern.exec(game))) ids.add(match[1]);

  ids.forEach(function (id) {
    assert.match(html, new RegExp('\\bid=["\']' + id + '["\']'), "missing id: " + id);
  });
});

test("every literal translation key resolves in English and Turkish", function () {
  var source = require("../helpers/i18n.js").i18nSource("games/blackjack/js/strings.js");
  var storage = {};
  var context = {
    document: {
      querySelectorAll: function () { return []; },
      documentElement: { setAttribute: function () {} },
      title: ""
    },
    localStorage: {
      getItem: function (key) { return storage[key] || null; },
      setItem: function (key, value) { storage[key] = String(value); }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context);

  assert.deepEqual(
    Object.keys(context.I18n._dict.en).sort(),
    Object.keys(context.I18n._dict.tr).sort(),
    "English and Turkish dictionaries must have identical keys"
  );
  assert.equal(context.I18n._dict.tr.youLose, "KAYBETTİNİZ");
  assert.equal(context.I18n._dict.tr.bustShort, "21'İ GEÇTİNİZ");
  assert.equal(context.I18n._dict.tr.placeBetPrompt, "Bahsinizi yapın");
  assert.equal(context.I18n._dict.tr.insuranceTitle, "Sigorta ister misiniz?");
  assert.equal(context.I18n._dict.tr.tableTheme, "Masa ve kart arkası");
  assert.equal(context.I18n._dict.tr.muteSound, "Sesi kapat");
  assert.equal(context.I18n._dict.tr.unmuteSound, "Sesi aç");
  assert.doesNotMatch(
    JSON.stringify(context.I18n._dict),
    /—|–/,
    "User-facing copy should use natural sentence punctuation instead of long dashes"
  );
  assert.doesNotMatch(
    JSON.stringify(context.I18n._dict.tr),
    /battı|bahs(?:i|inizi) koy|sigorta al\?|özel yüksek limitli/i
  );

  var keys = new Set();
  var combined = read("index.html") + "\n" + read("js/game.js");
  var patterns = [
    /data-i18n(?:-title|-aria-label|-placeholder|-content)?=["']([^"']+)["']/g,
    /\bt\(["']([^"']+)["']/g,
    /I18n\.pick\(["']([^"']+)["']/g
  ];
  patterns.forEach(function (pattern) {
    var match;
    while ((match = pattern.exec(combined))) keys.add(match[1]);
  });

  ["en", "tr"].forEach(function (language) {
    context.I18n.setLanguage(language);
    keys.forEach(function (key) {
      assert.notEqual(context.I18n.t(key), key, language + " is missing: " + key);
    });
  });
});

test("every cloth of the pit has a table and a card back, drawn without assets", function () {
  var html = read("index.html");
  var css = read("css/styles.css");
  var game = read("js/game.js");
  var Pit = require("../../shared/js/pit.js");
  var themes = Array.from(html.matchAll(/data-set-theme=["']([^"']+)["']/g), function (match) {
    return match[1];
  });

  assert.deepEqual(themes, Pit.THEMES);
  assert.match(game, /ALLOWED_THEMES\s*=\s*Pit\.THEMES;/);
  Pit.THEMES.filter(function (theme) { return theme !== Pit.DEFAULT_THEME; }).forEach(function (theme) {
    assert.match(css, new RegExp('body\\[data-theme="' + theme + '"\\]'), theme);
    assert.match(css, new RegExp('\\.theme-option\\[data-set-theme="' + theme + '"\\]'), theme + " preview");
  });
});

test("the physical table uses a live shoe, cut card, discard tray, and payout pile", function () {
  var html = read("index.html");
  var css = read("css/styles.css");
  var game = read("js/game.js");

  ["shoeCards", "shoeCount", "discardTray", "discardStack", "discardCount", "payoutStack", "tableProfile", "tableDecks", "tableDealerRule"].forEach(function (id) {
    assert.match(html, new RegExp("\\bid=[\"']" + id + "[\"']"), "missing physical table element: " + id);
  });
  assert.match(html, /class="cut-card"/);
  assert.match(css, /\.discard-tray/);
  assert.match(css, /\.bet-stack\.payout-stack\.arriving/);
  assert.match(game, /prepareCardForDiscard/);
  assert.match(game, /state\.discardTrayCount = state\.discarded/);
  assert.match(game, /renderPayoutStack\(sidePaymentAmount\)/);
  assert.match(game, /state\.pendingPayoutVisual = false;\s*renderBankroll\(\)/);
});

test("every player hand owns a physical wager and settlement stack", function () {
  var game = read("js/game.js");
  var css = read("css/styles.css");

  assert.match(game, /className = "hand-wager"/);
  assert.match(game, /"bet-stack hand-bet-stack"/);
  assert.match(game, /"bet-stack payout-stack hand-payout-stack"/);
  assert.match(game, /prepareHandSettlements/);
  assert.match(game, /moveHandSettlements/);
  assert.match(css, /\.hand-wager/);
  assert.match(css, /@keyframes wagerSplitRight/);
  assert.match(css, /@keyframes wagerDouble/);
});

test("settings expose three local rule profiles", function () {
  var html = read("index.html");
  var game = read("js/game.js");
  var rules = read("js/rules.js");
  var profiles = Array.from(html.matchAll(/data-rule-profile=["']([^"']+)["']/g), function (match) {
    return match[1];
  }).sort();

  assert.deepEqual(profiles, ["atlanticCity", "european", "lasVegas"]);
  assert.match(rules, /dealerHoleCard: false/);
  assert.match(rules, /doubleRule: "hard9to11"/);
  assert.match(game, /Rules\.canDouble/);
  assert.match(game, /state\.settings\.dealerHoleCard/);
  assert.match(game, /state\.settings\.maxHands/);
});

test("settings expose three animation speeds and four independent sound levels", function () {
  var html = read("index.html");
  var css = read("css/styles.css");
  var game = read("js/game.js");
  var speeds = Array.from(html.matchAll(/data-set-animation=["']([^"']+)["']/g), function (match) {
    return match[1];
  }).sort();
  var soundLevels = Array.from(html.matchAll(/data-sound-level=["']([^"']+)["']/g), function (match) {
    return match[1];
  }).sort();

  assert.deepEqual(speeds, ["cinematic", "fast", "normal"]);
  assert.deepEqual(soundLevels, ["cards", "chips", "master", "table"]);
  assert.match(game, /ANIMATION_SCALES\s*=\s*\{ fast: 0\.65, normal: 1, cinematic: 1\.35 \}/);
  assert.match(css, /body\[data-animation-speed="fast"\]/);
  assert.match(css, /body\[data-animation-speed="cinematic"\]/);
});

test("the top bar uses the Table 21 lockup and a local stateful sound icon", function () {
  var html = read("index.html");

  assert.match(html, /class="brand-word">TABLE<\/span><span class="brand-number"[^>]*>21<\/span>/);
  assert.match(html, /class="sound-glyph"[\s\S]*class="sound-slash"/);
  assert.doesNotMatch(html, /🔊|🔇|Private High-Limit Table|VIP Blackjack/);
  assert.match(read("../../shared/css/table.css"), /#soundToggle\[aria-pressed="false"\] \.sound-slash/);
});
