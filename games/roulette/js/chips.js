/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 37 — casino chips
   Denominations, colours and the vector chip face shared by the
   tray and the layout. Pure helpers work in Node for the tests;
   the SVG helpers need a document. Exposed as window.ChipArt.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChipArt = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";

  // The six chips in the tray, smallest first.
  var TRAY = [5, 25, 100, 500, 1000, 5000];
  // Every colour a stack can show, largest first (1 only appears in payouts).
  var DENOMS = [100000, 25000, 5000, 1000, 500, 100, 25, 5, 1];

  // Kept in step with the .chip-* rules in css/styles.css.
  // body = clay · spot/spotAlt = edge inserts · ring = groove · inlay = centre · ink = value
  var COLORS = {
    1:      { body: "#ece9df", spot: "#315b8a", ring: "#817b6b", inlay: "#f7f3e8", ink: "#25231f", edge: "#a9a596" },
    5:      { body: "#a8232d", spot: "#f0e6cf", ring: "#e0bd72", inlay: "#bc3039", ink: "#fff4dc", edge: "#6a141b" },
    25:     { body: "#24704e", spot: "#eee5cf", ring: "#d4b55c", inlay: "#2d805b", ink: "#fff5d9", edge: "#134631" },
    100:    { body: "#23232b", spot: "#ececf2", ring: "#cbb069", inlay: "#30303a", ink: "#f4efe2", edge: "#0d0d11" },
    500:    { body: "#5e2a90", spot: "#f0cf63", ring: "#f0dca8", inlay: "#6e36a6", ink: "#fbf4ff", edge: "#3a1a5c" },
    1000:   { body: "#c9a23a", spot: "#2a1510", ring: "#5a3a10", inlay: "#ddb24e", ink: "#2a1c04", edge: "#8a6c1c" },
    5000:   { body: "#1a4775", spot: "#edf4f8", spotAlt: "#78b8d8", ring: "#c2d4df", inlay: "#245987", ink: "#f8fbfd", edge: "#0d3152" },
    25000:  { body: "#0d674a", spot: "#ecd28a", spotAlt: "#f4efe1", ring: "#e0c36d", inlay: "#176e53", ink: "#fff4cb", edge: "#064735" },
    100000: { body: "#6f1622", spot: "#f4d77a", spotAlt: "#f7ecc0", ring: "#f4e2a6", inlay: "#8a1f2c", ink: "#fff4cf", edge: "#440d15" }
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
    return chips.length ? chips[0] : TRAY[0];
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

  function shape(doc, name, className, attributes) {
    var node = doc.createElementNS(SVG_NS, name);
    node.setAttribute("class", className);
    Object.keys(attributes).forEach(function (key) { node.setAttribute(key, String(attributes[key])); });
    return node;
  }

  // Vector chip face: clay body, eight edge inserts, groove, inlay and value.
  function face(doc, text, className) {
    var svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", className || "chip-art");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
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

  function paint(element, denomination) {
    var color = COLORS[denomination] || COLORS[TRAY[0]];
    element.style.setProperty("--body", color.body);
    element.style.setProperty("--spot", color.spot);
    element.style.setProperty("--spot-alt", color.spotAlt || color.spot);
    element.style.setProperty("--ringline", color.ring);
    element.style.setProperty("--inlay", color.inlay);
    element.style.setProperty("--ink", color.ink);
    element.style.setProperty("--edge", color.edge);
  }

  // A stack on the layout: the face shows the largest chip and carries the
  // total; up to three more chips show their edges underneath.
  function stack(doc, amount, className) {
    var node = doc.createElement("div");
    node.className = className || "bet-chip";
    var chips = breakdown(amount);
    if (!chips.length) chips = [TRAY[0]];
    var visible = Math.min(4, chips.length);
    node.setAttribute("data-amount", String(amount));
    node.style.setProperty("--layers", String(visible));
    for (var depth = visible - 1; depth >= 1; depth--) {
      var layer = doc.createElement("span");
      layer.className = "bet-chip-edge";
      layer.style.setProperty("--depth", String(depth));
      paint(layer, chips[depth]);
      node.appendChild(layer);
    }
    var top = doc.createElement("span");
    top.className = "bet-chip-face";
    paint(top, chips[0]);
    top.appendChild(face(doc, label(amount), "chip-art"));
    node.appendChild(top);
    return node;
  }

  return {
    TRAY: TRAY,
    DENOMS: DENOMS,
    COLORS: COLORS,
    breakdown: breakdown,
    topDenomination: topDenomination,
    label: label,
    face: face,
    paint: paint,
    stack: stack
  };
});
