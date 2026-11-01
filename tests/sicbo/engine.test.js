/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/sicbo/js/engine.js");

// All 216 ways three dice can land, each as likely as the others.
var ROLLS = [];
for (var a = 1; a <= 6; a++) for (var b = 1; b <= 6; b++) for (var c = 1; c <= 6; c++) ROLLS.push([a, b, c]);

// An oracle written apart from the engine: whether a bet wins on these dice,
// and how many times its stake it pays, straight from the rules of the game.
var TOTAL_PAYS = { 4: 60, 5: 30, 6: 17, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 17, 16: 30, 17: 60 };
function oracle(key, dice) {
  var total = dice[0] + dice[1] + dice[2];
  var triple = dice[0] === dice[1] && dice[1] === dice[2];
  var shows = function (n) { return dice.filter(function (d) { return d === n; }).length; };
  var m;
  if (key === "small") return !triple && total <= 10 ? 1 : 0;
  if (key === "big") return !triple && total >= 11 ? 1 : 0;
  if (key === "odd") return !triple && total % 2 === 1 ? 1 : 0;
  if (key === "even") return !triple && total % 2 === 0 ? 1 : 0;
  if (key === "anyTriple") return triple ? 30 : 0;
  if ((m = /^total(\d+)$/.exec(key))) return total === Number(m[1]) ? TOTAL_PAYS[total] : 0;
  if ((m = /^triple(\d)$/.exec(key))) return shows(Number(m[1])) === 3 ? 180 : 0;
  if ((m = /^double(\d)$/.exec(key))) return shows(Number(m[1])) >= 2 ? 10 : 0;
  if ((m = /^combo(\d)(\d)$/.exec(key))) return shows(Number(m[1])) && shows(Number(m[2])) ? 5 : 0;
  if ((m = /^single(\d)$/.exec(key))) return shows(Number(m[1]));
  throw new Error("No such bet: " + key);
}

// The published house edges of this pay table, in percent.
var EDGES = {
  small: 2.78, big: 2.78, odd: 2.78, even: 2.78,
  total4: 15.28, total5: 13.89, total6: 16.67, total7: 9.72, total8: 12.5, total9: 18.98, total10: 12.5,
  total11: 12.5, total12: 18.98, total13: 12.5, total14: 9.72, total15: 16.67, total16: 13.89, total17: 15.28,
  anyTriple: 13.89, triple: 16.2, double: 18.52, combo: 16.67, single: 7.87
};

test("fifty-two bets: Small, Big, Odd, Even, 14 totals, 6 triples, Any triple, 6 doubles, 15 combinations, 6 numbers", function () {
  assert.equal(Engine.BETS.length, 52);
  assert.equal(new Set(Engine.BETS).size, 52);
  var kinds = {};
  Engine.BETS.forEach(function (key) { kinds[Engine.kindOf(key)] = (kinds[Engine.kindOf(key)] || 0) + 1; });
  assert.deepEqual(kinds, { even: 4, total: 14, triple: 6, anyTriple: 1, double: 6, combo: 15, single: 6 });
  assert.deepEqual(Engine.numbersOf("combo25"), [2, 5]);
  assert.deepEqual(Engine.numbersOf("total11"), [11]);
  ["total3", "total18", "combo22", "combo52", "triple7", "single0", "jackpot", ""].forEach(function (key) {
    assert.equal(Engine.kindOf(key), null, key);
  });
});

test("every bet pays exactly what the rules say on every one of the 216 rolls", function () {
  var checked = 0;
  Engine.BETS.forEach(function (key) {
    ROLLS.forEach(function (dice) {
      assert.equal(Engine.payFor(key, dice), oracle(key, dice), key + " on " + dice.join("-"));
      checked++;
    });
  });
  assert.equal(checked, 52 * 216);
});

test("the house edge of every bet, counted over all 216 rolls, is the published one", function () {
  Engine.BETS.forEach(function (key) {
    var returned = ROLLS.reduce(function (sum, dice) {
      var times = oracle(key, dice);
      return sum + (times ? times + 1 : 0);
    }, 0);
    var edge = 1 - returned / 216;
    var kind = Engine.kindOf(key);
    var published = EDGES[key] != null ? EDGES[key] : EDGES[kind];
    assert.ok(Math.abs(edge - Engine.houseEdge(key)) < 1e-12, key);
    assert.equal(Number((edge * 100).toFixed(2)), published, key);
  });
  // A few by hand: Small wins on 105 of 216 rolls; a single number on one die
  // pays even money 75 times, 2 to 1 fifteen times and 3 to 1 once.
  assert.equal(ROLLS.filter(function (d) { return oracle("small", d); }).length, 105);
  assert.equal(Engine.houseEdge("single4"), 1 - (75 * 2 + 15 * 3 + 1 * 4) / 216);
  assert.equal(Engine.houseEdge("total4"), 1 - 3 * 61 / 216);
  assert.equal(Engine.houseEdge("triple6"), 1 - 181 / 216);
});

test("a roll pays every winner with its stake and takes every loser", function () {
  var bets = { small: 100, big: 50, total10: 10, double4: 5, combo34: 20, single4: 25, single6: 5, triple2: 5, anyTriple: 5 };
  var result = Engine.resolve(bets, [4, 4, 2]);
  assert.equal(result.total, 10);
  assert.equal(result.triple, false);
  var byKey = {};
  result.lines.forEach(function (line) { byKey[line.key] = line; });
  assert.deepEqual([byKey.small.result, byKey.small.returned], ["win", 200]);
  assert.deepEqual([byKey.big.result, byKey.big.returned], ["lose", 0]);
  assert.equal(byKey.total10.returned, 70);
  assert.equal(byKey.double4.returned, 55);
  assert.deepEqual([byKey.combo34.result, byKey.combo34.returned], ["lose", 0], "no 3 among the dice");
  assert.equal(byKey.single4.returned, 75, "two fours pay 2 to 1");
  assert.equal(byKey.single6.returned, 0);
  assert.equal(result.stake, 225);
  assert.equal(result.returned, 200 + 70 + 55 + 75);
  assert.equal(result.profit, 100 + 60 + 50 + 50);
  assert.equal(result.lost, 50 + 20 + 5 + 5 + 5);
  assert.equal(result.returned - result.stake, result.profit - result.lost);
});

test("a triple beats Small, Big, Odd and Even and pays the triples", function () {
  var result = Engine.resolve({ small: 10, big: 10, odd: 10, even: 10, triple3: 10, anyTriple: 10, single3: 10, double3: 10, total9: 10 }, [3, 3, 3]);
  var paid = {};
  result.lines.forEach(function (line) { paid[line.key] = line.returned; });
  assert.deepEqual(paid, { small: 0, big: 0, odd: 0, even: 0, total9: 70, triple3: 1810, anyTriple: 310, double3: 110, single3: 40 });
  assert.deepEqual(Engine.winners([3, 3, 3]), ["total9", "triple3", "anyTriple", "double3", "single3"]);
  assert.deepEqual(Engine.winners([1, 2, 6]), ["small", "odd", "total9", "combo12", "combo16", "combo26", "single1", "single2", "single6"]);
});

test("bets are whole dollars within each table maximum", function () {
  assert.deepEqual(Engine.normalizeBets({ small: 10.5, big: -5, total4: "20", nope: 5, odd: 0, even: 7 }), { even: 7, total4: 20 });
  assert.equal(Engine.canAdd("nope", {}), "unknown");
  assert.equal(Engine.canAdd("small", { small: 4999 }), null);
  assert.equal(Engine.canAdd("small", { small: 5000 }), "limit");
  assert.equal(Engine.maxBet("triple6"), 100);
  assert.ok(Engine.isLegalLayout({ triple6: 100, small: 5000 }));
  assert.ok(!Engine.isLegalLayout({ triple6: 101 }));
  // No bet at its maximum wins more than 30,000 on one roll.
  Engine.BETS.forEach(function (key) {
    var best = Math.max.apply(null, ROLLS.map(function (dice) { return Engine.payFor(key, dice); }));
    assert.ok(best * Engine.maxBet(key) <= 30000, key);
  });
});

test("the dice are fair: every face from a uniform source, three of them", function () {
  var seen = [0, 0, 0, 0, 0, 0, 0];
  for (var i = 0; i < 600; i++) {
    var value = (i % 6) / 6 + 0.01;
    Engine.rollDice(function () { return value; }).forEach(function (die) { seen[die]++; });
  }
  assert.deepEqual(seen.slice(1), [300, 300, 300, 300, 300, 300]);
  for (var j = 0; j < 200; j++) assert.ok(Engine.isDice(Engine.rollDice()));
  assert.ok(!Engine.isDice([1, 2]));
  assert.ok(!Engine.isDice([0, 2, 3]));
  assert.ok(!Engine.isDice([1, 2, 7]));
  assert.ok(!Engine.isDice([1, 2, 3.5]));
  assert.throws(function () { Engine.randomInt(0); }, RangeError);
});
