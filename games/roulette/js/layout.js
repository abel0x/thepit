/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 37 — pure betting-layout and racetrack geometry
   Abstract coordinates, hit-testing and chip anchors for the
   horizontal (desktop) and vertical (phone) table, plus the
   French racetrack. Exposed as window.BoardLayout and CommonJS.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BoardLayout = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ---------------- Betting layout ----------------
     Abstract board, drawn as a casino layout seen from the player's side:
       numbers   x 0..12, y 0..3   (cell c,r; row 0 holds 3, 6 … 36)
       zero      x -1..0, y 0..3
       columns   x 12..13 ("2 to 1"), one per row
       dozens    y 3..3+dozenDepth, four cells each
       even money below the dozens, two cells each
     The vertical layout is the same table turned a quarter clockwise:
     zero at the top, dozens and even-money bets down the left side. */
  var ORIENTATIONS = {
    horizontal: { zeroWidth: 1, dozenDepth: 0.78, evenDepth: 0.78, columnWidth: 1, aspect: [0.95, 1.3] },
    vertical: { zeroWidth: 1.1, dozenDepth: 0.62, evenDepth: 0.62, columnWidth: 1.1, aspect: [0.36, 0.72] }
  };
  var EVEN_ORDER = ["low", "even", "red", "black", "odd", "high"];

  function numberAt(c, r) { return 3 * c + (3 - r); }
  function cellOf(n) { return { c: Math.floor((n - 1) / 3), r: 2 - ((n - 1) % 3) }; }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function sorted(list) { return list.slice().sort(function (a, b) { return a - b; }); }

  function insideKey(type, numbers) { return type + ":" + sorted(numbers).join("-"); }

  function createBoard(orientation) {
    var spec = ORIENTATIONS[orientation];
    if (!spec) throw new RangeError("Unknown orientation: " + orientation);
    var zw = spec.zeroWidth;
    var dh = spec.dozenDepth;
    var eh = spec.evenDepth;
    var cw = spec.columnWidth;
    var bounds = { x0: -zw, x1: 12 + cw, y0: 0, y1: 3 + dh + eh };
    var spanX = bounds.x1 - bounds.x0;
    var spanY = bounds.y1 - bounds.y0;

    var cells = [];
    cells.push({ id: "n0", kind: "zero", key: "straight:0", number: 0, x: -zw, y: 0, w: zw, h: 3 });
    for (var c = 0; c < 12; c++) {
      for (var r = 0; r < 3; r++) {
        var n = numberAt(c, r);
        cells.push({ id: "n" + n, kind: "number", key: "straight:" + n, number: n, x: c, y: r, w: 1, h: 1 });
      }
    }
    for (r = 0; r < 3; r++) {
      cells.push({ id: "col" + (3 - r), kind: "column", key: "column:" + (3 - r), x: 12, y: r, w: cw, h: 1 });
    }
    for (var d = 1; d <= 3; d++) {
      cells.push({ id: "doz" + d, kind: "dozen", key: "dozen:" + d, x: (d - 1) * 4, y: 3, w: 4, h: dh });
    }
    EVEN_ORDER.forEach(function (key, index) {
      cells.push({ id: key, kind: "even", key: key, x: index * 2, y: 3 + dh, w: 2, h: eh });
    });

    // Where a chip sits for every bet: on the cell, line or line crossing.
    function anchor(key) {
      var colon = key.indexOf(":");
      var type = colon === -1 ? key : key.slice(0, colon);
      var nums = colon === -1 ? [] : key.slice(colon + 1).split("-").map(Number);
      var first = nums.length ? cellOf(nums[0] || nums[1]) : null;
      switch (type) {
        case "straight":
          if (nums[0] === 0) return { x: -zw / 2, y: 1.5 };
          return { x: first.c + 0.5, y: first.r + 0.5 };
        case "split":
          if (nums[0] === 0) return { x: 0, y: cellOf(nums[1]).r + 0.5 };
          if (nums[1] - nums[0] === 1) return { x: first.c + 0.5, y: first.r };
          return { x: first.c + 1, y: first.r + 0.5 };
        case "street":
          return { x: first.c + 0.5, y: 3 };
        case "trio":
          return { x: 0, y: nums[1] === 1 ? 2 : 1 };
        case "firstFour":
          return { x: 0, y: 3 };
        case "corner":
          return { x: first.c + 1, y: first.r };
        case "sixLine":
          return { x: first.c + 1, y: 3 };
        case "column":
          return { x: 12 + cw / 2, y: 3 - nums[0] + 0.5 };
        case "dozen":
          return { x: (nums[0] - 1) * 4 + 2, y: 3 + dh / 2 };
        default:
          var index = EVEN_ORDER.indexOf(type);
          if (index === -1) return null;
          return { x: index * 2 + 1, y: 3 + dh + eh / 2 };
      }
    }

    // Maps a point to the bet a chip dropped there would make. tx and ty are
    // how close (in cells) a point must be to a line to bet across it.
    function hitTest(x, y, tx, ty) {
      tx = tx == null ? 0.24 : tx;
      ty = ty == null ? 0.24 : ty;
      if (!(x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1)) return null;

      if (y > 3 + ty * 0.5) {
        if (x < 0 || x > 12) return null;
        if (y <= 3 + dh) return "dozen:" + clamp(Math.floor(x / 4) + 1, 1, 3);
        return EVEN_ORDER[clamp(Math.floor(x / 2), 0, 5)];
      }
      if (x > 12) return "column:" + (3 - clamp(Math.floor(y), 0, 2));

      var i = Math.round(x);
      var j = Math.round(y);
      var nearV = Math.abs(x - i) < tx && i >= 0 && i <= 11;
      var nearH = Math.abs(y - j) < ty && j >= 1 && j <= 3;
      if (x < 0 && !nearV) return "straight:0";

      var col = clamp(Math.floor(x), 0, 11);
      var row = clamp(Math.floor(y), 0, 2);
      if (nearV && nearH) {
        if (j === 3) {
          if (i === 0) return "firstFour:0-1-2-3";
          return insideKey("sixLine", [3 * (i - 1) + 1, 3 * (i - 1) + 2, 3 * (i - 1) + 3, 3 * i + 1, 3 * i + 2, 3 * i + 3]);
        }
        if (i === 0) return j === 1 ? "trio:0-2-3" : "trio:0-1-2";
        return insideKey("corner", [numberAt(i - 1, j - 1), numberAt(i - 1, j), numberAt(i, j - 1), numberAt(i, j)]);
      }
      if (nearV) {
        if (i === 0) return insideKey("split", [0, numberAt(0, row)]);
        return insideKey("split", [numberAt(i - 1, row), numberAt(i, row)]);
      }
      if (nearH) {
        if (j === 3) return insideKey("street", [numberAt(col, 2), numberAt(col, 1), numberAt(col, 0)]);
        return insideKey("split", [numberAt(col, j - 1), numberAt(col, j)]);
      }
      if (y > 3) return insideKey("street", [numberAt(col, 2), numberAt(col, 1), numberAt(col, 0)]);
      return "straight:" + numberAt(col, row);
    }

    // Chooses pixels per abstract unit so the table fills w × h while every
    // number cell keeps a believable shape (height / width within aspect).
    function fit(w, h) {
      w = Math.max(1, Number(w) || 1);
      h = Math.max(1, Number(h) || 1);
      var lo = spec.aspect[0];
      var hi = spec.aspect[1];
      var sx, sy;
      if (orientation === "horizontal") {
        sx = w / spanX;
        sy = clamp(h / spanY, sx * lo, sx * hi);
        if (sy * spanY > h) { sy = h / spanY; sx = Math.min(sx, sy / lo); }
        return { sx: sx, sy: sy, width: spanX * sx, height: spanY * sy };
      }
      // Vertical: screen x runs along abstract y, screen y along abstract x.
      sy = w / spanY;
      sx = clamp(h / spanX, sy * lo, sy * hi);
      if (sx * spanX > h) { sx = h / spanX; sy = Math.min(sy, sx / lo); }
      return { sx: sx, sy: sy, width: spanY * sy, height: spanX * sx };
    }

    function toView(x, y, scale) {
      if (orientation === "horizontal") return { x: (x - bounds.x0) * scale.sx, y: (y - bounds.y0) * scale.sy };
      return { x: (bounds.y1 - y) * scale.sy, y: (x - bounds.x0) * scale.sx };
    }

    function fromView(vx, vy, scale) {
      if (orientation === "horizontal") return { x: vx / scale.sx + bounds.x0, y: vy / scale.sy + bounds.y0 };
      return { x: vy / scale.sx + bounds.x0, y: bounds.y1 - vx / scale.sy };
    }

    // A rectangle in view space for an abstract cell.
    function rectToView(cell, scale) {
      var a = toView(cell.x, cell.y, scale);
      var b = toView(cell.x + cell.w, cell.y + cell.h, scale);
      return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    }

    // Line tolerances in cells from a touch-friendly minimum in pixels.
    function tolerance(scale, minPixels) {
      minPixels = minPixels == null ? 9 : minPixels;
      return {
        tx: clamp(minPixels / scale.sx, 0.19, 0.3),
        ty: clamp(minPixels / scale.sy, 0.19, 0.3)
      };
    }

    return {
      orientation: orientation,
      dims: { zeroWidth: zw, dozenDepth: dh, evenDepth: eh, columnWidth: cw },
      bounds: bounds,
      cells: cells,
      anchor: anchor,
      hitTest: hitTest,
      fit: fit,
      toView: toView,
      fromView: fromView,
      rectToView: rectToView,
      tolerance: tolerance
    };
  }

  /* ---------------- French racetrack ----------------
     A stadium of 37 cells in wheel order, clockwise from the top-left:
     16 along the top, 3 round the right end (zero in the middle), 15 along
     the bottom and 3 round the left end. The inside holds the call bets. */
  var TRACK_TOP = [24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3];
  var TRACK_RIGHT = [26, 0, 32];
  var TRACK_BOTTOM = [15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8];
  var TRACK_LEFT = [23, 10, 5];
  var TRACK_LENGTH = 16;
  var TRACK_OUTER = 2;
  var TRACK_INNER = 1;
  var TRACK_BOUNDS = { x0: -TRACK_OUTER, x1: TRACK_LENGTH + TRACK_OUTER, y0: -TRACK_OUTER, y1: TRACK_OUTER };

  function arcPoints(cx, cy, radius, from, to, steps) {
    var points = [];
    for (var i = 0; i <= steps; i++) {
      var angle = from + (to - from) * i / steps;
      points.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
    }
    return points;
  }

  function bottomEdge(k) { return TRACK_LENGTH - k * TRACK_LENGTH / TRACK_BOTTOM.length; }

  function createRacetrack(orientation) {
    if (!ORIENTATIONS[orientation]) throw new RangeError("Unknown orientation: " + orientation);
    var cells = [];
    var mid = (TRACK_OUTER + TRACK_INNER) / 2;
    var deg = Math.PI / 180;

    TRACK_TOP.forEach(function (n, k) {
      cells.push({
        number: n,
        points: [{ x: k, y: -TRACK_OUTER }, { x: k + 1, y: -TRACK_OUTER }, { x: k + 1, y: -TRACK_INNER }, { x: k, y: -TRACK_INNER }],
        label: { x: k + 0.5, y: -mid }
      });
    });
    TRACK_RIGHT.forEach(function (n, k) {
      var from = (-90 + k * 60) * deg;
      var to = (-90 + (k + 1) * 60) * deg;
      var outer = arcPoints(TRACK_LENGTH, 0, TRACK_OUTER, from, to, 10);
      var inner = arcPoints(TRACK_LENGTH, 0, TRACK_INNER, to, from, 10);
      var middle = (from + to) / 2;
      cells.push({
        number: n,
        points: outer.concat(inner),
        label: { x: TRACK_LENGTH + mid * Math.cos(middle), y: mid * Math.sin(middle) }
      });
    });
    TRACK_BOTTOM.forEach(function (n, k) {
      var right = bottomEdge(k);
      var left = bottomEdge(k + 1);
      cells.push({
        number: n,
        points: [{ x: right, y: TRACK_INNER }, { x: right, y: TRACK_OUTER }, { x: left, y: TRACK_OUTER }, { x: left, y: TRACK_INNER }],
        label: { x: (left + right) / 2, y: mid }
      });
    });
    TRACK_LEFT.forEach(function (n, k) {
      var from = (90 + k * 60) * deg;
      var to = (90 + (k + 1) * 60) * deg;
      var outer = arcPoints(0, 0, TRACK_OUTER, from, to, 10);
      var inner = arcPoints(0, 0, TRACK_INNER, to, from, 10);
      var middle = (from + to) / 2;
      cells.push({
        number: n,
        points: outer.concat(inner),
        label: { x: mid * Math.cos(middle), y: mid * Math.sin(middle) }
      });
    });

    // Section dividers meet the inner edge between the neighbouring cells.
    var tierTop = 3, tierBottom = bottomEdge(9);        // 33 | 1   and 6 | 27
    var orphTop = 8, orphBottom = bottomEdge(6);        // 9 | 22   and 25 | 17
    var zeroTop = 13, zeroBottom = bottomEdge(1);       // 28 | 12  and 15 | 19
    var leftCap = arcPoints(0, 0, TRACK_INNER, 90 * deg, 270 * deg, 24);
    var rightCap = arcPoints(TRACK_LENGTH, 0, TRACK_INNER, -90 * deg, 90 * deg, 24);
    var sections = [
      {
        name: "tiers",
        points: leftCap.concat([{ x: tierTop, y: -TRACK_INNER }, { x: tierBottom, y: TRACK_INNER }]),
        label: { x: (tierTop + tierBottom) / 2 - 2.1, y: 0 }
      },
      {
        name: "orphelins",
        points: [{ x: tierTop, y: -TRACK_INNER }, { x: orphTop, y: -TRACK_INNER }, { x: orphBottom, y: TRACK_INNER }, { x: tierBottom, y: TRACK_INNER }],
        label: { x: (tierTop + orphTop + orphBottom + tierBottom) / 4, y: 0 }
      },
      {
        name: "voisins",
        points: [{ x: orphTop, y: -TRACK_INNER }, { x: zeroTop, y: -TRACK_INNER }, { x: zeroBottom, y: TRACK_INNER }, { x: orphBottom, y: TRACK_INNER }],
        label: { x: (orphTop + zeroTop + zeroBottom + orphBottom) / 4, y: 0 }
      },
      {
        name: "zero",
        points: [{ x: zeroTop, y: -TRACK_INNER }].concat(rightCap, [{ x: zeroBottom, y: TRACK_INNER }]),
        label: { x: (zeroTop + zeroBottom) / 2 + 1.25, y: 0 }
      }
    ];

    var outline = arcPoints(0, 0, TRACK_OUTER, 90 * deg, 270 * deg, 36)
      .concat(arcPoints(TRACK_LENGTH, 0, TRACK_OUTER, -90 * deg, 90 * deg, 36));
    var innerOutline = leftCap.concat(rightCap);

    var spanX = TRACK_BOUNDS.x1 - TRACK_BOUNDS.x0;
    var spanY = TRACK_BOUNDS.y1 - TRACK_BOUNDS.y0;

    function fit(w, h) {
      w = Math.max(1, Number(w) || 1);
      h = Math.max(1, Number(h) || 1);
      var sx, sy;
      if (orientation === "horizontal") {
        sx = w / spanX;
        sy = clamp(h / spanY, sx * 0.9, sx * 1.6);
        if (sy * spanY > h) { sy = h / spanY; sx = Math.min(sx, sy / 0.9); }
        return { sx: sx, sy: sy, width: spanX * sx, height: spanY * sy };
      }
      sy = w / spanY;
      sx = clamp(h / spanX, sy * 0.22, sy * 0.6);
      if (sx * spanX > h) { sx = h / spanX; sy = Math.min(sy, sx / 0.22); }
      return { sx: sx, sy: sy, width: spanY * sy, height: spanX * sx };
    }

    function toView(x, y, scale) {
      if (orientation === "horizontal") return { x: (x - TRACK_BOUNDS.x0) * scale.sx, y: (y - TRACK_BOUNDS.y0) * scale.sy };
      return { x: (TRACK_BOUNDS.y1 - y) * scale.sy, y: (x - TRACK_BOUNDS.x0) * scale.sx };
    }

    return {
      orientation: orientation,
      bounds: TRACK_BOUNDS,
      cells: cells,
      sections: sections,
      outline: outline,
      innerOutline: innerOutline,
      fit: fit,
      toView: toView
    };
  }

  return {
    ORIENTATIONS: ORIENTATIONS,
    EVEN_ORDER: EVEN_ORDER,
    TRACK_ORDER: TRACK_TOP.concat(TRACK_RIGHT, TRACK_BOTTOM, TRACK_LEFT),
    numberAt: numberAt,
    cellOf: cellOf,
    createBoard: createBoard,
    createRacetrack: createRacetrack
  };
});
