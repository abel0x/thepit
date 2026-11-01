/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/keno/js/engine.js");

// Exact counting with whole numbers, apart from the engine: of all
// C(80, 20) draws, how many catch `hits` of `spots` marks.
function choose(n, k) {
  if (k < 0 || k > n) return 0n;
  var result = 1n;
  for (var i = 1n; i <= BigInt(k); i++) result = result * (BigInt(n) - BigInt(k) + i) / i;
  return result;
}
var ALL_DRAWS = choose(80, 20);

// The exact return of a ticket as a fraction: what all the draws pay
// together, over the number of draws.
function exactReturn(spots) {
  var paid = 0n;
  for (var hits = 0; hits <= spots; hits++) {
    paid += choose(spots, hits) * choose(80 - spots, 20 - hits) * BigInt(Engine.payFor(spots, hits));
  }
  return { paid: paid, draws: ALL_DRAWS };
}

// The returns of this pay table, to the hundredth of a percent.
var RETURNS = { 1: "75.00", 2: "90.19", 3: "92.96", 4: "92.03", 5: "91.93", 6: "91.91", 7: "92.26", 8: "92.07", 9: "92.24", 10: "92.21" };

test("eighty numbers, twenty drawn, one to ten marks, a pay table for each", function () {
  assert.equal(Engine.NUMBERS, 80);
  assert.equal(Engine.DRAWN, 20);
  assert.deepEqual(Object.keys(Engine.PAYS).map(Number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  Object.keys(Engine.PAYS).forEach(function (spots) {
    Object.keys(Engine.PAYS[spots]).forEach(function (hits) {
      var pay = Engine.PAYS[spots][hits];
      assert.ok(Number.isInteger(pay) && pay > 0, spots + "/" + hits);
      assert.ok(Number(hits) <= Number(spots));
    });
    // Catching every mark pays the most.
    var top = Engine.payFor(Number(spots), Number(spots));
    Object.keys(Engine.PAYS[spots]).forEach(function (hits) { assert.ok(Engine.PAYS[spots][hits] <= top); });
  });
  assert.equal(Engine.payFor(10, 10), 10000);
  assert.equal(Engine.payFor(10, 0), 2, "catching none of ten pays too");
  assert.equal(Engine.payFor(10, 4), 0);
  assert.equal(Engine.payFor(11, 11), 0);
});

test("every catch's chance is the exact count of draws over all draws", function () {
  for (var spots = 1; spots <= 10; spots++) {
    var total = 0n;
    for (var hits = 0; hits <= spots; hits++) {
      var ways = choose(spots, hits) * choose(80 - spots, 20 - hits);
      total += ways;
      var exact = Number(ways) / Number(ALL_DRAWS);
      assert.ok(Math.abs(Engine.hitChance(spots, hits) - exact) <= exact * 1e-12, spots + "/" + hits);
    }
    assert.equal(total, ALL_DRAWS, "the catches of " + spots + " marks cover every draw");
  }
  assert.equal(ALL_DRAWS, 3535316142212174320n);
});

test("the return of every ticket, counted over all 3,535,316,142,212,174,320 draws", function () {
  for (var spots = 1; spots <= 10; spots++) {
    var exact = exactReturn(spots);
    // Rounded to the hundredth of a percent with whole numbers only.
    var basisPoints = (exact.paid * 100000n / exact.draws + 5n) / 10n;
    var printed = (Number(basisPoints) / 100).toFixed(2);
    assert.equal(printed, RETURNS[spots], spots + " marks");
    assert.ok(Math.abs(Engine.returnFor(spots) - Number(exact.paid) / Number(exact.draws)) < 1e-12, spots + " marks in the engine");
    assert.ok(exact.paid < exact.draws, "the house keeps an edge on " + spots + " marks");
  }
});

test("a game pays by the marks it catches, the bet included", function () {
  var balls = [3, 17, 22, 41, 5, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74];
  var ten = Engine.settle([1, 2, 3, 4, 5, 17, 22, 41, 60, 80], balls, 5);
  assert.deepEqual(ten.caught, [3, 17, 22, 41, 5, 60], "in the order drawn");
  assert.deepEqual([ten.spots, ten.hits, ten.times, ten.stake, ten.returned, ten.net], [10, 6, 24, 5, 120, 115]);
  var none = Engine.settle([1, 2, 4, 6, 7, 8, 9, 10, 11, 12], balls, 10);
  assert.deepEqual([none.hits, none.returned, none.net], [0, 20, 10]);
  var miss = Engine.settle([80], balls, 25);
  assert.deepEqual([miss.hits, miss.returned, miss.net], [0, 0, -25]);
  var one = Engine.settle([22], balls, 25);
  assert.deepEqual([one.hits, one.returned, one.net], [1, 75, 50]);
});

test("a draw is twenty different numbers from 1 to 80, every number as likely", function () {
  for (var i = 0; i < 300; i++) {
    var balls = Engine.draw();
    assert.ok(Engine.isDraw(balls));
  }
  // With a source walking evenly through [0, 1), every number comes first
  // equally often.
  var first = new Array(81).fill(0);
  for (var k = 0; k < 800; k++) {
    var step = 0;
    var value = (k % 80) / 80 + 1e-9;
    first[Engine.draw(function () { return step++ === 0 ? value : 0; })[0]]++;
  }
  assert.ok(first.slice(1).every(function (count) { return count === 10; }));
  var quick = Engine.quickPick(7);
  assert.ok(Engine.isPicks(quick));
  assert.equal(quick.length, 7);
  assert.deepEqual(quick.slice().sort(function (a, b) { return a - b; }), quick, "a quick pick is in order");
});

test("tickets, draws and bets the machine would refuse", function () {
  assert.ok(Engine.isPicks([1]));
  assert.ok(Engine.isPicks([1, 2, 3, 4, 5, 6, 7, 8, 9, 80]));
  [[], [0], [81], [1, 1], [1.5], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], "1", null].forEach(function (picks) {
    assert.ok(!Engine.isPicks(picks), JSON.stringify(picks));
  });
  var balls = Engine.draw();
  assert.ok(!Engine.isDraw(balls.slice(1)));
  assert.ok(!Engine.isDraw(balls.slice(0, 19).concat([balls[0]])));
  assert.deepEqual(Engine.BETS, [1, 5, 10, 25, 50, 100]);
  assert.ok(Engine.isBet(25));
  assert.ok(!Engine.isBet(30));
});
