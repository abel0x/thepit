/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/bigsix/js/engine.js");

// The wheel as the rules give it: how many segments each symbol has and what
// it pays to one, and the published house edges, in percent.
var WHEEL = { one: [24, 1], two: [15, 2], five: [7, 5], ten: [4, 10], twenty: [2, 20], joker: [1, 40], logo: [1, 40] };
var EDGES = { one: 11.11, two: 16.67, five: 22.22, ten: 18.52, twenty: 22.22, joker: 24.07, logo: 24.07 };

test("fifty-four segments: 24 of $1, 15 of $2, 7 of $5, 4 of $10, 2 of $20, a Joker and a logo", function () {
  assert.equal(Engine.SEGMENTS.length, 54);
  assert.deepEqual(Engine.BETS, Object.keys(WHEEL));
  Engine.BETS.forEach(function (key) {
    assert.equal(Engine.countOf(key), WHEEL[key][0], key);
    assert.equal(Engine.PAYS[key], WHEEL[key][1], key);
  });
  assert.equal(Engine.symbolAt(0), "joker", "the Joker starts under the pointer");
  assert.equal(Engine.symbolAt(27), "logo", "the logo is opposite the Joker");
  // No two neighbours show the same symbol but the $1.
  Engine.SEGMENTS.forEach(function (symbol, index) {
    var next = Engine.SEGMENTS[(index + 1) % 54];
    if (symbol !== "one") assert.notEqual(symbol, next, "segments " + index + " and " + (index + 1));
  });
});

test("every bet on every one of the 54 segments wins exactly when its symbol comes up", function () {
  var checked = 0;
  for (var segment = 0; segment < 54; segment++) {
    var bets = {};
    Engine.BETS.forEach(function (key) { bets[key] = 10; });
    var result = Engine.resolve(bets, segment);
    assert.equal(result.symbol, Engine.SEGMENTS[segment]);
    result.lines.forEach(function (line) {
      var wins = line.key === Engine.SEGMENTS[segment];
      assert.equal(line.result, wins ? "win" : "lose");
      assert.equal(line.returned, wins ? 10 * (WHEEL[line.key][1] + 1) : 0);
      checked++;
    });
    assert.equal(result.stake, 70);
    assert.equal(result.lost, 60);
  }
  assert.equal(checked, 54 * 7);
});

test("the house edge of every bet, counted over the 54 segments, is the published one", function () {
  Engine.BETS.forEach(function (key) {
    var returned = 0;
    for (var segment = 0; segment < 54; segment++) {
      if (Engine.SEGMENTS[segment] === key) returned += WHEEL[key][1] + 1;
    }
    var edge = 1 - returned / 54;
    assert.ok(Math.abs(edge - Engine.houseEdge(key)) < 1e-12, key);
    assert.equal(Number((edge * 100).toFixed(2)), EDGES[key], key);
  });
  // By hand: $1 returns 48 of 54, the Joker 41 of 54.
  assert.equal(Engine.houseEdge("one"), 1 - 48 / 54);
  assert.equal(Engine.houseEdge("joker"), 1 - 41 / 54);
});

test("bets are whole dollars within each table maximum, and no bet wins more than $5,000", function () {
  assert.deepEqual(Engine.normalizeBets({ one: 10.5, two: -1, five: 25, nope: 5, joker: 0 }), { five: 25 });
  assert.equal(Engine.canAdd("nope", {}), "unknown");
  assert.equal(Engine.canAdd("joker", { joker: 124 }), null);
  assert.equal(Engine.canAdd("joker", { joker: 125 }), "limit");
  assert.ok(Engine.isLegalLayout({ one: 5000, logo: 125 }));
  assert.ok(!Engine.isLegalLayout({ twenty: 251 }));
  Engine.BETS.forEach(function (key) { assert.ok(Engine.maxBet(key) * Engine.PAYS[key] <= 5000, key); });
});

test("the wheel stops on every segment as often, from a uniform source", function () {
  var seen = new Array(54).fill(0);
  for (var i = 0; i < 540; i++) seen[Engine.spin(function () { return (i % 54) / 54 + 1e-9; })]++;
  assert.ok(seen.every(function (count) { return count === 10; }));
  for (var j = 0; j < 200; j++) assert.ok(Engine.isSegment(Engine.spin()));
  [-1, 54, 1.5, "3", null].forEach(function (value) { assert.ok(!Engine.isSegment(value), String(value)); });
});
