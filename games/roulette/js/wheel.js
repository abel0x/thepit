/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 37 — the roulette wheel
   Four stacked canvases: a static bowl, the rotor (painted once and
   turned with a compositor transform), fixed lighting over the rotor
   and the ball, redrawn each frame. Everything is drawn locally.
   ========================================================= */
(function (global) {
  "use strict";

  var Engine = global.RouletteEngine;
  var Plan = global.SpinPlan;
  if (!Engine || !Plan) throw new Error("RouletteEngine and SpinPlan must load before wheel.js");

  var TAU = Math.PI * 2;
  var POCKET = TAU / Engine.POCKETS;
  var G = Plan.GEOMETRY;
  var R = {
    rimInner: 0.905,
    trackInner: 0.832,
    rotor: 0.705,
    rotorRim: 0.688,
    numberInner: 0.612,
    pocketInner: 0.514,
    coneOuter: 0.5,
    turret: 0.168,
    ball: 0.03
  };
  var MAX_BACKING = 1400;
  var FONT = "\"Table37 Sans\", \"Segoe UI\", system-ui, sans-serif";
  var POCKET_COLORS = {
    red: ["#c0161f", "#93101a", "#6d0a11"],
    black: ["#1b1b1d", "#0f0f10", "#060607"],
    green: ["#0c8a45", "#086a34", "#044823"]
  };

  function makeRandom(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function canvasAngle(theta) { return theta - Math.PI / 2; }

  function polar(cx, cy, radius, theta) {
    return { x: cx + radius * Math.sin(theta), y: cy - radius * Math.cos(theta) };
  }

  function ringPath(ctx, cx, cy, inner, outer) {
    ctx.beginPath();
    ctx.arc(cx, cy, outer, 0, TAU);
    ctx.arc(cx, cy, inner, 0, TAU, true);
    ctx.closePath();
  }

  function wedgePath(ctx, cx, cy, inner, outer, from, to) {
    ctx.beginPath();
    ctx.arc(cx, cy, outer, canvasAngle(from), canvasAngle(to));
    ctx.arc(cx, cy, inner, canvasAngle(to), canvasAngle(from), true);
    ctx.closePath();
  }

  function radial(ctx, cx, cy, stops, scale) {
    var gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale);
    stops.forEach(function (stop) { gradient.addColorStop(Math.max(0, Math.min(1, stop[0])), stop[1]); });
    return gradient;
  }

  // Turned metal: a conic sheen where supported, a soft linear one elsewhere.
  function metal(ctx, cx, cy, size, tones, turn) {
    if (typeof ctx.createConicGradient === "function") {
      var conic = ctx.createConicGradient(turn || 0, cx, cy);
      var lobes = tones.length;
      for (var i = 0; i <= lobes * 2; i++) conic.addColorStop(i / (lobes * 2), tones[i % lobes]);
      return conic;
    }
    var linear = ctx.createLinearGradient(cx - size, cy - size, cx + size, cy + size);
    tones.forEach(function (tone, index) { linear.addColorStop(index / Math.max(1, tones.length - 1), tone); });
    return linear;
  }

  // Concentric grain of lathe-turned wood.
  function woodGrain(ctx, cx, cy, inner, outer, random, count, scale) {
    ctx.save();
    ringPath(ctx, cx, cy, inner, outer);
    ctx.clip();
    for (var i = 0; i < count; i++) {
      var r = inner + random() * (outer - inner);
      var start = random() * TAU;
      var span = (0.25 + random() * 1.4) * Math.PI;
      var light = random() < 0.42;
      ctx.strokeStyle = light
        ? "rgba(255, 214, 160, " + (0.025 + random() * 0.06).toFixed(3) + ")"
        : "rgba(18, 6, 0, " + (0.05 + random() * 0.12).toFixed(3) + ")";
      ctx.lineWidth = Math.max(0.6, (0.4 + random() * 1.6) * scale);
      ctx.beginPath();
      ctx.arc(cx, cy, r, start, start + span);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Directional key light from the upper left, clipped to a ring.
  function keyLight(ctx, cx, cy, inner, outer, strength) {
    ctx.save();
    ringPath(ctx, cx, cy, inner, outer);
    ctx.clip();
    var light = ctx.createLinearGradient(cx - outer, cy - outer, cx + outer, cy + outer);
    light.addColorStop(0, "rgba(255, 238, 205, " + (0.22 * strength).toFixed(3) + ")");
    light.addColorStop(0.45, "rgba(255, 238, 205, 0)");
    light.addColorStop(0.6, "rgba(0, 0, 0, 0)");
    light.addColorStop(1, "rgba(0, 0, 0, " + (0.34 * strength).toFixed(3) + ")");
    ctx.fillStyle = light;
    ctx.fillRect(cx - outer, cy - outer, outer * 2, outer * 2);
    ctx.restore();
  }

  function glint(ctx, cx, cy, radius, from, to, width, alpha) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255, 246, 225, " + alpha + ")";
    ctx.lineWidth = width;
    ctx.shadowColor = "rgba(255, 240, 210, " + alpha + ")";
    ctx.shadowBlur = width * 3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, canvasAngle(from), canvasAngle(to));
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------- Static bowl ---------------- */
  function paintBowl(ctx, size) {
    var c = size / 2;
    var S = size / 2;
    var random = makeRandom(37);
    ctx.clearRect(0, 0, size, size);

    // Mahogany rim.
    ringPath(ctx, c, c, R.rimInner * S, S);
    ctx.fillStyle = radial(ctx, c, c, [
      [R.rimInner, "#2a1209"], [0.925, "#5b2b14"], [0.95, "#7a3a1b"], [0.975, "#5e2c14"], [0.995, "#341709"], [1, "#1c0b04"]
    ], S);
    ctx.fill();
    woodGrain(ctx, c, c, R.rimInner * S, S, random, 260, S / 300);
    keyLight(ctx, c, c, R.rimInner * S, S, 1);
    // Brass inlay and the polished inner lip.
    ctx.lineWidth = Math.max(1.2, 0.0065 * S);
    ctx.strokeStyle = metal(ctx, c, c, S, ["#f6e3a1", "#a77d2b", "#e9c66d", "#7c5a19"], -Math.PI / 3);
    ctx.beginPath(); ctx.arc(c, c, 0.952 * S, 0, TAU); ctx.stroke();
    ctx.lineWidth = Math.max(1, 0.0035 * S);
    ctx.strokeStyle = "rgba(0, 0, 0, .55)";
    ctx.beginPath(); ctx.arc(c, c, 0.912 * S, 0, TAU); ctx.stroke();
    ctx.strokeStyle = "rgba(255, 220, 170, .2)";
    ctx.beginPath(); ctx.arc(c, c, 0.918 * S, 0, TAU); ctx.stroke();

    // Ball track: deep lacquer with a long reflection.
    ringPath(ctx, c, c, R.trackInner * S, R.rimInner * S);
    ctx.fillStyle = radial(ctx, c, c, [
      [R.trackInner, "#0b0604"], [0.85, "#1c100a"], [0.885, "#26150c"], [R.rimInner, "#0d0705"]
    ], S);
    ctx.fill();
    keyLight(ctx, c, c, R.trackInner * S, R.rimInner * S, 0.8);
    glint(ctx, c, c, 0.874 * S, -1.05, -0.32, Math.max(1, 0.012 * S), 0.16);
    glint(ctx, c, c, 0.874 * S, 2.25, 2.7, Math.max(1, 0.008 * S), 0.06);
    ctx.lineWidth = Math.max(1, 0.004 * S);
    ctx.strokeStyle = "rgba(255, 214, 160, .16)";
    ctx.beginPath(); ctx.arc(c, c, R.trackInner * S, 0, TAU); ctx.stroke();

    // Sloped lower bowl with the eight deflectors.
    ringPath(ctx, c, c, R.rotor * S, R.trackInner * S);
    ctx.fillStyle = radial(ctx, c, c, [
      [R.rotor, "#120804"], [0.722, "#3a1d0d"], [0.76, "#5c3119"], [0.8, "#683a1f"], [R.trackInner, "#3b1e0d"]
    ], S);
    ctx.fill();
    woodGrain(ctx, c, c, R.rotor * S, R.trackInner * S, random, 140, S / 300);
    keyLight(ctx, c, c, R.rotor * S, R.trackInner * S, 0.9);
    for (var j = 0; j < G.deflectorCount; j++) {
      paintDeflector(ctx, c, S, G.deflectorOffset + j * TAU / G.deflectorCount, j % 2 === 0);
    }

    // The dark gap the rotor turns in.
    ringPath(ctx, c, c, (R.rotor - 0.012) * S, (R.rotor + 0.006) * S);
    ctx.fillStyle = "#050302";
    ctx.fill();
  }

  function paintDeflector(ctx, c, S, theta, radialLong) {
    var length = (radialLong ? 0.1 : 0.088) * S;
    var width = (radialLong ? 0.032 : 0.03) * S;
    var centre = polar(c, c, G.deflector * S, theta);
    ctx.save();
    ctx.translate(centre.x, centre.y);
    ctx.rotate(theta + (radialLong ? 0 : Math.PI / 2));
    ctx.shadowColor = "rgba(0, 0, 0, .6)";
    ctx.shadowBlur = 0.012 * S;
    ctx.shadowOffsetX = 0.006 * S;
    ctx.shadowOffsetY = 0.008 * S;
    ctx.beginPath();
    ctx.moveTo(0, -length / 2);
    ctx.lineTo(width / 2, 0);
    ctx.lineTo(0, length / 2);
    ctx.lineTo(-width / 2, 0);
    ctx.closePath();
    var steel = ctx.createLinearGradient(-width / 2, -length / 2, width / 2, length / 2);
    steel.addColorStop(0, "#fbfcfd");
    steel.addColorStop(0.35, "#b9c0c8");
    steel.addColorStop(0.5, "#eef1f4");
    steel.addColorStop(0.75, "#7b838c");
    steel.addColorStop(1, "#3f454b");
    ctx.fillStyle = steel;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = Math.max(0.8, 0.0025 * S);
    ctx.strokeStyle = "rgba(20, 22, 25, .7)";
    ctx.stroke();
    // Ridge line along the diamond.
    ctx.strokeStyle = "rgba(255, 255, 255, .55)";
    ctx.beginPath();
    ctx.moveTo(0, -length / 2 + 0.006 * S);
    ctx.lineTo(0, length / 2 - 0.006 * S);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------- Rotor (turned by CSS) ---------------- */
  function paintRotor(ctx, size, S) {
    var c = size / 2;
    var random = makeRandom(3701);
    ctx.clearRect(0, 0, size, size);

    // Rotor rim.
    ringPath(ctx, c, c, R.rotorRim * S, R.rotor * S);
    ctx.fillStyle = radial(ctx, c, c, [[R.rotorRim, "#2a140a"], [0.697, "#4f2713"], [R.rotor, "#1d0d06"]], S);
    ctx.fill();

    // Number ring.
    var fontSize = Math.max(7, 0.047 * S);
    for (var k = 0; k < Engine.POCKETS; k++) {
      var n = Engine.WHEEL[k];
      var tones = POCKET_COLORS[Engine.colorOf(n)];
      var from = k * POCKET - POCKET / 2;
      var to = k * POCKET + POCKET / 2;
      wedgePath(ctx, c, c, R.numberInner * S, R.rotorRim * S, from, to);
      ctx.fillStyle = radial(ctx, c, c, [[R.numberInner, tones[1]], [0.66, tones[0]], [R.rotorRim, tones[1]]], S);
      ctx.fill();

      wedgePath(ctx, c, c, R.pocketInner * S, R.numberInner * S, from, to);
      ctx.fillStyle = radial(ctx, c, c, [
        [R.pocketInner, tones[2]], [0.54, tones[1]], [0.575, tones[1]], [0.6, tones[2]], [R.numberInner, "#030303"]
      ], S);
      ctx.fill();

      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(k * POCKET);
      ctx.fillStyle = "#f8f3e6";
      ctx.font = "600 " + fontSize.toFixed(1) + "px " + FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0, 0, 0, .55)";
      ctx.shadowBlur = 0.004 * S;
      ctx.shadowOffsetY = 0.002 * S;
      ctx.fillText(String(n), 0, -0.651 * S);
      ctx.restore();
    }

    // Gold dividers between the numbers.
    ctx.lineCap = "butt";
    for (k = 0; k < Engine.POCKETS; k++) {
      var edge = k * POCKET + POCKET / 2;
      var a = polar(c, c, R.numberInner * S, edge);
      var b = polar(c, c, R.rotorRim * S, edge);
      ctx.strokeStyle = "rgba(226, 190, 104, .9)";
      ctx.lineWidth = Math.max(0.8, 0.0034 * S);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.strokeStyle = metal(ctx, c, c, S, ["#f1d98f", "#a47a27", "#e0bd62", "#80601d"], 0.4);
    ctx.lineWidth = Math.max(1, 0.0055 * S);
    ctx.beginPath(); ctx.arc(c, c, R.rotorRim * S, 0, TAU); ctx.stroke();
    ctx.lineWidth = Math.max(1, 0.0045 * S);
    ctx.beginPath(); ctx.arc(c, c, R.numberInner * S, 0, TAU); ctx.stroke();

    // Chrome frets between the pockets.
    for (k = 0; k < Engine.POCKETS; k++) {
      var wall = k * POCKET + POCKET / 2;
      var inner = polar(c, c, (R.pocketInner + 0.004) * S, wall);
      var outer = polar(c, c, (R.numberInner - 0.003) * S, wall);
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(0, 0, 0, .7)";
      ctx.lineWidth = Math.max(1.4, 0.0105 * S);
      ctx.beginPath(); ctx.moveTo(inner.x, inner.y); ctx.lineTo(outer.x, outer.y); ctx.stroke();
      ctx.strokeStyle = "#aeb5bd";
      ctx.lineWidth = Math.max(1, 0.0068 * S);
      ctx.beginPath(); ctx.moveTo(inner.x, inner.y); ctx.lineTo(outer.x, outer.y); ctx.stroke();
      ctx.strokeStyle = "rgba(255, 255, 255, .75)";
      ctx.lineWidth = Math.max(0.6, 0.0024 * S);
      ctx.beginPath(); ctx.moveTo(inner.x, inner.y); ctx.lineTo(outer.x, outer.y); ctx.stroke();
    }

    // Chrome ring at the foot of the cone.
    ringPath(ctx, c, c, R.coneOuter * S, R.pocketInner * S);
    ctx.fillStyle = metal(ctx, c, c, S, ["#eef1f4", "#7f878f", "#d3d8dd", "#5c636a"], 0.2);
    ctx.fill();

    // Lacquered cone with a fine inlay.
    ringPath(ctx, c, c, R.turret * S, R.coneOuter * S);
    ctx.fillStyle = radial(ctx, c, c, [
      [R.turret, "#1f0f06"], [0.2, "#3f200e"], [0.3, "#6c3a1b"], [0.42, "#5a2f15"], [0.48, "#3a1d0c"], [R.coneOuter, "#1d0e05"]
    ], S);
    ctx.fill();
    woodGrain(ctx, c, c, R.turret * S, R.coneOuter * S, random, 120, S / 320);
    ctx.save();
    ringPath(ctx, c, c, 0.215 * S, 0.43 * S);
    ctx.clip();
    for (k = 0; k < 8; k++) {
      var spoke = k * TAU / 8 + TAU / 16;
      var p0 = polar(c, c, 0.215 * S, spoke);
      var p1 = polar(c, c, 0.43 * S, spoke);
      ctx.strokeStyle = "rgba(232, 196, 120, .2)";
      ctx.lineWidth = Math.max(0.6, 0.003 * S);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(232, 196, 120, .55)";
    ctx.lineWidth = Math.max(0.8, 0.0035 * S);
    ctx.beginPath(); ctx.arc(c, c, 0.43 * S, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(c, c, 0.215 * S, 0, TAU); ctx.stroke();

    paintTurret(ctx, c, S);
  }

  function paintTurret(ctx, c, S) {
    // Spun-steel base.
    ctx.beginPath();
    ctx.arc(c, c, R.turret * S, 0, TAU);
    ctx.fillStyle = radial(ctx, c, c, [[0, "#f3f5f7"], [0.07, "#c9ced3"], [0.13, "#8b9299"], [R.turret, "#4d535a"]], S);
    ctx.fill();
    for (var i = 0; i < 9; i++) {
      ctx.strokeStyle = i % 2 ? "rgba(255, 255, 255, .14)" : "rgba(0, 0, 0, .12)";
      ctx.lineWidth = Math.max(0.5, 0.002 * S);
      ctx.beginPath(); ctx.arc(c, c, (0.07 + i * 0.011) * S, 0, TAU); ctx.stroke();
    }

    // Four arms with ball finials (they turn with the rotor, so their own
    // shading stays symmetrical; the fixed light layer adds the highlights).
    for (var arm = 0; arm < 4; arm++) {
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(arm * Math.PI / 2);
      var w0 = 0.042 * S, w1 = 0.024 * S, r0 = 0.05 * S, r1 = 0.285 * S;
      ctx.shadowColor = "rgba(0, 0, 0, .55)";
      ctx.shadowBlur = 0.014 * S;
      ctx.beginPath();
      ctx.moveTo(-w0 / 2, -r0);
      ctx.lineTo(-w1 / 2, -r1);
      ctx.lineTo(w1 / 2, -r1);
      ctx.lineTo(w0 / 2, -r0);
      ctx.closePath();
      var bar = ctx.createLinearGradient(-w0 / 2, 0, w0 / 2, 0);
      bar.addColorStop(0, "#4f565d");
      bar.addColorStop(0.3, "#c4cad0");
      bar.addColorStop(0.5, "#f7f9fa");
      bar.addColorStop(0.7, "#c4cad0");
      bar.addColorStop(1, "#4f565d");
      ctx.fillStyle = bar;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.lineWidth = Math.max(0.6, 0.0022 * S);
      ctx.strokeStyle = "rgba(25, 28, 31, .6)";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -r1 - 0.012 * S, 0.031 * S, 0, TAU);
      ctx.fillStyle = radial(ctx, 0, -r1 - 0.012 * S, [[0, "#ffffff"], [0.012, "#dfe3e7"], [0.024, "#8e959c"], [0.031, "#4c5258"]], S);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Centre cap.
    ctx.beginPath();
    ctx.arc(c, c, 0.07 * S, 0, TAU);
    ctx.fillStyle = radial(ctx, c, c, [[0, "#ffffff"], [0.03, "#e3e7ea"], [0.055, "#9aa1a8"], [0.07, "#596067"]], S);
    ctx.fill();
    ctx.lineWidth = Math.max(0.6, 0.0025 * S);
    ctx.strokeStyle = "rgba(20, 22, 25, .55)";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, c, 0.03 * S, 0, TAU);
    ctx.fillStyle = radial(ctx, c, c, [[0, "#f6e7b0"], [0.02, "#c9a24b"], [0.03, "#7c5b19"]], S);
    ctx.fill();
  }

  /* ---------------- Fixed light over the rotor ---------------- */
  function paintLight(ctx, size, S) {
    var c = size / 2;
    ctx.clearRect(0, 0, size, size);
    // Soft key light and the falling shadow on the far side.
    var key = ctx.createRadialGradient(c - 0.32 * S, c - 0.36 * S, 0, c - 0.32 * S, c - 0.36 * S, 0.9 * S);
    key.addColorStop(0, "rgba(255, 244, 222, .16)");
    key.addColorStop(0.5, "rgba(255, 244, 222, .04)");
    key.addColorStop(1, "rgba(255, 244, 222, 0)");
    ctx.fillStyle = key;
    ctx.beginPath(); ctx.arc(c, c, R.rotor * S, 0, TAU); ctx.fill();
    var shade = ctx.createRadialGradient(c + 0.34 * S, c + 0.38 * S, 0, c + 0.34 * S, c + 0.38 * S, 0.75 * S);
    shade.addColorStop(0, "rgba(0, 0, 0, .22)");
    shade.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = shade;
    ctx.beginPath(); ctx.arc(c, c, R.rotor * S, 0, TAU); ctx.fill();
    // Inner shadow cast by the bowl onto the rotor edge.
    ctx.save();
    ctx.beginPath(); ctx.arc(c, c, R.rotor * S, 0, TAU); ctx.clip();
    ctx.lineWidth = 0.03 * S;
    ctx.strokeStyle = "rgba(0, 0, 0, .35)";
    ctx.shadowColor = "rgba(0, 0, 0, .6)";
    ctx.shadowBlur = 0.03 * S;
    ctx.beginPath(); ctx.arc(c, c, R.rotor * S + 0.012 * S, 0, TAU); ctx.stroke();
    ctx.restore();
    // Reflections that stay put while the rotor turns.
    glint(ctx, c, c, 0.684 * S, -1.25, -0.55, Math.max(1, 0.006 * S), 0.38);
    glint(ctx, c, c, 0.507 * S, -1.2, -0.6, Math.max(1, 0.006 * S), 0.32);
    glint(ctx, c, c, 0.33 * S, -1.1, -0.55, Math.max(1, 0.02 * S), 0.06);
    var dome = ctx.createRadialGradient(c - 0.03 * S, c - 0.035 * S, 0, c - 0.03 * S, c - 0.035 * S, 0.06 * S);
    dome.addColorStop(0, "rgba(255, 255, 255, .7)");
    dome.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = dome;
    ctx.beginPath(); ctx.arc(c - 0.03 * S, c - 0.035 * S, 0.06 * S, 0, TAU); ctx.fill();
  }

  /* ---------------- Ball ---------------- */
  function paintBall(ctx, size, S, state, alpha, trail) {
    var c = size / 2;
    var h = Math.max(0, state.height || 0);
    var p = polar(c, c, state.radius * S, state.angle);
    var ballR = R.ball * S * (1 + 0.3 * h);

    ctx.save();
    ctx.globalAlpha = alpha;
    // Contact shadow, lengthening as the ball leaves the surface.
    var lift = (0.01 + 0.055 * h) * S;
    var sx = p.x + lift * 0.55;
    var sy = p.y + lift * 0.8;
    var shadowR = ballR * (1.2 + 0.6 * h);
    var shadow = ctx.createRadialGradient(sx, sy, 0, sx, sy, shadowR);
    shadow.addColorStop(0, "rgba(0, 0, 0, " + (0.55 - 0.28 * h).toFixed(3) + ")");
    shadow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = shadow;
    ctx.beginPath(); ctx.arc(sx, sy, shadowR, 0, TAU); ctx.fill();

    // Motion blur: one tapered streak along the path of the last frame.
    if (trail && trail.length > 1) {
      var tail = polar(c, c, trail[trail.length - 1].radius * S, trail[trail.length - 1].angle);
      var streak = ctx.createLinearGradient(tail.x, tail.y, p.x, p.y);
      streak.addColorStop(0, "rgba(240, 235, 224, 0)");
      streak.addColorStop(1, "rgba(240, 235, 224, .46)");
      ctx.strokeStyle = streak;
      ctx.lineWidth = ballR * 1.7;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      trail.forEach(function (ghost) {
        var q = polar(c, c, ghost.radius * S, ghost.angle);
        ctx.lineTo(q.x, q.y);
      });
      ctx.stroke();
    }

    var body = ctx.createRadialGradient(p.x - ballR * 0.38, p.y - ballR * 0.42, ballR * 0.05, p.x, p.y, ballR);
    body.addColorStop(0, "#ffffff");
    body.addColorStop(0.35, "#f3f0e9");
    body.addColorStop(0.78, "#cbc6ba");
    body.addColorStop(1, "#8b867b");
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(p.x, p.y, ballR, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(0.6, 0.0022 * S);
    ctx.strokeStyle = "rgba(40, 32, 22, .35)";
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, .95)";
    ctx.beginPath(); ctx.arc(p.x - ballR * 0.36, p.y - ballR * 0.4, ballR * 0.2, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ---------------- Component ---------------- */
  function create(host, options) {
    options = options || {};
    var doc = host.ownerDocument;
    var root = doc.createElement("div");
    root.className = "wheel-stack";
    var layers = {};
    ["bowl", "rotor", "light", "ball"].forEach(function (name) {
      var canvas = doc.createElement("canvas");
      canvas.className = "wheel-" + name;
      canvas.setAttribute("aria-hidden", "true");
      root.appendChild(canvas);
      layers[name] = canvas;
    });
    host.appendChild(root);

    var reducedMotion = !!options.reducedMotion;
    var overscale = 1;
    var backing = 0;
    var cssSize = 0;
    var motion = restingRotor(Math.random() * TAU);
    var motionStart = now();
    var current = null;          // { plan, start, fired, resolve, onEvent, onRoll, fadeFrom }
    var restPocket = null;       // pocket index of the resting ball, if shown
    var ballFade = null;         // { start, from: state } while a resting ball is lifted
    var trail = [];
    var rafId = 0;
    var running = false;
    var renderTimer = 0;

    function now() { return global.performance && performance.now ? performance.now() : Date.now(); }

    // Between spins the rotor drifts gently; with reduced motion it stands still.
    function restingRotor(angle) {
      if (reducedMotion) return { angle: function () { return angle; }, speed: function () { return 0; } };
      return Plan.idleRotor(angle, -Plan.ROTOR.idle, -1);
    }

    function rotorAngle(t) {
      return motion.angle((t - motionStart) / 1000);
    }

    function render() {
      // Layout size, not the on-screen box: CSS may scale the wheel up or down.
      var size = Math.round(Math.min(host.clientWidth, host.clientHeight || host.clientWidth));
      if (!(size > 0)) return;
      var dpr = Math.min(global.devicePixelRatio || 1, 2.5);
      var next = Math.min(MAX_BACKING, Math.round(size * dpr * overscale));
      if (next === backing && size === cssSize) return;
      backing = next;
      cssSize = size;
      var S = backing / 2;
      var rotorBacking = Math.round(backing * R.rotor);
      layers.bowl.width = layers.bowl.height = backing;
      layers.ball.width = layers.ball.height = backing;
      layers.rotor.width = layers.rotor.height = rotorBacking;
      layers.light.width = layers.light.height = rotorBacking;
      paintBowl(layers.bowl.getContext("2d"), backing);
      paintRotor(layers.rotor.getContext("2d"), rotorBacking, S);
      paintLight(layers.light.getContext("2d"), rotorBacking, S);
      draw(now());
    }

    function scheduleRender() {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(render, 90);
    }

    function draw(time) {
      if (!backing) return;
      var angle = rotorAngle(time);
      var wrapped = ((angle % TAU) + TAU) % TAU;
      layers.rotor.style.transform = "rotate(" + wrapped.toFixed(5) + "rad)";

      var ctx = layers.ball.getContext("2d");
      ctx.clearRect(0, 0, backing, backing);
      var S = backing / 2;

      if (ballFade) {
        var fade = Math.min(1, (time - ballFade.start) / 200);
        var pocketAngle = angle + ballFade.pocket * POCKET;
        paintBall(ctx, backing, S, { angle: pocketAngle, radius: G.pocket, height: 0.25 * fade }, 1 - fade, null);
        if (fade >= 1) ballFade = null;
      }

      if (current) {
        var t = (time - current.start) / 1000;
        var state = current.plan.ball(t);
        // Keep a few previous positions for motion blur while the ball is fast.
        var speedTrail = [];
        if (state.rolling && !reducedMotion) {
          for (var g = 1; g <= 8; g++) speedTrail.push(current.plan.ball(Math.max(0, t - g * 0.0029)));
        }
        var alpha = Math.min(1, t / 0.15);
        paintBall(ctx, backing, S, state, alpha, speedTrail);
        fireEvents(t);
        if (current.onRoll) current.onRoll(current.plan.roll(t));
        if (t >= current.plan.duration) finish();
      } else if (restPocket != null && !ballFade) {
        paintBall(ctx, backing, S, { angle: angle + restPocket * POCKET, radius: G.pocket, height: 0 }, 1, null);
      }
    }

    function fireEvents(t) {
      var events = current.plan.events;
      while (current.fired < events.length && events[current.fired].t <= t) {
        var event = events[current.fired++];
        if (current.onEvent) {
          // Events that fell due while the tab was hidden stay silent.
          try { current.onEvent(event.type, { late: t - event.t > 0.25, strength: event.strength || 1 }); } catch (e) {}
        }
      }
    }

    function finish() {
      var done = current;
      // Continue the rotor exactly where the spin's push left it.
      motion = { angle: done.plan.rotorAngle, speed: done.plan.rotorSpeed };
      motionStart = done.start;
      restPocket = done.plan.target;
      current = null;
      if (done.onRoll) done.onRoll(0);
      done.resolve(Engine.WHEEL[done.plan.target]);
    }

    function loop(time) {
      rafId = 0;
      draw(time);
      if (running) rafId = global.requestAnimationFrame(loop);
    }

    function start() {
      if (running) return;
      running = true;
      rafId = global.requestAnimationFrame(loop);
    }

    function stop() {
      running = false;
      if (rafId) global.cancelAnimationFrame(rafId);
      rafId = 0;
    }

    function updateRunning() {
      // A still wheel needs no frames; reduced motion keeps it still.
      if (current || !reducedMotion) start();
      else { stop(); draw(now()); }
    }

    function currentRotor(time) {
      var t = (time - motionStart) / 1000;
      return { angle: motion.angle(t), speed: motion.speed ? motion.speed(t) : 0 };
    }

    var api = {
      element: root,
      render: render,
      spin: function (number, spinOptions) {
        spinOptions = spinOptions || {};
        if (current) return Promise.reject(new Error("The wheel is already spinning"));
        var target = Engine.wheelIndexOf(number);
        var time = now();
        if (reducedMotion) {
          restPocket = target;
          draw(time);
          return new Promise(function (resolve) {
            setTimeout(function () {
              if (spinOptions.onEvent) {
                try { spinOptions.onEvent("settle", { late: false, strength: 1 }); } catch (e) {}
              }
              resolve(number);
            }, 280);
          });
        }
        var rotor = currentRotor(time);
        var plan = Plan.plan({
          target: target,
          rotorAngle: ((rotor.angle % TAU) + TAU) % TAU,
          rotorSpeed: rotor.speed,
          rotorDirection: -1,
          pace: spinOptions.pace || 1,
          random: spinOptions.random
        });
        if (restPocket != null) ballFade = { start: time, pocket: restPocket };
        restPocket = null;
        return new Promise(function (resolve) {
          current = {
            plan: plan,
            start: time,
            fired: 0,
            resolve: resolve,
            onEvent: spinOptions.onEvent,
            onRoll: spinOptions.onRoll
          };
          updateRunning();
        });
      },
      // Shows the ball resting in a number's pocket without a spin.
      place: function (number) {
        restPocket = number == null ? null : Engine.wheelIndexOf(number);
        draw(now());
      },
      isSpinning: function () { return !!current; },
      setReducedMotion: function (value) {
        value = !!value;
        if (value === reducedMotion) return;
        var time = now();
        var rotor = currentRotor(time);
        reducedMotion = value;
        motion = restingRotor(rotor.angle);
        motionStart = time;
        updateRunning();
      },
      // Paints at a higher resolution when CSS will enlarge the wheel.
      setOverscale: function (value) {
        value = Math.max(1, Math.min(4, Number(value) || 1));
        if (Math.abs(value - overscale) < 0.05) return;
        overscale = value;
        backing = 0;
        render();
      },
      pause: stop,
      resume: updateRunning
    };

    if (typeof global.ResizeObserver === "function") {
      new global.ResizeObserver(scheduleRender).observe(host);
    } else {
      global.addEventListener("resize", scheduleRender);
    }
    if (doc.fonts && typeof doc.fonts.load === "function") {
      // Repaint the numbers once the bundled face is ready.
      doc.fonts.load("600 32px \"Table37 Sans\"").then(function () { backing = 0; render(); }, function () {});
    }
    render();
    updateRunning();
    return api;
  }

  global.RouletteWheel = { create: create, RADII: R };
})(window);
