/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var root = path.resolve(__dirname, "../../games/roulette");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };
var RUNTIME = ["index.html", "css/styles.css", "js/i18n.js", "js/sound.js", "js/engine.js", "js/layout.js", "js/spin.js",
  "js/chips.js", "js/store.js", "js/wheel.js", "js/game.js"];

function pageRefs() {
  var html = read("index.html");
  var refs = [];
  var pattern = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"'#]+)["']/g;
  var match;
  while ((match = pattern.exec(html))) refs.push(match[1]);
  return refs;
}

test("every runtime asset is local and present", function () {
  pageRefs().forEach(function (ref) {
    assert.doesNotMatch(ref, /^(?:https?:)?\/\//, "external runtime reference: " + ref);
    assert.ok(fs.existsSync(path.join(root, ref)), "missing runtime asset: " + ref);
  });
  var css = read("css/styles.css");
  (css.match(/url\("?([^")]+)"?\)/g) || []).forEach(function (u) {
    var ref = u.replace(/^url\("?|"?\)$/g, "");
    if (/^data:/.test(ref) || ref.charAt(0) === "#") return;
    assert.ok(fs.existsSync(path.join(root, "css", ref)), "missing stylesheet asset: " + ref);
  });
});

test("scripts load after the modules they depend on", function () {
  var order = pageRefs().filter(function (ref) { return /\.js$/.test(ref); });
  assert.deepEqual(order, ["../../shared/js/pit.js", "js/i18n.js", "js/sound.js", "js/engine.js", "js/layout.js", "js/spin.js",
    "js/chips.js", "js/store.js", "js/wheel.js", "js/game.js", "../../shared/js/pwa.js"]);
});

test("the pit's service worker precaches everything the table loads", function () {
  var worker = read("../../sw.js");
  var precached = (worker.match(/"\.\/[^"]*"/g) || []).map(function (s) { return s.slice(3, -1); });
  pageRefs().concat(["index.html"]).forEach(function (ref) {
    var cached = path.posix.normalize("games/roulette/" + ref);
    assert.ok(precached.indexOf(cached) !== -1, "not precached: " + cached);
  });
});

test("every sound sample ships as Ogg and AAC and is precached", function () {
  var sound = read("js/sound.js");
  var worker = read("../../sw.js");
  var samples = sound.match(/assets\/audio\/[\w-]+\.ogg/g) || [];
  assert.ok(samples.length >= 8);
  samples.forEach(function (ogg) {
    var m4a = ogg.replace(/\.ogg$/, ".m4a");
    assert.ok(fs.existsSync(path.join(root, ogg)), ogg);
    assert.ok(fs.existsSync(path.join(root, m4a)), m4a);
    assert.ok(worker.indexOf('"./games/roulette/' + ogg + '"') !== -1, "not precached: " + ogg);
    assert.ok(worker.indexOf('"./games/roulette/' + m4a + '"') !== -1, "not precached: " + m4a);
  });
  var generator = read("../../tools/generate-roulette-audio.sh");
  samples.forEach(function (ogg) {
    assert.ok(generator.indexOf(path.basename(ogg)) !== -1, "the generator rebuilds " + ogg);
  });
});

test("runtime files contain no remote fetch, script, stylesheet, or image URL", function () {
  RUNTIME.forEach(function (file) {
    // A plain <a href> only navigates when followed; it never loads anything.
    var source = read(file).replace(/<a\b[^>]*>/gi, "").replace(/<meta property="og:[^>]*>/gi, "");
    assert.doesNotMatch(source, /(?:src|href)\s*=\s*["']https?:\/\//i, file);
    assert.doesNotMatch(source, /url\(\s*["']?https?:\/\//i, file);
    assert.doesNotMatch(source, /fetch\(\s*["']https?:\/\//i, file);
    assert.doesNotMatch(source, /\b(?:XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/, file);
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

});

test("the tab names Table 37 in the pit and every home screen names ThePit", function () {
  var html = read("index.html");
  assert.match(html, /<title>Table 37 · ThePit<\/title>/);
  assert.match(html, /name="apple-mobile-web-app-title" content="ThePit"/);
  assert.match(html, /name="application-name" content="ThePit"/);
  assert.match(html, /<link rel="manifest" href="\.\.\/\.\.\/manifest\.json" \/>/);
  assert.match(html, /property="og:url" content="https:\/\/abel0x\.github\.io\/thepit\/games\/roulette\/"/);
  assert.ok(fs.existsSync(path.join(root, "icon.svg")), "the table keeps its own tab icon");
});

test("the page keeps zoom available and respects reduced motion", function () {
  var html = read("index.html");
  var viewport = html.match(/<meta name="viewport" content="([^"]+)"/)[1];
  assert.doesNotMatch(viewport, /user-scalable\s*=\s*no|maximum-scale/);
  assert.match(read("css/styles.css"), /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(read("js/game.js"), /prefers-reduced-motion: reduce/);
});

test("ids referenced by the game exist exactly once in the page", function () {
  var html = read("index.html");
  var ids = {};
  (html.match(/\bid="([^"]+)"/g) || []).forEach(function (m) {
    var id = m.slice(4, -1);
    ids[id] = (ids[id] || 0) + 1;
  });
  Object.keys(ids).forEach(function (id) { assert.equal(ids[id], 1, "duplicate id " + id); });
  var code = read("js/game.js");
  var pattern = /\$\("(\w+)"\)/g;
  var match;
  while ((match = pattern.exec(code))) assert.ok(ids[match[1]], "missing #" + match[1]);
});
