/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 37 — pure spin choreography
   The winning number is drawn first (RouletteEngine.spin). This
   module then plans a physically plausible ball run that ends in
   that pocket: launch on the ball track, deceleration, the drop
   past a deflector, a few hops across the frets and the settle.
   Angles are radians clockwise from twelve o'clock; radii are a
   fraction of the wheel's outer radius. Exposed as window.SpinPlan.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SpinPlan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var TAU = Math.PI * 2;
  var POCKETS = 37;
  var POCKET = TAU / POCKETS;

  var GEOMETRY = {
    track: 0.873,        // ball centre while it circles the ball track
    deflector: 0.772,    // ring of diamond deflectors
    land: 0.648,         // first contact with the turning rotor
    pocket: 0.567,       // ball centre at rest in a pocket
    deflectorCount: 8,
    deflectorOffset: Math.PI / 8
  };

  var ROTOR = {
    idle: 0.065 * TAU,   // gentle drift between spins (rad/s)
    push: 0.34 * TAU,    // after the croupier's push
    rise: 0.45,          // seconds to take up the push
    decay: 11            // seconds for the push to fade
  };

  function mod(value, base) { return ((value % base) + base) % base; }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  // Rotor speed follows the croupier's push and settles back to an idle drift.
  // Closed form, so the planner can see exactly where every pocket will be.
  function rotorMotion(start, speed, direction, pushed) {
    var idle = ROTOR.idle * direction;
    var push = pushed ? ROTOR.push * direction : idle;
    var current = isFinite(speed) ? speed : idle;
    return {
      angle: function (t) {
        if (t <= 0) return start;
        return start + idle * t +
          (push - idle) * ROTOR.decay * (1 - Math.exp(-t / ROTOR.decay)) -
          (push - current) * ROTOR.rise * (1 - Math.exp(-t / ROTOR.rise));
      },
      speed: function (t) {
        if (t <= 0) return current;
        return idle + (push - idle) * Math.exp(-t / ROTOR.decay) - (push - current) * Math.exp(-t / ROTOR.rise);
      }
    };
  }

  function idleRotor(start, speed, direction) {
    return rotorMotion(start, speed, direction, false);
  }

  function smoothstep(u) { return u * u * (3 - 2 * u); }

  // options: target pocket index (0-36, position on the wheel), rotorAngle,
  // rotorSpeed (rad/s, signed), rotorDirection (+1 / -1), pace (1 = normal),
  // random() for cosmetic variety. Fairness never depends on random().
  function plan(options) {
    options = options || {};
    var random = typeof options.random === "function" ? options.random : Math.random;
    var pace = clamp(Number(options.pace) || 1, 0.4, 2);
    var target = Math.floor(Number(options.target));
    if (!(target >= 0 && target < POCKETS)) throw new RangeError("target must be a pocket index from 0 to 36");
    var rotorDirection = options.rotorDirection === 1 ? 1 : -1;
    var ballDirection = -rotorDirection;
    var rotor = rotorMotion(Number(options.rotorAngle) || 0, Number(options.rotorSpeed), rotorDirection, true);
    function vary(spread) { return 1 + (random() * 2 - 1) * spread; }

    /* Phase 1 — the ball circles the track, slowing steadily. */
    var w0 = 1.72 * TAU * vary(0.08);
    var w1 = 0.6 * TAU * vary(0.06);
    var T1 = 3.25 * pace * vary(0.07);
    var decel = (w0 - w1) / T1;
    /* Phase 2 — it leaves the track and runs down the bowl. */
    var drop = 0.95 * Math.sqrt(pace) * vary(0.06);
    var w2 = 0.44 * TAU * vary(0.06);
    var T2 = T1 + drop;
    var hitsDeflector = random() < 0.72;
    var hitAt = T1 + drop * (0.42 + random() * 0.12);

    function trackTravel(t) {
      if (t <= T1) return w0 * t - decel * t * t / 2;
      var head = w0 * T1 - decel * T1 * T1 / 2;
      var u = Math.min(t, T2) - T1;
      return head + w1 * u - (w1 - w2) * u * u / (2 * drop);
    }

    // Choose where the ball leaves the croupier's hand so that it meets a
    // deflector on the way down and still finishes in the target pocket.
    var minHops = 3.2 * POCKET;
    var spacing = TAU / GEOMETRY.deflectorCount;
    var targetAngle = target * POCKET;
    var launch, travel;
    var rotorAtLanding = rotor.angle(T2);
    if (hitsDeflector) {
      var best = null;
      for (var j = 0; j < GEOMETRY.deflectorCount; j++) {
        var deflector = GEOMETRY.deflectorOffset + j * spacing;
        var start = deflector - ballDirection * trackTravel(hitAt);
        var relative = start + ballDirection * trackTravel(T2) - rotorAtLanding;
        var distance = mod(ballDirection * (targetAngle - relative), TAU);
        if (distance >= minHops && distance < minHops + spacing) { best = { start: start, distance: distance }; break; }
      }
      if (!best) {
        // Floating-point edge: fall back to the deflector-free solution below.
        hitsDeflector = false;
      } else {
        launch = best.start;
        travel = best.distance;
      }
    }
    if (!hitsDeflector) {
      travel = minHops + random() * spacing;
      launch = targetAngle - ballDirection * travel - ballDirection * trackTravel(T2) + rotorAtLanding;
    }
    launch = mod(launch, TAU);
    // Unwrapped angles keep the ball's path continuous through every phase.
    var landingRelative = launch + ballDirection * trackTravel(T2) - rotorAtLanding;
    var finalRelative = landingRelative + ballDirection * travel;

    /* Phase 3 — hops across the frets, measured in the rotor's frame. */
    var hopCount = 3 + Math.floor(random() * 3);
    var ratio = 0.42 + random() * 0.16;
    var weights = [];
    var weightSum = 0;
    for (var h = 0; h < hopCount; h++) { weights.push(Math.pow(ratio, h)); weightSum += weights[h]; }
    var hops = [];
    var clock = T2;
    var covered = 0;
    var relativeSpeed = Math.abs(ballDirection * w2 - rotor.speed(T2));
    weights.forEach(function (weight, index) {
      var length = travel * weight / weightSum;
      var duration = index === 0
        ? clamp(length / relativeSpeed, 0.16, 0.42)
        : clamp(0.24 * Math.sqrt(length / POCKET), 0.08, 0.34);
      duration *= Math.sqrt(pace);
      hops.push({
        start: clock,
        end: clock + duration,
        from: covered,
        to: covered + length,
        height: index === 0 ? 1 : clamp(0.82 * Math.sqrt(weight), 0.12, 0.8)
      });
      clock += duration;
      covered += length;
    });
    var hopsEnd = clock;
    var settle = 0.55 * Math.sqrt(pace);
    var T3 = hopsEnd + settle;
    var rockAmplitude = POCKET * (0.18 + random() * 0.1);

    function relativeAt(t) {
      if (t >= T3) return finalRelative;
      if (t >= hopsEnd) {
        var s = t - hopsEnd;
        // The ball rocks against the pocket walls and comes to rest.
        return finalRelative + ballDirection * rockAmplitude * Math.exp(-s / (settle * 0.28)) * Math.sin(s * 22) * (1 - s / settle);
      }
      for (var i = 0; i < hops.length; i++) {
        var hop = hops[i];
        if (t <= hop.end) {
          var u = (t - hop.start) / (hop.end - hop.start);
          return landingRelative + ballDirection * (hop.from + (hop.to - hop.from) * u);
        }
      }
      return finalRelative;
    }

    function heightAt(t) {
      if (hitsDeflector && t >= hitAt && t <= hitAt + 0.2 * Math.sqrt(pace)) {
        var d = (t - hitAt) / (0.2 * Math.sqrt(pace));
        return 0.55 * Math.sin(Math.PI * d);
      }
      if (t < T2 || t >= hopsEnd) return 0;
      for (var i = 0; i < hops.length; i++) {
        var hop = hops[i];
        if (t <= hop.end) {
          var u = (t - hop.start) / (hop.end - hop.start);
          return hop.height * 4 * u * (1 - u);
        }
      }
      return 0;
    }

    function radiusAt(t) {
      if (t <= T1) return GEOMETRY.track + 0.004 * Math.sin(t * 9.1) * Math.min(1, t);
      if (t <= T2) {
        var u = (t - T1) / drop;
        var r = GEOMETRY.track - (GEOMETRY.track - GEOMETRY.land) * u * u;
        if (hitsDeflector && t >= hitAt) {
          var d = (t - hitAt) / (0.2 * Math.sqrt(pace));
          if (d <= 1) r += 0.03 * Math.sin(Math.PI * d);
        }
        return r;
      }
      if (t >= hopsEnd) return GEOMETRY.pocket;
      var first = hops[0];
      if (t <= first.end) {
        var v = (t - first.start) / (first.end - first.start);
        return GEOMETRY.land + (GEOMETRY.pocket - GEOMETRY.land) * smoothstep(v) + 0.012 * Math.sin(Math.PI * v);
      }
      return GEOMETRY.pocket + 0.014 * heightAt(t);
    }

    function ballAngle(t) {
      if (t <= T2) return launch + ballDirection * trackTravel(Math.max(0, t));
      return rotor.angle(t) + relativeAt(t);
    }

    var events = [{ t: 0, type: "launch" }];
    if (hitsDeflector) events.push({ t: hitAt, type: "deflector" });
    events.push({ t: T2, type: "land", strength: 1 });
    hops.slice(1).forEach(function (hop, index) {
      events.push({ t: hop.start, type: "hop", strength: hop.height, index: index + 1 });
    });
    events.push({ t: hopsEnd, type: "pocket" });
    events.push({ t: T3, type: "settle" });

    return {
      target: target,
      targetAngle: targetAngle,
      launchAngle: launch,
      ballDirection: ballDirection,
      rotorDirection: rotorDirection,
      deflectorHit: hitsDeflector,
      hopDistance: travel,
      hops: hops,
      times: { track: T1, land: T2, pocket: hopsEnd, settle: T3 },
      duration: T3,
      events: events,
      rotorAngle: rotor.angle,
      rotorSpeed: rotor.speed,
      ball: function (t) {
        return {
          angle: ballAngle(t),
          radius: radiusAt(t),
          height: heightAt(t),
          rolling: t < T2,
          resting: t >= T3
        };
      },
      // Roll intensity for the sound of the ball on the track (0..1).
      roll: function (t) {
        if (t < 0 || t >= T2) return 0;
        var speed = t <= T1 ? w0 - decel * t : w1 - (w1 - w2) * (t - T1) / drop;
        return clamp(speed / w0, 0, 1);
      }
    };
  }

  // Which pocket index sits under a world angle for a given rotor angle.
  function pocketUnder(angle, rotorAngle) {
    return Math.round(mod(angle - rotorAngle, TAU) / POCKET) % POCKETS;
  }

  return {
    TAU: TAU,
    POCKETS: POCKETS,
    POCKET_ANGLE: POCKET,
    GEOMETRY: GEOMETRY,
    ROTOR: ROTOR,
    plan: plan,
    idleRotor: idleRotor,
    pocketUnder: pocketUnder
  };
});
