/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/slot/js/engine.js");

// The stops that put a reel's strip index in the middle row.
function middle(reel, symbol, nth) {
  var strip = Engine.STRIPS[reel];
  var found = -1;
  for (var i = 0, seen = 0; i < strip.length; i++) {
    if (strip[i] === symbol && seen++ === (nth || 0)) { found = i; break; }
  }
  assert.ok(found >= 0, symbol + " on reel " + reel);
  return (found - 1 + strip.length) % strip.length;
}

test("five reels of 32 stops, each with one star and a wild or more", function () {
  assert.equal(Engine.STRIPS.length, Engine.REELS);
  Engine.STRIPS.forEach(function (strip, reel) {
    assert.equal(strip.length, 32, "reel " + reel);
    strip.forEach(function (symbol) { assert.ok(Engine.SYMBOLS.indexOf(symbol) !== -1, symbol); });
    assert.equal(strip.filter(function (s) { return s === "star"; }).length, 1, "reel " + reel);
    assert.ok(strip.indexOf("wild") !== -1, "reel " + reel);
  });
});

test("twenty different lines, one row on every reel", function () {
  assert.equal(Engine.LINES.length, 20);
  assert.equal(new Set(Engine.LINES.map(String)).size, 20);
  Engine.LINES.forEach(function (line) {
    assert.equal(line.length, Engine.REELS);
    line.forEach(function (row) { assert.ok(row >= 0 && row < Engine.ROWS); });
  });
  assert.deepEqual(Engine.LINES[0], [1, 1, 1, 1, 1], "line 1 is the middle row");
});

test("a line pays from the leftmost reel, the wild standing in, and only its best win", function () {
  function pay(text) { return Engine.lineWin(text.split(" ")); }
  assert.deepEqual(pay("wild wild wild wild wild"), { symbol: "wild", count: 5, pay: 1000 });
  assert.deepEqual(pay("wild wild wild seven seven"), { symbol: "seven", count: 5, pay: 750 }, "standing in pays more");
  assert.deepEqual(pay("wild wild wild jack jack"), { symbol: "wild", count: 3, pay: 50 }, "three wilds beat five jacks");
  assert.deepEqual(pay("seven wild seven jack bell"), { symbol: "seven", count: 3, pay: 40 });
  assert.deepEqual(pay("bell bell bell bell jack"), { symbol: "bell", count: 4, pay: 60 });
  assert.equal(pay("jack jack queen jack jack").pay, 0, "two do not pay");
  assert.equal(pay("wild wild star seven seven").pay, 0, "a star ends the line");
  assert.equal(pay("star star star star star").pay, 0, "stars pay as scatters, not on lines");
  assert.equal(pay("king queen king king king").pay, 0, "only from the leftmost reel");
});

test("a spin pays every winning line by the line bet, and stars by the total bet", function () {
  // Sevens in the middle row of the first three reels.
  var stops = [middle(0, "seven"), middle(1, "seven"), middle(2, "seven"), 3, 20];
  var result = Engine.evaluate(stops, 5);
  var line1 = result.lines.filter(function (l) { return l.line === 0; })[0];
  assert.ok(line1.count >= 3);
  assert.equal(line1.win, Engine.PAYS[line1.symbol][line1.count] * 5);
  assert.deepEqual(line1.cells.slice(0, 3), [[0, 1], [1, 1], [2, 1]]);
  assert.equal(result.win, result.lines.reduce(function (sum, l) { return sum + l.win; }, 0) + result.scatter.win);
  assert.equal(Engine.evaluate(stops, 5, 3).win, result.win * 3, "free spins pay triple");

  var stars = Engine.STRIPS.map(function (strip, reel) { return middle(reel, "star"); });
  var five = Engine.evaluate(stars, 2);
  assert.equal(five.scatter.count, 5);
  assert.equal(five.scatter.win, 100 * 2 * 20);
  assert.equal(five.trigger, true);
  assert.equal(Engine.evaluate(stars.slice(0, 2).concat([0, 0, 0]), 2).trigger, false);
});

test("a paid spin brings ten free spins exactly when three stars or more land", function () {
  var draws = 0;
  var stars = Engine.STRIPS.map(function (strip, reel) { return middle(reel, "star"); });
  // A source that lands every reel on its star first, then anywhere.
  var spin = Engine.play(function () {
    var reel = draws % Engine.REELS;
    var value = draws < Engine.REELS ? stars[reel] / 32 : ((draws * 7) % 32) / 32;
    draws++;
    return value;
  });
  assert.equal(spin.free.length, Engine.FREE_SPINS);
  assert.ok(Engine.isLegalSpin(spin));
  var settled = Engine.settle(spin, 1);
  assert.equal(settled.stake, 20);
  assert.equal(settled.returned, settled.base.win + settled.freeWin);
  settled.free.forEach(function (result) { assert.equal(result.multiplier, 3); });

  assert.equal(Engine.isLegalSpin({ stops: spin.stops, free: null }), false, "the free spins cannot go missing");
  assert.equal(Engine.isLegalSpin({ stops: [0, 0, 0, 0, 0], free: spin.free }), false, "nor appear without stars");
  assert.equal(Engine.isLegalSpin({ stops: [0, 0, 0, 0, 32], free: null }), false);
  assert.equal(Engine.isLegalSpin({ stops: [0, 0, 0, 0], free: null }), false);
  assert.ok(Engine.isLegalSpin({ stops: [0, 0, 0, 0, 0], free: null }));
});

test("the reels stop without bias", function () {
  var counts = new Array(32).fill(0);
  for (var i = 0; i < 64000; i++) counts[Engine.randomInt(Engine.STRIPS[2].length)]++;
  counts.forEach(function (count) { assert.ok(count > 1700 && count < 2300, String(count)); });
});

test("an exhaustive count of all 33,554,432 stops gives the machine its 95.80% return", function () {
  var symbols = Engine.SYMBOLS;
  // What a line of five symbols pays, for every combination of symbols.
  var pays = new Float64Array(Math.pow(10, 5));
  for (var code = 0; code < pays.length; code++) {
    var line = [], rest = code;
    for (var r = 4; r >= 0; r--) { line[r] = symbols[rest % 10]; rest = Math.floor(rest / 10); }
    pays[code] = Engine.lineWin(line).pay;
  }
  // For each reel and stop: the symbol in each row, and whether a star shows.
  var rows = Engine.STRIPS.map(function (strip) {
    return strip.map(function (unused, stop) {
      return [0, 1, 2].map(function (row) { return symbols.indexOf(strip[(stop + row) % strip.length]); });
    });
  });
  var stars = Engine.STRIPS.map(function (strip) {
    return strip.map(function (unused, stop) {
      return [0, 1, 2].some(function (row) { return strip[(stop + row) % strip.length] === "star"; }) ? 1 : 0;
    });
  });
  // The three straight lines, the scatter pays and how often the feature starts.
  var lineSums = [0, 0, 0], scatterSum = 0, triggers = 0, spins = 0;
  var R = rows, S = stars;
  for (var a = 0; a < 32; a++) {
    for (var b = 0; b < 32; b++) {
      for (var c = 0; c < 32; c++) {
        for (var d = 0; d < 32; d++) {
          var partial = [0, 1, 2].map(function (row) { return ((R[0][a][row] * 10 + R[1][b][row]) * 10 + R[2][c][row]) * 10 + R[3][d][row]; });
          var starsSoFar = S[0][a] + S[1][b] + S[2][c] + S[3][d];
          for (var e = 0; e < 32; e++) {
            spins++;
            lineSums[0] += pays[partial[0] * 10 + R[4][e][0]];
            lineSums[1] += pays[partial[1] * 10 + R[4][e][1]];
            lineSums[2] += pays[partial[2] * 10 + R[4][e][2]];
            var n = starsSoFar + S[4][e];
            scatterSum += Engine.SCATTER_PAYS[n] || 0;
            if (n >= 3) triggers++;
          }
        }
      }
    }
  }
  assert.equal(spins, Math.pow(32, 5));
  // Every row of a reel stopping at random is the whole strip at random, so
  // every line returns the same.
  assert.equal(lineSums[0], lineSums[1]);
  assert.equal(lineSums[1], lineSums[2]);
  var lineReturn = lineSums[1] / spins;
  var scatterReturn = scatterSum / spins;
  var trigger = triggers / spins;
  var total = lineReturn + scatterReturn + trigger * Engine.FREE_SPINS * Engine.FREE_MULTIPLIER * (lineReturn + scatterReturn);
  var engine = Engine.returnToPlayer();
  assert.ok(Math.abs(engine.line - lineReturn) < 1e-12);
  assert.ok(Math.abs(engine.scatter - scatterReturn) < 1e-12);
  assert.ok(Math.abs(engine.trigger - trigger) < 1e-12);
  assert.ok(Math.abs(engine.total - total) < 1e-12);
  assert.equal((total * 100).toFixed(2), "95.80");
  assert.equal(Math.round(1 / trigger), 140, "free spins about once in 140 paid spins");
});
