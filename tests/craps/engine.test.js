/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/craps/js/engine.js");

// The exact expected result of one bet, per dollar, from a state until it is
// decided: a win or a loss ends it, a push or a bar twelve ends it at zero,
// and anything else rolls on. Solved by iterating over the 36 rolls.
function edge(key, point, extra) {
  var stake = 60;
  var points = [null].concat(Engine.POINTS);
  var keys = Engine.BETS;
  var values = new Map();
  function id(p, k) { return p + "|" + k; }
  for (var round = 0; round < 3000; round++) {
    var next = new Map();
    points.forEach(function (p) {
      keys.filter(function (k) { return k === key || k.indexOf(key) === 0; }).forEach(function (k) {
        var sum = 0;
        for (var a = 1; a <= 6; a++) {
          for (var b = 1; b <= 6; b++) {
            var bets = Object.assign({}, extra);
            bets[k] = stake;
            var r = Engine.resolve({ point: p, bets: bets }, [a, b]);
            var line = r.lines.filter(function (l) { return l.key === k; })[0];
            var v;
            if (!line || line.result === "off") v = values.get(id(r.point, k)) || 0;
            else if (line.result === "win") v = line.profit;
            else if (line.result === "lose") v = -stake;
            else if (line.result === "move") v = values.get(id(r.point, line.to)) || 0;
            else v = 0;
            sum += v / 36;
          }
        }
        next.set(id(p, k), sum);
      });
    });
    values = next;
  }
  return (-values.get(id(point, key)) / stake * 100).toFixed(3);
}

test("every bet has the house edge the casino books give it", function () {
  assert.equal(edge("pass", null), "1.414");
  assert.equal(edge("dontPass", null), "1.364");
  assert.equal(edge("come", 4), "1.414");
  assert.equal(edge("dontCome", 4), "1.364");
  assert.equal(edge("field", null), "2.778");
  assert.equal(edge("place4", 8), "6.667");
  assert.equal(edge("place5", 8), "4.000");
  assert.equal(edge("place6", 8), "1.515");
  assert.equal(edge("hard4", 8), "11.111");
  assert.equal(edge("hard6", 8), "9.091");
  assert.equal(edge("any7", null), "16.667");
  assert.equal(edge("anyCraps", null), "11.111");
  assert.equal(edge("two", null), "13.889");
  assert.equal(edge("three", null), "11.111");
  [4, 5, 6].forEach(function (n) {
    assert.equal(Math.abs(Number(edge("passOdds", n, { pass: 60 }))), 0, "odds pay true odds on " + n);
    assert.equal(Math.abs(Number(edge("dontOdds", n, { dontPass: 60 }))), 0, "laid odds pay true odds on " + n);
  });
});

test("line bets go down before a point, come bets after, odds behind them", function () {
  assert.equal(Engine.canAdd("pass", null, {}), null);
  assert.equal(Engine.canAdd("pass", 6, {}), "comeOutOnly");
  assert.equal(Engine.canAdd("come", null, {}), "pointOnly");
  assert.equal(Engine.canAdd("passOdds", 6, {}), "oddsNeedBet");
  assert.equal(Engine.maxBet("passOdds", 6, { pass: 10 }), 50);
  assert.equal(Engine.maxBet("passOdds", 4, { pass: 10 }), 30);
  assert.equal(Engine.maxBet("dontOdds", 4, { dontPass: 10 }), 60);
  assert.equal(Engine.canAdd("come6", 6, {}), "travels");
  assert.equal(Engine.canRemove("pass", 6), false);
  assert.equal(Engine.canRemove("place6", 6), true);
});

test("a come bet travels to its number and a seven out clears the layout", function () {
  var first = Engine.resolve({ point: 6, bets: { pass: 10, come: 10, place8: 12 } }, [2, 2]);
  assert.deepEqual(first.bets, { pass: 10, come4: 10, place8: 12 });
  var out = Engine.resolve({ point: 6, bets: { pass: 10, passOdds: 50, come4: 10, place8: 12 } }, [3, 4]);
  assert.equal(out.sevenOut, true);
  assert.equal(out.point, null);
  assert.deepEqual(out.bets, {});
  assert.equal(out.lost, 82);
  var made = Engine.resolve({ point: 6, bets: { pass: 10, passOdds: 50 } }, [3, 3]);
  assert.equal(made.pointMade, true);
  assert.equal(made.returned, 10 + 60 + 50, "the line pays even money and stays; the odds pay 6 to 5 and come down");
  assert.deepEqual(made.bets, { pass: 10 });
});
