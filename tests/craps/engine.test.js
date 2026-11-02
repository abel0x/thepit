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
  assert.equal(Engine.canAdd("come6", null, {}), "travels", "a come bet on a number needs a point to be put there");
  assert.equal(Engine.canAdd("come6", 6, {}), null, "a put bet");
  assert.equal(Engine.canAdd("dontCome6", 6, {}), "travels", "there is no put on the don't side");
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

/* ---------------- Hop, Fire and Put ---------------- */
test("a hop wins on one roll of its pair of dice, either way round", function () {
  assert.equal(Engine.HOPS.length, 17, "21 pairs of dice less the 2, 3, 11 and 12");
  ["hop11", "hop12", "hop56", "hop66"].forEach(function (key) { assert.equal(Engine.HOPS.indexOf(key), -1, key); });
  var mixed = Engine.resolve({ point: null, bets: { hop24: 10 } }, [4, 2]);
  assert.deepEqual(mixed.lines[0], { key: "hop24", amount: 10, result: "win", profit: 150, returned: 150, stays: true });
  var pair = Engine.resolve({ point: 8, bets: { hop44: 10, hop35: 10 } }, [4, 4]);
  assert.deepEqual(pair.lines.map(function (l) { return [l.key, l.result, l.profit]; }), [["hop35", "lose", 0], ["hop44", "win", 300]]);
  assert.equal(Engine.resolve({ point: null, bets: { hop24: 10 } }, [3, 3]).lines[0].result, "lose", "a six of 3 and 3 is not 2 and 4");
  assert.equal(Engine.kindOf("hop24"), "hop");
  assert.equal(Engine.numberOf("hop24"), null);
  assert.deepEqual(Engine.hopDice("hop35"), [3, 5]);
  // Over the 36 rolls: 13.89% on a pair, 11.11% on two faces.
  // A winning hop stays up, so a roll's result is its profit or its loss.
  function hopEdge(key) {
    var net = 0;
    for (var a = 1; a <= 6; a++) for (var b = 1; b <= 6; b++) {
      var line = Engine.resolve({ point: null, bets: { [key]: 36 } }, [a, b]).lines[0];
      net += line.result === "win" ? line.profit : -line.amount;
    }
    return (-net / 36 / 36 * 100).toFixed(2);
  }
  assert.equal(hopEdge("hop33"), "13.89");
  assert.equal(hopEdge("hop24"), "11.11");
});

test("the shooter's points: made ones are kept once, a seven out clears them", function () {
  assert.deepEqual(Engine.resolve({ point: 6, bets: {}, made: [4] }, [3, 3]).made, [4, 6]);
  assert.deepEqual(Engine.resolve({ point: 6, bets: {}, made: [4, 6] }, [2, 4]).made, [4, 6], "a point made twice counts once");
  assert.deepEqual(Engine.resolve({ point: 6, bets: {}, made: [4, 5] }, [3, 4]).made, [], "seven out");
  assert.deepEqual(Engine.resolve({ point: null, bets: {}, made: [4] }, [3, 4]).made, [4], "a come-out seven is no seven out");
  assert.deepEqual(Engine.resolve({ point: 6, bets: {}, made: [4] }, [4, 4]).made, [4], "another number");
  assert.deepEqual(Engine.normalizeMade([4, 4, 3, "5", 10]), [4, 10]);
});

test("the Fire Bet goes down for a new shooter and pays on the points made", function () {
  assert.equal(Engine.canAdd("fire", null, {}, []), null);
  assert.equal(Engine.canAdd("fire", 6, {}, []), "fireNewShooter", "not once a point is on");
  assert.equal(Engine.canAdd("fire", null, {}, [4]), "fireNewShooter", "not once a point is made");
  assert.equal(Engine.canAdd("fire", null, { fire: 25 }, []), "limit");
  assert.equal(Engine.canRemove("fire", null, []), true);
  assert.equal(Engine.canRemove("fire", 6, []), false, "a working Fire Bet is a contract");
  function fire(point, made, dice) { return Engine.resolve({ point: point, bets: { fire: 5 }, made: made }, dice); }
  assert.deepEqual(fire(6, [4, 5, 8], [3, 4]).lines[0].result, "lose", "three points lose at the seven out");
  assert.deepEqual(fire(6, [4, 5, 8, 9], [3, 4]).lines[0].profit, 120, "four pay 24 to 1");
  assert.deepEqual(fire(6, [4, 5, 8, 9, 10], [3, 4]).lines[0].profit, 1245, "five pay 249 to 1");
  var sixth = fire(6, [4, 5, 8, 9, 10], [3, 3]);
  assert.deepEqual([sixth.lines[0].result, sixth.lines[0].profit, sixth.lines[0].stays], ["win", 4995, false], "the sixth point pays 999 to 1 at once");
  assert.deepEqual(fire(6, [4, 6, 8, 9, 10], [3, 3]).lines, [], "a point made again changes nothing");
  assert.deepEqual(fire(null, [], [3, 4]).lines, [], "a come-out seven is no seven out");
  assert.deepEqual(fire(null, [], [3, 4]).bets, { fire: 5 });
});

test("an exact count of every shooter gives the Fire Bet its 20.76% house edge", function () {
  // Come-out rolls that set no point change nothing, so each point cycle
  // sets the point p with chance ways(p)/24 and makes it with ways/(ways+6).
  var ways = { 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3 };
  var make = {}, seven = 0;
  Engine.POINTS.forEach(function (p) {
    make[p] = ways[p] / 24 * ways[p] / (ways[p] + 6);
    seven += ways[p] / 24 * 6 / (ways[p] + 6);
  });
  var reach = { "": 1 }, back = 0;
  for (var size = 0; size <= 5; size++) {
    Object.keys(reach).filter(function (set) { return (set ? set.split(",").length : 0) === size; }).forEach(function (set) {
      var made = set ? set.split(",").map(Number) : [];
      var stay = made.reduce(function (sum, p) { return sum + make[p]; }, 0);
      var here = reach[set] / (1 - stay);
      // Settle the bet with the engine itself, at the seven out from this set.
      back += here * seven * Engine.resolve({ point: 4, bets: { fire: 1 }, made: made }, [3, 4]).returned;
      Engine.POINTS.filter(function (p) { return made.indexOf(p) === -1; }).forEach(function (p) {
        if (size === 5) back += here * make[p] * Engine.resolve({ point: p, bets: { fire: 1 }, made: made }, [p / 2 | 0, p - (p / 2 | 0)]).returned;
        else {
          var next = made.concat([p]).sort(function (a, b) { return a - b; }).join(",");
          reach[next] = (reach[next] || 0) + here * make[p];
        }
      });
    });
  }
  assert.equal(((1 - back) * 100).toFixed(2), "20.76");
});

test("a put bet is a come bet put on its number: it wins before a 7, takes odds and stays a contract", function () {
  var put = Engine.resolve({ point: 5, bets: { come6: 12, comeOdds6: 60 } }, [2, 4]);
  assert.deepEqual(put.lines.map(function (l) { return [l.key, l.result, l.profit]; }), [["come6", "win", 12], ["comeOdds6", "win", 72]]);
  assert.equal(Engine.maxBet("comeOdds6", 5, { come6: 12 }), 60);
  assert.equal(Engine.canRemove("come6", 5), false);
  // Its own edge on 6, with no come-out to help it: 5 ways to win, 6 to lose.
  var back = 0, rolls = 0;
  for (var a = 1; a <= 6; a++) for (var b = 1; b <= 6; b++) {
    var r = Engine.resolve({ point: 5, bets: { come6: 11 } }, [a, b]);
    if (r.lines.length) { back += r.returned; rolls++; }
  }
  assert.equal(rolls, 11);
  assert.equal(((11 * 11 - back) / (11 * 11) * 100).toFixed(2), "9.09");
});
