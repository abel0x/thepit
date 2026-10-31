/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var Chips = require("../../shared/js/chips.js");
var Pit = require("../../shared/js/pit.js");

test("a stack breaks into real chips, largest first, adding up exactly", function () {
  [1, 4, 5, 25, 130, 999, 12345, 2500000].forEach(function (amount) {
    var chips = Chips.breakdown(amount);
    assert.equal(chips.reduce(function (a, b) { return a + b; }, 0), amount, String(amount));
    for (var i = 1; i < chips.length; i++) assert.ok(chips[i] <= chips[i - 1]);
  });
  assert.deepEqual(Chips.breakdown(130), [100, 25, 5]);
  assert.deepEqual(Chips.breakdown(185), [100, 50, 25, 10]);
  assert.deepEqual(Chips.breakdown(150000), [100000, 25000, 25000]);
  assert.deepEqual(Chips.breakdown(0), []);
  assert.deepEqual(Chips.breakdown(-5), []);
  assert.equal(Chips.topDenomination(130), 100);
  assert.equal(Chips.topDenomination(0), 1);
});

test("chip labels stay short enough for the face", function () {
  var cases = { 5: "5", 25: "25", 125: "125", 999: "999", 1000: "1K", 1250: "1.25K", 2500: "2.5K", 12000: "12K",
    12500: "12.5K", 125000: "125K", 1000000: "1M", 1250000: "1.25M", 2000000000: "2B" };
  Object.keys(cases).forEach(function (amount) {
    assert.equal(Chips.label(Number(amount)), cases[amount], amount);
    assert.ok(Chips.label(Number(amount)).length <= 5, amount);
  });
});

test("the pit has one colour per chip, and no two chips share it", function () {
  var keys = Chips.DENOMS.concat(["allin"]);
  assert.deepEqual(Object.keys(Chips.COLORS).sort(), keys.map(String).sort());
  keys.forEach(function (value) {
    var color = Chips.COLORS[value];
    ["body", "spot", "ring", "inlay", "ink", "edge", "edgeDark"].forEach(function (part) {
      assert.match(color[part], /^#[0-9a-f]{6}$/, value + " " + part);
    });
    if (color.spotAlt) assert.match(color.spotAlt, /^#[0-9a-f]{6}$/, value + " spotAlt");
  });
  var bodies = keys.map(function (value) { return Chips.COLORS[value].body; });
  var names = keys.map(function (value) { return Chips.COLORS[value].name; });
  assert.equal(new Set(bodies).size, keys.length, "every chip has its own clay");
  assert.equal(new Set(names).size, keys.length, "every chip has its own colour name");
  // The classic casino colours of the common chips.
  assert.equal(Chips.COLORS[1].name, "white");
  assert.equal(Chips.COLORS[5].name, "red");
  assert.equal(Chips.COLORS[25].name, "green");
  assert.equal(Chips.COLORS[100].name, "black");
  assert.equal(Chips.COLORS[500].name, "purple");
});

test("no table or stylesheet paints a chip with colours of its own", function () {
  var root = path.join(__dirname, "../..");
  var files = [];
  (function walk(dir) {
    fs.readdirSync(path.join(root, dir), { withFileTypes: true }).forEach(function (entry) {
      var file = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(css|js|html)$/.test(entry.name)) files.push(file);
    });
  })("games");
  ["shared/css", "lobby"].forEach(function (dir) {
    fs.readdirSync(path.join(root, dir)).forEach(function (name) { if (/\.css$/.test(name)) files.push(dir + "/" + name); });
  });
  files.forEach(function (file) {
    var text = fs.readFileSync(path.join(root, file), "utf8");
    assert.doesNotMatch(text, /\.chip-(?:\d+k?|allin)\s*\{[^}]*--body/, file + " colours a chip in CSS");
    assert.doesNotMatch(text, /CHIP_COLORS/, file + " keeps a palette of its own");
  });
});

test("every table offers its own tray of the pit's chips, smallest first", function () {
  Object.keys(Pit.TABLES).forEach(function (id) {
    var html = fs.readFileSync(path.join(__dirname, "../../games/" + id + "/index.html"), "utf8");
    var game = fs.readFileSync(path.join(__dirname, "../../games/" + id + "/js/game.js"), "utf8");
    assert.match(html, /shared\/js\/chips\.js/, id + " loads the pit's chips");
    assert.match(game, /Chips\.decorateTray\(/, id + " paints its tray from the palette");
    var tray = (html.match(/class="chip chip-\w+"\s+data-value="(\d+)"/g) || []).map(function (m) { return Number(m.match(/data-value="(\d+)"/)[1]); });
    assert.ok(tray.length >= 5, id);
    tray.forEach(function (value, index) {
      assert.ok(Chips.COLORS[value], id + " offers a chip the pit has no colour for: " + value);
      if (index) assert.ok(value > tray[index - 1], id + " tray order");
    });
  });
});

test("a tray reads its values from the page and skips All-in", function () {
  var chips = [5, 25, "allin"].map(function (value) {
    return { getAttribute: function () { return String(value); } };
  });
  var tray = { querySelectorAll: function () { return chips; } };
  assert.deepEqual(Chips.trayValues(tray), [5, 25]);
});
