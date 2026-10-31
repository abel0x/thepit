/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   ThePit — casino chips for every table
   The one palette of the pit: each denomination has a single colour
   wherever it appears, in any tray, on any felt and in any payout.
   It also draws the clay chip of Table 21: the face in the tray and the
   low cylinder that chips on the felt are stacked from. Pure helpers
   work in Node for the tests; the drawing helpers need a document.
   Exposed as window.ChipArt.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChipArt = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";

  // Every chip the pit owns, largest first. A table's tray offers some of
  // them; the rest still appear on the felt when a stake or a payout breaks
  // into them.
  var DENOMS = [100000, 25000, 5000, 1000, 500, 100, 50, 25, 10, 5, 1];

  // The colour of each denomination, and of the All-in chip, which has no
  // value of its own. No two share a body colour.
  // body = clay · spot/spotAlt = edge inserts · ring = groove · inlay = centre
  // ink = value · edge/edgeDark = the side seen under a chip in the tray
  var COLORS = {
    1:      { name: "white",    body: "#ece9df", spot: "#315b8a", ring: "#817b6b", inlay: "#f7f3e8", ink: "#25231f", edge: "#a9a596", edgeDark: "#7c7969" },
    5:      { name: "red",      body: "#a8232d", spot: "#f0e6cf", ring: "#e0bd72", inlay: "#bc3039", ink: "#fff4dc", edge: "#6a141b", edgeDark: "#430b10" },
    10:     { name: "brown",    body: "#6b4226", spot: "#f1e4c8", ring: "#d6b46a", inlay: "#7a4d2e", ink: "#fff3dc", edge: "#432814", edgeDark: "#2a180b" },
    25:     { name: "green",    body: "#24704e", spot: "#eee5cf", ring: "#d4b55c", inlay: "#2d805b", ink: "#fff5d9", edge: "#134631", edgeDark: "#0a2c1e" },
    50:     { name: "orange",   body: "#d0661c", spot: "#fbefd9", ring: "#f3cf8a", inlay: "#dd772c", ink: "#fffaf0", edge: "#8c4310", edgeDark: "#5c2b09" },
    100:    { name: "black",    body: "#23232b", spot: "#ececf2", ring: "#cbb069", inlay: "#30303a", ink: "#f4efe2", edge: "#0d0d11", edgeDark: "#040406" },
    500:    { name: "purple",   body: "#5e2a90", spot: "#f0cf63", ring: "#f0dca8", inlay: "#6e36a6", ink: "#fbf4ff", edge: "#3a1a5c", edgeDark: "#260f3e" },
    1000:   { name: "yellow",   body: "#c9a23a", spot: "#2a1510", ring: "#5a3a10", inlay: "#ddb24e", ink: "#2a1c04", edge: "#8a6c1c", edgeDark: "#5e4910" },
    5000:   { name: "blue",     body: "#1a4775", spot: "#edf4f8", spotAlt: "#78b8d8", ring: "#c2d4df", inlay: "#245987", ink: "#f8fbfd", edge: "#0d3152", edgeDark: "#071d31" },
    25000:  { name: "pink",     body: "#d8668f", spot: "#fff3f7", spotAlt: "#5c1631", ring: "#7a2445", inlay: "#e27ba0", ink: "#3b0c1f", edge: "#93375a", edgeDark: "#62203a" },
    100000: { name: "silver",   body: "#9aa1a9", spot: "#1f2d4a", spotAlt: "#e5c46a", ring: "#2b3a58", inlay: "#aeb5bc", ink: "#121a2c", edge: "#5f666e", edgeDark: "#3d4248" },
    allin:  { name: "bordeaux", body: "#6f1622", spot: "#f4d77a", spotAlt: "#f7ecc0", ring: "#f4e2a6", inlay: "#8a1f2c", ink: "#fff4cf", edge: "#440d15", edgeDark: "#2c080d" }
  };

  // Greedy breakdown into physical chips, largest first.
  function breakdown(amount) {
    amount = Math.floor(Number(amount));
    var chips = [];
    if (!(amount > 0)) return chips;
    DENOMS.forEach(function (value) {
      var count = Math.floor(amount / value);
      for (var i = 0; i < count && chips.length < 400; i++) chips.push(value);
      amount -= count * value;
    });
    return chips;
  }

  // The denomination whose colour a stack of this value shows on top.
  function topDenomination(amount) {
    var chips = breakdown(amount);
    return chips.length ? chips[0] : DENOMS[DENOMS.length - 1];
  }

  // Compact value printed on a chip: 25, 125, 1K, 2.5K, 12K, 1.2M.
  function label(amount) {
    amount = Math.floor(Number(amount)) || 0;
    function trim(value) {
      var text = value >= 100 ? String(Math.floor(value)) : value >= 10 ? (Math.floor(value * 10) / 10).toFixed(1) : (Math.floor(value * 100) / 100).toFixed(2);
      return text.indexOf(".") === -1 ? text : text.replace(/\.?0+$/, "");
    }
    if (amount >= 1e9) return trim(amount / 1e9) + "B";
    if (amount >= 1e6) return trim(amount / 1e6) + "M";
    if (amount >= 1000) return trim(amount / 1000) + "K";
    return String(amount);
  }

  // Sets the colour variables every chip drawing reads.
  function paint(element, denomination) {
    var color = COLORS[denomination] || COLORS[100];
    element.style.setProperty("--body", color.body);
    element.style.setProperty("--spot", color.spot);
    element.style.setProperty("--spot-alt", color.spotAlt || color.spot);
    element.style.setProperty("--ringline", color.ring);
    element.style.setProperty("--inlay", color.inlay);
    element.style.setProperty("--ink", color.ink);
    element.style.setProperty("--edge", color.edge);
    element.style.setProperty("--edge-dark", color.edgeDark);
  }

  function shape(doc, name, className, attributes) {
    var node = doc.createElementNS(SVG_NS, name);
    node.setAttribute("class", className);
    Object.keys(attributes).forEach(function (key) { node.setAttribute(key, String(attributes[key])); });
    return node;
  }

  function svgRoot(doc, className) {
    var svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    return svg;
  }

  // The chip seen from above: clay body, eight edge inserts, groove, inlay
  // and, when given, the value.
  function face(doc, text, className) {
    var svg = svgRoot(doc, className || "chip-art");
    svg.appendChild(shape(doc, "circle", "chip-svg-base", { cx: 50, cy: 50, r: 48 }));
    svg.appendChild(shape(doc, "circle", "chip-svg-spots spot-a", { cx: 50, cy: 50, r: 39 }));
    svg.appendChild(shape(doc, "circle", "chip-svg-spots spot-b", { cx: 50, cy: 50, r: 39 }));
    svg.appendChild(shape(doc, "circle", "chip-svg-body-ring", { cx: 50, cy: 50, r: 30.5 }));
    svg.appendChild(shape(doc, "circle", "chip-svg-groove", { cx: 50, cy: 50, r: 25.5 }));
    svg.appendChild(shape(doc, "circle", "chip-svg-inlay", { cx: 50, cy: 50, r: 22 }));
    svg.appendChild(shape(doc, "circle", "chip-svg-innerline", { cx: 50, cy: 50, r: 18.5 }));
    svg.appendChild(shape(doc, "ellipse", "chip-svg-shade", { cx: 50, cy: 70, rx: 27, ry: 12 }));
    svg.appendChild(shape(doc, "ellipse", "chip-svg-shine", { cx: 39, cy: 27, rx: 23, ry: 10 }));
    if (text) {
      var value = shape(doc, "text", "chip-svg-value" + (text.length > 3 ? " long" : ""), { x: 50, y: 52 });
      value.textContent = text;
      svg.appendChild(value);
    }
    return svg;
  }

  // A chip lying on the felt: the complete low cylinder, with its curved
  // wall, the edge inserts on the wall and the face in perspective. Every
  // chip of a stack gets one, so small offsets show real surfaces.
  function cylinder(doc, text) {
    var svg = svgRoot(doc, "stack-chip-art");
    var wall = "M2 36 L2 63 C2 83 23 98 50 98 C77 98 98 83 98 63 L98 36 Z";
    svg.appendChild(shape(doc, "path", "stack-svg-side", { d: wall }));
    [
      "M4 66 L16 72 L16 91 Q9 86 4 78 Z",
      "M28 78 Q34 81 40 82 L40 97 Q34 95 28 92 Z",
      "M60 82 Q66 81 72 78 L72 92 Q66 95 60 97 Z",
      "M84 72 L96 66 L96 78 Q91 86 84 91 Z"
    ].forEach(function (path, index) {
      svg.appendChild(shape(doc, "path", "stack-svg-side-spot spot-" + (index % 2 ? "b" : "a"), { d: path }));
    });
    svg.appendChild(shape(doc, "path", "stack-svg-side-shade", { d: wall }));
    svg.appendChild(shape(doc, "path", "stack-svg-side-glint", { d: "M5 69 C17 87 34 95 50 95" }));
    svg.appendChild(shape(doc, "path", "stack-svg-bottom-rim", { d: "M2 63 C2 83 23 98 50 98 C77 98 98 83 98 63" }));
    svg.appendChild(shape(doc, "ellipse", "stack-svg-top", { cx: 50, cy: 38, rx: 48, ry: 36 }));
    svg.appendChild(shape(doc, "ellipse", "stack-svg-spots spot-a", { cx: 50, cy: 38, rx: 39, ry: 28.5, pathLength: 100 }));
    svg.appendChild(shape(doc, "ellipse", "stack-svg-spots spot-b", { cx: 50, cy: 38, rx: 39, ry: 28.5, pathLength: 100 }));
    svg.appendChild(shape(doc, "ellipse", "stack-svg-body-ring", { cx: 50, cy: 38, rx: 30.5, ry: 22.5 }));
    svg.appendChild(shape(doc, "ellipse", "stack-svg-groove", { cx: 50, cy: 38, rx: 25.5, ry: 18.8 }));
    svg.appendChild(shape(doc, "ellipse", "stack-svg-inlay", { cx: 50, cy: 38, rx: 22, ry: 16 }));
    svg.appendChild(shape(doc, "ellipse", "stack-svg-innerline", { cx: 50, cy: 38, rx: 18.5, ry: 13.2 }));
    svg.appendChild(shape(doc, "ellipse", "stack-svg-face-shade", { cx: 50, cy: 52, rx: 27, ry: 11 }));
    svg.appendChild(shape(doc, "ellipse", "stack-svg-face-shine", { cx: 39, cy: 19, rx: 22, ry: 8 }));
    if (text) {
      var value = shape(doc, "text", "chip-svg-value stack-svg-value" + (text.length > 3 ? " long" : ""), { x: 50, y: 39 });
      value.textContent = text;
      svg.appendChild(value);
    }
    return svg;
  }

  // The values a tray offers, in the order it shows them; All-in is not one.
  function trayValues(tray) {
    var values = [];
    tray.querySelectorAll(".chip[data-value]").forEach(function (chip) {
      var value = Number(chip.getAttribute("data-value"));
      if (COLORS[value]) values.push(value);
    });
    return values;
  }

  // Paints every chip of a tray from the palette and gives it its clay face;
  // the value stays in the button's own text.
  function decorateTray(tray) {
    tray.querySelectorAll(".chip[data-value]").forEach(function (chip) {
      var raw = chip.getAttribute("data-value");
      paint(chip, raw === "allin" ? "allin" : Number(raw));
      if (!chip.querySelector(".chip-art")) chip.insertBefore(face(chip.ownerDocument, "", "chip-art"), chip.firstChild);
    });
  }

  // A stake on a crowded layout: one column of chips, the largest on top
  // carrying the total, with up to four more underneath.
  var STACK_DEPTH = 5;
  function stack(doc, amount, className) {
    var node = doc.createElement("div");
    node.className = className || "bet-chip";
    var chips = breakdown(amount);
    if (!chips.length) chips = [topDenomination(0)];
    var visible = Math.min(STACK_DEPTH, chips.length);
    node.setAttribute("data-amount", String(amount));
    node.style.setProperty("--layers", String(visible));
    for (var level = 0; level < visible; level++) {
      var chip = doc.createElement("span");
      var top = level === visible - 1;
      // The top chip is the largest; the next ones in order lie beneath it.
      var denomination = chips[visible - 1 - level];
      chip.className = "stack-chip" + (top ? " cap" : "");
      chip.style.setProperty("--level", String(level));
      paint(chip, denomination);
      chip.appendChild(cylinder(doc, top ? label(amount) : ""));
      node.appendChild(chip);
    }
    return node;
  }

  return {
    DENOMS: DENOMS,
    COLORS: COLORS,
    breakdown: breakdown,
    topDenomination: topDenomination,
    label: label,
    paint: paint,
    face: face,
    cylinder: cylinder,
    trayValues: trayValues,
    decorateTray: decorateTray,
    stack: stack
  };
});
