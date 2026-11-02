/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Tally = require("../../shared/js/tally.js");
var SicBo = require("../../games/sicbo/js/engine.js");
var BigSix = require("../../games/bigsix/js/engine.js");

test("rounds since a result count back from the latest, and none is null", function () {
  var list = [3, 5, 3, 7, 5];
  assert.equal(Tally.since(list, function (n) { return n === 5; }), 0);
  assert.equal(Tally.since(list, function (n) { return n === 7; }), 1);
  assert.equal(Tally.since(list, function (n) { return n === 3; }), 2);
  assert.equal(Tally.since(list, function (n) { return n === 9; }), null);
  assert.equal(Tally.since([], function () { return true; }), null);
  assert.equal(Tally.count(list, function (n) { return n === 3; }), 2);
});

test("rows give the count, the share, the exact chance and the rounds since", function () {
  var rows = Tally.rows([1, 2, 2, 4], [
    { key: "two", chance: 0.25, test: function (n) { return n === 2; } },
    { key: "nine", chance: 0.1, test: function (n) { return n === 9; } }
  ]);
  assert.deepEqual(rows, [
    { key: "two", count: 2, share: 0.5, chance: 0.25, since: 1 },
    { key: "nine", count: 0, share: 0, chance: 0.1, since: null }
  ]);
  assert.equal(Tally.rows([], [{ key: "x", chance: 1, test: function () { return true; } }])[0].share, 0);
});

test("Sic Bo charts every total, face and group with its exact chance", function () {
  var specs = SicBo.statSpecs();
  assert.deepEqual(specs.totals.map(function (s) { return s.key; }), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  assert.deepEqual(specs.totals.map(function (s) { return Math.round(s.chance * 216); }), [1, 3, 6, 10, 15, 21, 25, 27, 27, 25, 21, 15, 10, 6, 3, 1]);
  var sum = specs.totals.reduce(function (total, s) { return total + s.chance; }, 0);
  assert.ok(Math.abs(sum - 1) < 1e-12);
  specs.faces.forEach(function (s) { assert.equal(Math.round(s.chance * 216), 91, "a face shows on 91 of 216 rolls"); });
  assert.deepEqual(specs.groups.map(function (s) { return [s.key, Math.round(s.chance * 216)]; }),
    [["small", 105], ["big", 105], ["odd", 105], ["even", 105], ["triple", 6]]);
  var rows = Tally.rows([[1, 1, 1], [2, 3, 4], [6, 5, 4]], specs.groups);
  assert.deepEqual(rows.map(function (r) { return [r.key, r.count, r.since]; }),
    [["small", 1, 1], ["big", 1, 0], ["odd", 2, 0], ["even", 0, null], ["triple", 1, 2]], "9 and 15 are both odd");
});

test("Wheel 54 charts every symbol by the segments that show it", function () {
  var specs = BigSix.statSpecs();
  assert.deepEqual(specs.map(function (s) { return s.key; }), BigSix.BETS);
  assert.deepEqual(specs.map(function (s) { return Math.round(s.chance * 54); }), BigSix.BETS.map(BigSix.countOf));
  var joker = BigSix.SEGMENTS.indexOf("joker");
  var one = BigSix.SEGMENTS.indexOf("one");
  var rows = Tally.rows([joker, one, one], specs);
  assert.deepEqual(rows.filter(function (r) { return r.count; }).map(function (r) { return [r.key, r.count, r.since]; }), [["one", 2, 0], ["joker", 1, 2]]);
});
