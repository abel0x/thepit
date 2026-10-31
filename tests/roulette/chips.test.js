/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var Chips = require("../../games/roulette/js/chips.js");

test("a stack breaks into real chips, largest first, adding up exactly", function () {
  [1, 4, 5, 25, 130, 999, 12345, 2500000].forEach(function (amount) {
    var chips = Chips.breakdown(amount);
    assert.equal(chips.reduce(function (a, b) { return a + b; }, 0), amount, String(amount));
    for (var i = 1; i < chips.length; i++) assert.ok(chips[i] <= chips[i - 1]);
  });
  assert.deepEqual(Chips.breakdown(130), [100, 25, 5]);
  assert.deepEqual(Chips.breakdown(0), []);
  assert.deepEqual(Chips.breakdown(-5), []);
  assert.equal(Chips.topDenomination(130), 100);
  assert.equal(Chips.topDenomination(0), 5);
});

test("chip labels stay short enough for the face", function () {
  var cases = { 5: "5", 25: "25", 125: "125", 999: "999", 1000: "1K", 1250: "1.25K", 2500: "2.5K", 12000: "12K",
    12500: "12.5K", 125000: "125K", 1000000: "1M", 1250000: "1.25M", 2000000000: "2B" };
  Object.keys(cases).forEach(function (amount) {
    assert.equal(Chips.label(Number(amount)), cases[amount], amount);
    assert.ok(Chips.label(Number(amount)).length <= 5, amount);
  });
});

test("every possible chip colour is defined", function () {
  Chips.DENOMS.forEach(function (value) {
    var color = Chips.COLORS[value];
    ["body", "spot", "ring", "inlay", "ink", "edge"].forEach(function (part) {
      assert.match(color[part], /^#[0-9a-f]{6}$/, value + " " + part);
    });
  });
  Chips.TRAY.forEach(function (value) { assert.ok(Chips.DENOMS.indexOf(value) !== -1); });
});

test("the tray chips in the stylesheet match the stack colours", function () {
  var css = fs.readFileSync(path.join(__dirname, "../../games/roulette/css/styles.css"), "utf8");
  var names = { 5: "5", 25: "25", 100: "100", 500: "500", 1000: "1k", 5000: "5k" };
  Chips.TRAY.forEach(function (value) {
    var rule = css.match(new RegExp("\\.chip-" + names[value] + "\\s*\\{([^}]*)\\}"));
    assert.ok(rule, "rule for " + value);
    var color = Chips.COLORS[value];
    assert.match(rule[1], new RegExp("--body:\\s*" + color.body), value + " body");
    assert.match(rule[1], new RegExp("--spot:\\s*" + color.spot), value + " spot");
    assert.match(rule[1], new RegExp("--inlay:\\s*" + color.inlay), value + " inlay");
    assert.match(rule[1], new RegExp("--ringline:\\s*" + color.ring), value + " ring");
    assert.match(rule[1], new RegExp("--ink:\\s*" + color.ink), value + " ink");
  });
  var html = fs.readFileSync(path.join(__dirname, "../../games/roulette/index.html"), "utf8");
  var tray = (html.match(/data-value="(\d+)"/g) || []).map(function (m) { return Number(m.match(/\d+/)[0]); });
  assert.deepEqual(tray, Chips.TRAY);
});
