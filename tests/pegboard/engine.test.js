/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/pegboard/js/engine.js");

function boards(visit) {
  Engine.ROWS.forEach(function (rows) { Engine.RISKS.forEach(function (risk) { visit(rows, risk); }); });
}

// Every path down a board, as "L" and "R" bounces.
function allPaths(rows) {
  var paths = [];
  for (var bits = 0; bits < Math.pow(2, rows); bits++) {
    var path = "";
    for (var row = 0; row < rows; row++) path += (bits >> row) & 1 ? "R" : "L";
    paths.push(path);
  }
  return paths;
}

test("a ball bounces left or right at every row, each with an even chance", function () {
  Engine.ROWS.forEach(function (rows) {
    var path = Engine.drop(rows);
    assert.equal(path.length, rows);
    assert.ok(Engine.isPath(path, rows), path);
  });
  var rights = 0;
  for (var i = 0; i < 2000; i++) rights += Engine.slotOf(Engine.drop(16));
  assert.ok(Math.abs(rights / (2000 * 16) - 0.5) < 0.02, String(rights));
  assert.equal(Engine.drop(8, function () { return 0; }), "LLLLLLLL");
  assert.equal(Engine.drop(8, function () { return 0.75; }), "RRRRRRRR");
  assert.throws(function () { Engine.randomInt(2, function () { return 1; }); }, RangeError);
  ["", "LLLLLLLLL", "LLLLRRRX", 8, null].forEach(function (path) { assert.equal(Engine.isPath(path, 8), false, String(path)); });
});

test("the slot is one to the right of the left edge for every bounce to the right", function () {
  assert.equal(Engine.slotOf("LLLLLLLL"), 0);
  assert.equal(Engine.slotOf("RRRRRRRR"), 8);
  assert.equal(Engine.slotOf("LRLRLRLR"), 4);
  assert.equal(Engine.slotOf("RRRRRRRRRRRRRRRR"), 16);
});

test("every board pays the same on both halves, rising from the centre to the edges", function () {
  boards(function (rows, risk) {
    var pays = Engine.pays(rows, risk);
    var name = rows + " " + risk;
    assert.equal(pays.length, rows + 1, name);
    assert.deepEqual(pays.slice().reverse(), pays, name + " is mirrored");
    for (var slot = 1; slot <= rows / 2; slot++) assert.ok(pays[slot] <= pays[slot - 1], name + " falls toward the centre");
    pays.forEach(function (multiplier) {
      assert.ok(multiplier > 0, name);
      assert.ok(Number.isInteger(Math.round(multiplier * 10)) && Math.abs(multiplier * 10 - Math.round(multiplier * 10)) < 1e-9, name + ": one decimal at most");
    });
  });
  // A higher risk pays more at the edges and less in the middle.
  Engine.ROWS.forEach(function (rows) {
    var low = Engine.pays(rows, "low"), medium = Engine.pays(rows, "medium"), high = Engine.pays(rows, "high");
    assert.ok(low[0] < medium[0] && medium[0] < high[0], rows + " rows: the edges");
    assert.ok(low[rows / 2] > medium[rows / 2] && medium[rows / 2] > high[rows / 2], rows + " rows: the centre");
  });
  assert.equal(Engine.pays(16, "high")[0], 1000, "the top pay of the machine");
});

test("a bet is whole tens of dollars, so every slot pays whole dollars", function () {
  assert.equal(Engine.normalizeBet(10), 10);
  assert.equal(Engine.normalizeBet(Engine.MAX_BET), Engine.MAX_BET);
  [0, 5, 25, 15.5, -10, Engine.MAX_BET + 10, "x", null].forEach(function (bet) { assert.equal(Engine.normalizeBet(bet), 0, String(bet)); });
  boards(function (rows, risk) {
    var lefts = "L".repeat(rows);
    for (var bet = Engine.BET_UNIT; bet <= Engine.MAX_BET; bet += Engine.BET_UNIT) {
      for (var slot = 0; slot <= rows; slot++) {
        var paid = Engine.payout(bet, rows, risk, "R".repeat(slot) + lefts.slice(slot));
        assert.ok(Number.isSafeInteger(paid), rows + " " + risk + " slot " + slot + " on $" + bet + ": " + paid);
      }
    }
  });
});

test("every path of every board, counted one by one, gives the return the binomial counts give", function () {
  var returns = {};
  boards(function (rows, risk) {
    var tenths = 0;
    allPaths(rows).forEach(function (path) { tenths += Engine.payout(10, rows, risk, path); });
    var exact = Engine.exactReturn(rows, risk);
    // A $10 ball pays a slot's tenths in whole dollars.
    assert.equal(tenths, exact.tenths, rows + " " + risk);
    assert.equal(exact.paths, Math.pow(2, rows));
    returns[rows + " " + risk] = (Engine.returnFor(rows, risk) * 100).toFixed(2);
  });
  assert.deepEqual(returns, {
    "8 low": "97.11", "8 medium": "96.88", "8 high": "97.03",
    "12 low": "96.93", "12 medium": "96.91", "12 high": "97.24",
    "16 low": "97.04", "16 medium": "97.25", "16 high": "97.19"
  });
});

test("a round of several balls stakes each one and pays them together", function () {
  var round = Engine.settle(20, 8, "low", ["LLLLLLLL", "LRLRLRLR", "RRRRRRRL"]);
  assert.deepEqual(round.balls.map(function (ball) { return [ball.slot, ball.multiplier, ball.returned]; }), [[0, 6, 120], [4, 0.5, 10], [7, 1.4, 28]]);
  assert.deepEqual([round.stake, round.returned, round.net], [60, 158, 98]);
  assert.deepEqual(Engine.BALLS, [1, 5, 10, 20]);
});
