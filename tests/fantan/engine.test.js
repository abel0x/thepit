/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/fantan/js/engine.js");

function byKind(kind) { return Engine.BETS.filter(function (key) { return Engine.kindOf(key) === kind; }); }

test("thirty-eight bets: four Fan, six pairs, four of three numbers, twelve Nim and twelve Tan", function () {
  assert.equal(Engine.BETS.length, 38);
  assert.deepEqual(byKind("fan"), ["fan1", "fan2", "fan3", "fan4"]);
  assert.deepEqual(byKind("pair"), ["kwok12", "kwok23", "kwok34", "kwok41", "odd", "even"]);
  assert.deepEqual(byKind("ssh"), ["ssh123", "ssh234", "ssh341", "ssh412"]);
  assert.equal(byKind("nim").length, 12);
  assert.equal(byKind("tan").length, 12);
  var seen = {};
  Engine.BETS.forEach(function (key) {
    var def = Engine.DEFS[key];
    var covered = def.wins.concat(def.push);
    assert.equal(new Set(covered).size, covered.length, key + ": a number wins or pushes, never both");
    covered.forEach(function (n) { assert.ok(Engine.NUMBERS.indexOf(n) !== -1, key); });
    var shape = def.kind + ":" + def.wins.slice().sort().join("") + "/" + def.push.join("");
    assert.ok(!seen[shape], key + " repeats " + seen[shape]);
    seen[shape] = key;
  });
  assert.deepEqual(Engine.DEFS.nim23, { key: "nim23", kind: "nim", wins: [2], push: [3] });
  assert.deepEqual(Engine.DEFS.tan142, { key: "tan142", kind: "tan", wins: [1, 4], push: [2] });
  assert.deepEqual(Engine.DEFS.odd.wins, [1, 3]);
  assert.deepEqual(Engine.DEFS.even.wins, [2, 4]);
});

test("the beads counted off in fours leave 1 to 4, each from sixteen of the sixty-four piles", function () {
  var counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (var beads = Engine.MIN_BEADS; beads < Engine.MIN_BEADS + Engine.BEAD_COUNTS; beads++) {
    assert.ok(Engine.isBeads(beads));
    counts[Engine.remainderOf(beads)]++;
  }
  assert.deepEqual(counts, { 1: 16, 2: 16, 3: 16, 4: 16 });
  assert.equal(Engine.remainderOf(41), 1);
  assert.equal(Engine.remainderOf(44), 4);
  assert.equal(Engine.remainderOf(104), 4);
  [40, 105, 50.5, "60", null].forEach(function (beads) { assert.equal(Engine.isBeads(beads), false, String(beads)); });
  for (var i = 0; i < 500; i++) assert.ok(Engine.isBeads(Engine.drawBeads()));
  assert.equal(Engine.drawBeads(function () { return 0; }), 41);
  assert.equal(Engine.drawBeads(function () { return 0.999; }), 104);
});

test("a win pays its odds less 5%, whole dollars now and the change in the box", function () {
  var fan = Engine.settle({ fan1: 20 }, 1, 0);
  assert.deepEqual([fan.paid, fan.box, fan.net], [77, 0, 57], "$20 at 3 to 1 less 5% is $57");
  var kwok = Engine.settle({ kwok12: 10 }, 2, 0);
  assert.deepEqual([kwok.paid, kwok.box, kwok.net], [19, 60, 9], "$9.50 won: $9 now, 50¢ in the box");
  var again = Engine.settle({ kwok12: 10 }, 1, kwok.box);
  assert.deepEqual([again.paid, again.box], [20, 0], "the box completes the dollar");
  var nim = { nim12: 10 };
  assert.deepEqual([1, 2, 3, 4].map(function (r) { return Engine.settle(nim, r, 0).paid; }), [29, 10, 0, 0], "1 Nim 2: $19 on 1, returned on 2");
  var tan = Engine.settle({ tan123: 10 }, 1, 0);
  assert.deepEqual([tan.paid, tan.box], [14, 90], "$10 at 1 to 2 less 5% is $4.75");
  assert.equal(Engine.settle({ tan123: 10 }, 3, 0).paid, 10, "the Tan's third number returns it");
  var ssh = Engine.settle({ ssh123: 30 }, 2, 0);
  assert.deepEqual([ssh.paid, ssh.box], [39, 60], "$30 at 1 to 3 less 5% is $9.50");
  assert.equal(Engine.settle({ ssh123: 30 }, 4, 0).paid, 0);
  var several = Engine.settle({ fan3: 10, odd: 25, even: 25, nim31: 10 }, 3, 0);
  assert.deepEqual(several.lines.map(function (line) { return [line.key, line.result]; }),
    [["fan3", "win"], ["odd", "win"], ["even", "lose"], ["nim31", "win"]]);
  assert.equal(several.stake, 70);
});

test("every bet's house edge, counted over the four results", function () {
  var edges = {};
  Engine.BETS.forEach(function (key) {
    var kind = Engine.kindOf(key);
    var edge = Engine.houseEdge(key);
    if (edges[kind] === undefined) edges[kind] = edge;
    assert.ok(Math.abs(edges[kind] - edge) < 1e-12, key);
  });
  assert.ok(Math.abs(edges.fan - 0.0375) < 1e-12);
  assert.ok(Math.abs(edges.nim - 0.025) < 1e-12);
  assert.ok(Math.abs(edges.pair - 0.025) < 1e-12);
  assert.ok(Math.abs(edges.tan - 0.0125) < 1e-12);
  assert.ok(Math.abs(edges.ssh - 0.0125) < 1e-12);
});

test("over every result, every bet and stake is paid its exact odds through the box", function () {
  Engine.BETS.forEach(function (key) {
    for (var amount = 1; amount <= 60; amount++) {
      var box = 0, paid = 0;
      // Each result 120 times: a whole number of dollars changes hands.
      for (var cycle = 0; cycle < Engine.UNITS; cycle++) {
        Engine.NUMBERS.forEach(function (result) {
          var round = Engine.settle({ [key]: amount }, result, box);
          paid += round.paid;
          box = round.box;
        });
      }
      var exact = amount * 4 * Engine.UNITS * (1 - Engine.houseEdge(key));
      assert.ok(Math.abs(paid + box / Engine.UNITS - exact) < 1e-6, key + " $" + amount + ": " + paid + " against " + exact);
      assert.equal(box, 0, key + " $" + amount + ": the box comes back to nothing");
    }
  });
});

test("every unit is accounted for, and the box stays below a dollar", function () {
  var state = 7;
  function random() { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; }
  var box = 0;
  for (var round = 0; round < 3000; round++) {
    var bets = {};
    for (var b = 0; b < 1 + Math.floor(random() * 5); b++) {
      var key = Engine.BETS[Math.floor(random() * Engine.BETS.length)];
      bets[key] = Math.min((bets[key] || 0) + 1 + Math.floor(random() * 300), Engine.maxBet(key));
    }
    var result = 1 + Math.floor(random() * 4);
    var settled = Engine.settle(bets, result, box);
    assert.equal(settled.paid * Engine.UNITS + settled.box, box + settled.returnedUnits);
    assert.ok(settled.box >= 0 && settled.box < Engine.UNITS);
    assert.ok(Number.isSafeInteger(settled.paid));
    box = settled.box;
  }
  assert.equal(Engine.normalizeBox(-1), 0);
  assert.equal(Engine.normalizeBox(120), 0);
  assert.equal(Engine.normalizeBox(57), 57);
  assert.equal(Engine.maxBet("fan1"), 2500);
  assert.equal(Engine.maxBet("odd"), 5000);
  assert.equal(Engine.maxBet("nope"), 0);
  assert.ok(Engine.withinLimits({ fan1: 2500, ssh123: 5000 }));
  assert.equal(Engine.withinLimits({ nim12: 2501 }), false);
});
