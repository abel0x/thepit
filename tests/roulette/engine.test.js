/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/roulette/js/engine.js");

var RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

test("the wheel holds every number once in the European single-zero order", function () {
  assert.deepEqual(Engine.WHEEL, [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]);
  assert.equal(Engine.POCKETS, 37);
  assert.deepEqual(Engine.WHEEL.slice().sort(function (a, b) { return a - b; }), Array.from({ length: 37 }, function (_, i) { return i; }));
  Engine.WHEEL.forEach(function (n, index) { assert.equal(Engine.wheelIndexOf(n), index); });
});

test("pocket colours alternate around the wheel and match the layout", function () {
  for (var n = 0; n <= 36; n++) {
    assert.equal(Engine.colorOf(n), n === 0 ? "green" : RED.indexOf(n) !== -1 ? "red" : "black", String(n));
  }
  for (var i = 1; i < 36; i++) {
    assert.notEqual(Engine.colorOf(Engine.WHEEL[i]), Engine.colorOf(Engine.WHEEL[i + 1]), "neighbours " + i);
  }
  assert.throws(function () { Engine.colorOf(37); }, RangeError);
  assert.throws(function () { Engine.colorOf(1.5); }, RangeError);
});

test("describe reports parity, range, dozen and column", function () {
  assert.deepEqual(Engine.describe(0), { number: 0, color: "green", parity: null, range: null, dozen: null, column: null });
  assert.deepEqual(Engine.describe(17), { number: 17, color: "black", parity: "odd", range: "low", dozen: 2, column: 2 });
  assert.deepEqual(Engine.describe(36), { number: 36, color: "red", parity: "even", range: "high", dozen: 3, column: 3 });
  assert.deepEqual(Engine.describe(1), { number: 1, color: "red", parity: "odd", range: "low", dozen: 1, column: 1 });
});

test("the catalogue has all 157 standard bets with the right payouts", function () {
  var counts = {};
  Engine.BET_LIST.forEach(function (bet) { counts[bet.type] = (counts[bet.type] || 0) + 1; });
  assert.equal(Engine.BET_LIST.length, 157);
  assert.deepEqual(counts, {
    straight: 37, split: 60, street: 12, trio: 2, corner: 22, firstFour: 1, sixLine: 11,
    column: 3, dozen: 3, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1
  });
  var expected = { straight: 35, split: 17, street: 11, trio: 11, corner: 8, firstFour: 8, sixLine: 5, column: 2, dozen: 2, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1 };
  Engine.BET_LIST.forEach(function (bet) {
    assert.equal(bet.payout, expected[bet.type], bet.key);
    // A fair game would pay 36/n - 1; the single zero is the house's whole edge.
    assert.equal((bet.payout + 1) * bet.numbers.length, 36, bet.key);
    assert.ok(Object.isFrozen(bet) && Object.isFrozen(bet.numbers), bet.key);
  });
});

test("every bet type keeps the house edge at exactly 1/37", function () {
  Engine.BET_LIST.forEach(function (bet) {
    var returned = 0;
    for (var n = 0; n <= 36; n++) returned += Engine.settle(makeBet(bet.key, 37), n).returned;
    assert.equal(returned, 37 * 36, bet.key);
  });
});

test("La Partage halves the loss on even-money bets only, and only on zero", function () {
  ["red", "black", "odd", "even", "low", "high"].forEach(function (key) {
    var zero = Engine.settle(makeBet(key, 100), 0, { laPartage: true });
    assert.equal(zero.lines[0].outcome, "partage");
    assert.equal(zero.returned, 50);
    assert.equal(Engine.settle(makeBet(key, 101), 0, { laPartage: true }).returned, 50, "odd stakes round down");
    assert.equal(Engine.settle(makeBet(key, 100), 0).returned, 0, "European rules lose it all");
    var total = 0;
    for (var n = 0; n <= 36; n++) total += Engine.settle(makeBet(key, 74), n, { laPartage: true }).returned;
    assert.equal(total, 74 * 36 + 37, key + " edge is 1/74");
  });
  ["dozen:1", "column:2", "straight:0", "split:0-1", "trio:0-1-2", "firstFour:0-1-2-3"].forEach(function (key) {
    var line = Engine.settle(makeBet(key, 100), 0, { laPartage: true }).lines[0];
    assert.notEqual(line.outcome, "partage", key);
  });
});

test("settle returns stake plus winnings and ignores unknown or empty bets", function () {
  var result = Engine.settle({ "straight:17": 50, "split:17-20": 25, red: 25, black: 100, "nonsense": 999, "dozen:2": 0 }, 17);
  assert.equal(result.stake, 200);
  assert.equal(result.returned, 50 * 36 + 25 * 18 + 100 * 2);
  assert.equal(result.net, result.returned - 200);
  assert.deepEqual(result.lines.map(function (l) { return l.key + ":" + l.outcome; }).sort(),
    ["black:win", "red:lose", "split:17-20:win", "straight:17:win"]);
  assert.throws(function () { Engine.settle({ red: 5 }, 37); }, RangeError);
});

test("announced bets place the croupier's standard chips", function () {
  assert.deepEqual(Engine.announcedBets("voisins", 5), [
    { key: "trio:0-2-3", amount: 10 }, { key: "split:4-7", amount: 5 }, { key: "split:12-15", amount: 5 },
    { key: "split:18-21", amount: 5 }, { key: "split:19-22", amount: 5 }, { key: "corner:25-26-28-29", amount: 10 },
    { key: "split:32-35", amount: 5 }
  ]);
  assert.equal(Engine.announcedUnits("voisins"), 9);
  assert.equal(Engine.announcedUnits("tiers"), 6);
  assert.equal(Engine.announcedUnits("orphelins"), 5);
  assert.equal(Engine.announcedUnits("zero"), 4);
  var covered = [];
  ["voisins", "tiers", "orphelins"].forEach(function (name) {
    Engine.announcedBets(name, 1).forEach(function (part) { assert.ok(Engine.getBet(part.key), part.key); });
    covered = covered.concat(Engine.announcedNumbers(name));
  });
  // Voisins, Tiers and Orphelins split the wheel between them exactly once.
  assert.deepEqual(covered.sort(function (a, b) { return a - b; }), Array.from({ length: 37 }, function (_, i) { return i; }));
  assert.equal(Engine.announcedNumbers("voisins").length, 17);
  assert.equal(Engine.announcedNumbers("tiers").length, 12);
  assert.equal(Engine.announcedNumbers("orphelins").length, 8);
  assert.deepEqual(Engine.announcedNumbers("zero").slice().sort(function (a, b) { return a - b; }), [0, 3, 12, 15, 26, 32, 35]);
  assert.throws(function () { Engine.announcedBets("snake", 5); }, RangeError);
});

test("each announced number is a contiguous arc of the wheel", function () {
  ["voisins", "tiers", "orphelins", "zero"].forEach(function (name) {
    var set = Engine.announcedNumbers(name);
    var starts = Engine.WHEEL.filter(function (n, i) {
      return set.indexOf(n) !== -1 && set.indexOf(Engine.WHEEL[(i + 36) % 37]) === -1;
    });
    assert.equal(starts.length, name === "orphelins" ? 2 : 1, name);
  });
});

test("neighbour bets follow the wheel, wrapping round zero", function () {
  assert.deepEqual(Engine.neighbours(0, 2), [3, 26, 0, 32, 15]);
  assert.deepEqual(Engine.neighbours(26, 1), [3, 26, 0]);
  assert.deepEqual(Engine.neighbours(17, 0), [17]);
  assert.equal(Engine.neighbours(5, 18).length, 37);
  assert.deepEqual(Engine.neighbourBets(10, 1, 25), [
    { key: "straight:23", amount: 25 }, { key: "straight:10", amount: 25 }, { key: "straight:5", amount: 25 }
  ]);
});

test("betForNumbers finds the inside bet covering a set of numbers", function () {
  assert.equal(Engine.betForNumbers([20, 17]).key, "split:17-20");
  assert.equal(Engine.betForNumbers([0, 3, 2]).key, "trio:0-2-3");
  assert.equal(Engine.betForNumbers([3, 2, 1, 0]).key, "firstFour:0-1-2-3");
  assert.equal(Engine.betForNumbers([1, 2, 3]).key, "street:1-2-3");
  assert.equal(Engine.betForNumbers([3, 4]), null, "3 and 4 are not adjacent on the layout");
  assert.equal(Engine.betForNumbers([1, 5]), null);
});

test("table maximums scale with the numbers a bet covers", function () {
  assert.equal(Engine.maxStake("straight:7", 2500), 2500);
  assert.equal(Engine.maxStake("split:7-8", 2500), 5000);
  assert.equal(Engine.maxStake("street:7-8-9", 2500), 7500);
  assert.equal(Engine.maxStake("corner:7-8-10-11", 2500), 10000);
  assert.equal(Engine.maxStake("sixLine:7-8-9-10-11-12", 2500), 15000);
  assert.equal(Engine.maxStake("dozen:1", 2500), 25000);
  assert.equal(Engine.maxStake("red", 2500), 50000);
  assert.throws(function () { Engine.maxStake("red:5", 2500); }, RangeError);
});

test("normalizeBets keeps whole positive stakes on known bets", function () {
  assert.deepEqual(Engine.normalizeBets({ red: 25.9, "straight:0": -5, odd: "10", bogus: 5, "split:1-2": 0 }), { red: 25, odd: 10 });
  assert.deepEqual(Engine.normalizeBets(null), {});
  assert.equal(Engine.totalStake({ red: 5, black: 10 }), 15);
});

test("randomInt uses unbiased rejection sampling over crypto values", function () {
  var values = [0xFFFFFFFF, 0xFFFFFFFE, 37 * 3 + 5];
  var fakeCrypto = { getRandomValues: function (buffer) { buffer[0] = values.shift(); return buffer; } };
  var engine = loadWithCrypto(fakeCrypto);
  // The two largest 32-bit values fall in the rejected remainder.
  assert.equal(engine.randomInt(37), 5);
  assert.equal(values.length, 0);
});

test("spin results are uniform over 37 pockets", function () {
  var counts = new Array(37).fill(0);
  var draws = 74000;
  for (var i = 0; i < draws; i++) counts[Engine.spin()]++;
  var expected = draws / 37;
  var chi = counts.reduce(function (sum, c) { return sum + (c - expected) * (c - expected) / expected; }, 0);
  // 36 degrees of freedom: p < 0.0001 beyond 76.
  assert.ok(chi < 76, "chi-square " + chi.toFixed(1));
});

test("a fallback random source must stay in [0, 1)", function () {
  var engine = loadWithCrypto(null);
  assert.equal(engine.randomInt(37, function () { return 0.999999; }), 36);
  // The engine was loaded in its own realm, so match the error by name.
  assert.throws(function () { engine.randomInt(37, function () { return 1; }); }, { name: "RangeError" });
  assert.throws(function () { engine.randomInt(0); }, { name: "RangeError" });
});

test("summarize counts colours, ranges, dozens and hot or cold numbers", function () {
  var summary = Engine.summarize([1, 2, 3, 3, 0, 17, 17, 17, "x", 40]);
  assert.equal(summary.spins, 8);
  assert.deepEqual(summary.tally.dozens, [4, 3, 0]);
  assert.equal(summary.tally.green, 1);
  assert.equal(summary.hot[0], 17);
  assert.equal(summary.hot[1], 3);
  assert.equal(summary.lastSeen[17], 0);
  assert.equal(summary.lastSeen[1], 7);
  assert.equal(summary.lastSeen[36], null);
  assert.equal(summary.cold[0], 4, "never seen, lowest number first");
  assert.equal(Engine.summarize([5, 6, 7], 2).spins, 2);
});

function makeBet(key, amount) {
  var bets = {};
  bets[key] = amount;
  return bets;
}

function loadWithCrypto(cryptoSource) {
  var path = require.resolve("../../games/roulette/js/engine.js");
  var source = require("node:fs").readFileSync(path, "utf8");
  var sandbox = { crypto: cryptoSource, module: { exports: {} } };
  sandbox.globalThis = sandbox;
  require("node:vm").runInNewContext(source, sandbox);
  return sandbox.module.exports;
}
