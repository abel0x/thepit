/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/roulette/js/engine.js");
var Spin = require("../../games/roulette/js/spin.js");

var TAU = Math.PI * 2;

function seeded(seed) {
  return function () {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function wrap(angle) { return ((angle % TAU) + TAU) % TAU; }

function angularError(a, b) {
  var d = Math.abs(wrap(a) - wrap(b));
  return Math.min(d, TAU - d);
}

test("the ball comes to rest in the drawn pocket, every pocket, every pace", function () {
  var random = seeded(7);
  [0.62, 1, 1.4].forEach(function (pace) {
    for (var target = 0; target < 37; target++) {
      for (var run = 0; run < 6; run++) {
        var plan = Spin.plan({
          target: target,
          rotorAngle: random() * 40 - 20,
          rotorSpeed: -random(),
          rotorDirection: -1,
          pace: pace,
          random: random
        });
        var end = plan.ball(plan.duration);
        var rotor = plan.rotorAngle(plan.duration);
        assert.ok(angularError(end.angle - rotor, target * Spin.POCKET_ANGLE) < 1e-9, "pocket " + target);
        assert.equal(Spin.pocketUnder(end.angle, rotor), target);
        assert.equal(Engine.WHEEL[Spin.pocketUnder(end.angle, rotor)], Engine.WHEEL[target]);
        assert.equal(end.radius, Spin.GEOMETRY.pocket);
        assert.equal(end.height, 0);
        assert.ok(end.resting);
        // Afterwards the ball simply rides the rotor.
        var later = plan.ball(plan.duration + 3);
        assert.ok(angularError(later.angle - plan.rotorAngle(plan.duration + 3), target * Spin.POCKET_ANGLE) < 1e-9);
      }
    }
  });
});

test("a deflector strike always meets one of the eight diamonds", function () {
  var random = seeded(99);
  var hits = 0;
  for (var i = 0; i < 400; i++) {
    var plan = Spin.plan({ target: i % 37, rotorAngle: i, rotorSpeed: -0.4, rotorDirection: -1, pace: 1, random: random });
    if (!plan.deflectorHit) continue;
    hits++;
    var event = plan.events.filter(function (e) { return e.type === "deflector"; })[0];
    var angle = plan.ball(event.t).angle - Spin.GEOMETRY.deflectorOffset;
    var spacing = TAU / Spin.GEOMETRY.deflectorCount;
    var offset = ((angle % spacing) + spacing) % spacing;
    assert.ok(Math.min(offset, spacing - offset) < 1e-9);
  }
  assert.ok(hits > 200, "most spins strike a deflector (" + hits + ")");
});

test("the ball's path is continuous, with no jumps between phases", function () {
  var random = seeded(3);
  for (var i = 0; i < 60; i++) {
    var plan = Spin.plan({ target: i % 37, rotorAngle: random() * 6, rotorSpeed: -0.5, rotorDirection: -1, pace: 1, random: random });
    var dt = 0.002;
    var previous = plan.ball(0);
    for (var t = dt; t <= plan.duration + 0.2; t += dt) {
      var now = plan.ball(t);
      // Never faster than the launch speed of about two turns a second.
      assert.ok(Math.abs(now.angle - previous.angle) / dt < 2 * TAU, "angle jump at " + t);
      assert.ok(Math.abs(now.radius - previous.radius) / dt < 3, "radius jump at " + t);
      previous = now;
    }
  }
});

test("the ball runs on the track, drops past the deflectors and lands in the pockets", function () {
  var plan = Spin.plan({ target: 12, rotorAngle: 0, rotorSpeed: -0.4, rotorDirection: -1, pace: 1, random: seeded(11) });
  var g = Spin.GEOMETRY;
  assert.ok(Math.abs(plan.ball(0.5).radius - g.track) < 0.01);
  assert.ok(plan.ball(0.5).rolling);
  assert.ok(plan.ball(plan.times.land).radius <= g.land + 1e-9);
  assert.ok(plan.ball(plan.times.pocket + 0.01).radius === g.pocket);
  assert.ok(plan.hopDistance >= 3.2 * Spin.POCKET_ANGLE - 1e-9 && plan.hopDistance < 3.2 * Spin.POCKET_ANGLE + TAU / 8 + 1e-9);
  assert.ok(plan.hops.length >= 3 && plan.hops.length <= 5);
  for (var i = 1; i < plan.hops.length; i++) {
    assert.ok(plan.hops[i].to - plan.hops[i].from < plan.hops[i - 1].to - plan.hops[i - 1].from, "hops get shorter");
  }
  assert.ok(plan.roll(0.2) > plan.roll(plan.times.track - 0.1), "the roll fades as the ball slows");
  assert.equal(plan.roll(plan.times.land + 0.01), 0);
});

test("the ball travels against the rotor and the rotor keeps turning after", function () {
  var plan = Spin.plan({ target: 0, rotorAngle: 1, rotorSpeed: -0.4, rotorDirection: -1, pace: 1, random: seeded(5) });
  assert.equal(plan.rotorDirection, -1);
  assert.equal(plan.ballDirection, 1);
  assert.ok(plan.ball(0.6).angle > plan.ball(0.5).angle, "the ball turns clockwise");
  assert.ok(plan.rotorSpeed(1) < 0, "the rotor turns anticlockwise");
  assert.ok(plan.rotorSpeed(plan.duration + 60) < 0, "and never stops dead");
  assert.equal(plan.rotorAngle(0), 1);
  assert.ok(Math.abs(plan.rotorSpeed(0) + 0.4) < 1e-12, "it starts from the current speed");
});

test("events arrive in order and the durations follow the chosen pace", function () {
  var random = seeded(17);
  var fast = Spin.plan({ target: 5, pace: 0.62, random: random });
  var slow = Spin.plan({ target: 5, pace: 1.4, random: random });
  assert.ok(fast.duration < slow.duration);
  assert.ok(fast.duration > 2.5 && slow.duration < 10);
  [fast, slow].forEach(function (plan) {
    var types = plan.events.map(function (e) { return e.type; });
    assert.equal(types[0], "launch");
    assert.equal(types[types.length - 1], "settle");
    assert.ok(types.indexOf("land") < types.indexOf("pocket"));
    for (var i = 1; i < plan.events.length; i++) assert.ok(plan.events[i].t >= plan.events[i - 1].t);
  });
  assert.throws(function () { Spin.plan({ target: 37 }); }, RangeError);
});

test("an idle rotor drifts slowly in its own direction", function () {
  var idle = Spin.idleRotor(2, -Spin.ROTOR.idle, -1);
  assert.equal(idle.angle(0), 2);
  assert.ok(Math.abs(idle.speed(10) + Spin.ROTOR.idle) < 1e-9);
  assert.ok(idle.angle(10) < 2);
});
