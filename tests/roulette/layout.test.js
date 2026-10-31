/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/roulette/js/engine.js");
var Layout = require("../../games/roulette/js/layout.js");

var ORIENTATIONS = ["horizontal", "vertical"];

test("number cells follow the casino layout: 3 6 9 … along the far row", function () {
  var board = Layout.createBoard("horizontal");
  var numbers = board.cells.filter(function (c) { return c.kind === "number"; });
  assert.equal(numbers.length, 36);
  assert.equal(Layout.numberAt(0, 0), 3);
  assert.equal(Layout.numberAt(0, 2), 1);
  assert.equal(Layout.numberAt(11, 0), 36);
  for (var n = 1; n <= 36; n++) {
    var cell = Layout.cellOf(n);
    assert.equal(Layout.numberAt(cell.c, cell.r), n);
  }
  assert.equal(board.cells.filter(function (c) { return c.kind === "zero"; }).length, 1);
  assert.equal(board.cells.filter(function (c) { return c.kind === "column"; }).length, 3);
  assert.equal(board.cells.filter(function (c) { return c.kind === "dozen"; }).length, 3);
  assert.equal(board.cells.filter(function (c) { return c.kind === "even"; }).length, 6);
  board.cells.forEach(function (cell) { assert.ok(Engine.getBet(cell.key), cell.key); });
});

ORIENTATIONS.forEach(function (orientation) {
  test(orientation + ": every bet's chip spot maps back to that bet", function () {
    var board = Layout.createBoard(orientation);
    Engine.BET_LIST.forEach(function (bet) {
      var a = board.anchor(bet.key);
      assert.ok(a, bet.key);
      assert.ok(a.x >= board.bounds.x0 && a.x <= board.bounds.x1 && a.y >= board.bounds.y0 && a.y <= board.bounds.y1, bet.key);
      assert.equal(board.hitTest(a.x, a.y), bet.key, bet.key);
      // A little jitter around the spot still makes the same bet.
      [[0.05, 0], [-0.05, 0], [0, 0.05], [0, -0.05]].forEach(function (d) {
        assert.equal(board.hitTest(a.x + d[0], a.y + d[1]), bet.key, bet.key + " ±" + d);
      });
    });
  });

  test(orientation + ": every point on the table makes a real bet", function () {
    var board = Layout.createBoard(orientation);
    var b = board.bounds;
    for (var x = b.x0; x <= b.x1; x += 0.037) {
      for (var y = b.y0; y <= b.y1; y += 0.031) {
        var key = board.hitTest(x, y);
        if (key !== null) assert.ok(Engine.getBet(key), key + " at " + x + "," + y);
      }
    }
    assert.equal(board.hitTest(b.x0 - 0.1, 1), null);
    assert.equal(board.hitTest(12.5, 4), null, "below the 2 to 1 boxes is empty felt");
  });

  test(orientation + ": view coordinates convert both ways", function () {
    var board = Layout.createBoard(orientation);
    var scale = board.fit(800, 500);
    [[0, 0], [3.3, 1.7], [-0.5, 2.9], [12.4, 4.1]].forEach(function (p) {
      var v = board.toView(p[0], p[1], scale);
      var back = board.fromView(v.x, v.y, scale);
      assert.ok(Math.abs(back.x - p[0]) < 1e-9 && Math.abs(back.y - p[1]) < 1e-9, String(p));
      assert.ok(v.x >= -1e-9 && v.x <= scale.width + 1e-9 && v.y >= -1e-9 && v.y <= scale.height + 1e-9, String(p));
    });
  });

  test(orientation + ": the fitted table never exceeds its space and keeps cell shapes", function () {
    var board = Layout.createBoard(orientation);
    var spec = Layout.ORIENTATIONS[orientation];
    [[1200, 400], [800, 800], [340, 480], [300, 900], [900, 120]].forEach(function (size) {
      var scale = board.fit(size[0], size[1]);
      assert.ok(scale.width <= size[0] + 1e-6 && scale.height <= size[1] + 1e-6, String(size));
      var aspect = orientation === "horizontal" ? scale.sy / scale.sx : scale.sx / scale.sy;
      assert.ok(aspect >= spec.aspect[0] - 1e-9 && aspect <= spec.aspect[1] + 1e-9, size + " aspect " + aspect);
    });
  });
});

test("the vertical table is the horizontal one turned a quarter clockwise", function () {
  var board = Layout.createBoard("vertical");
  var scale = { sx: 30, sy: 80 };
  var zero = board.toView(-0.5, 1.5, scale);
  var thirtySix = board.toView(11.5, 0.5, scale);
  var one = board.toView(0.5, 2.5, scale);
  var three = board.toView(0.5, 0.5, scale);
  assert.ok(zero.y < one.y, "zero sits at the top");
  assert.ok(one.x < three.x, "1 2 3 read left to right");
  assert.ok(thirtySix.y > one.y, "36 is near the bottom");
  var dozen = board.toView(2, 3.3, scale);
  assert.ok(dozen.x < one.x, "the outside bets run down the left side");
});

test("line tolerances stay touch-friendly", function () {
  var board = Layout.createBoard("vertical");
  var tol = board.tolerance({ sx: 30, sy: 80 }, 9);
  assert.ok(tol.tx >= 0.19 && tol.tx <= 0.3);
  assert.equal(tol.ty, 0.19);
  // Near a line the split wins; in the middle of the cell, the number.
  assert.equal(board.hitTest(4.02, 1.5, tol.tx, tol.ty), "split:11-14");
  assert.equal(board.hitTest(4.5, 1.5, tol.tx, tol.ty), "straight:14");
});

test("the racetrack runs round the wheel in order", function () {
  var order = Layout.TRACK_ORDER;
  assert.equal(order.length, 37);
  var start = Engine.WHEEL.indexOf(order[0]);
  order.forEach(function (n, i) {
    assert.equal(n, Engine.WHEEL[(start + i) % 37], "position " + i);
  });
  ORIENTATIONS.forEach(function (orientation) {
    var track = Layout.createRacetrack(orientation);
    assert.equal(track.cells.length, 37);
    assert.deepEqual(track.sections.map(function (s) { return s.name; }), ["tiers", "orphelins", "voisins", "zero"]);
    var scale = track.fit(700, 160);
    track.cells.forEach(function (cell) {
      cell.points.forEach(function (p) {
        var v = track.toView(p.x, p.y, scale);
        assert.ok(v.x >= -1e-6 && v.x <= scale.width + 1e-6 && v.y >= -1e-6 && v.y <= scale.height + 1e-6, orientation + " " + cell.number);
      });
    });
  });
});

test("each racetrack section sits beside the numbers its call bet covers", function () {
  var track = Layout.createRacetrack("horizontal");
  function cellX(n) {
    var cell = track.cells.filter(function (c) { return c.number === n; })[0];
    return cell.label.x;
  }
  var tiers = Engine.announcedNumbers("tiers").map(cellX);
  var voisins = Engine.announcedNumbers("voisins").map(cellX);
  assert.ok(Math.max.apply(null, tiers) < Math.min.apply(null, voisins), "Tiers is left of Voisins");
  var zero = track.sections.filter(function (s) { return s.name === "zero"; })[0];
  assert.ok(zero.label.x > 13, "Jeu Zéro is at the zero end");
});
