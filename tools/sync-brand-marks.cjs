#!/usr/bin/env node
/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// Draws the mark in each table's header from the table's tab icon, so that
// the two never drift apart. The drawing has to be written into the page:
// browsers refuse an SVG <use> of another file when the pit is opened from
// file://. Run it after changing a games/<id>/icon.svg; a unit test fails
// while a page is out of date.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PREFIX = "mark-";
const INDENT = "        ";
// The mark span and the svg inside it, as every table page writes them.
const MARK = /(<span class="brand-mark" aria-hidden="true">\n)[\s\S]*?(\n\s*<\/span>)/;

// The icon without its tile: the tile's gradient goes, every id gains a
// prefix so as not to meet another id on the page, and the lines are indented
// for the page.
function markFromIcon(icon) {
  const defs = icon.match(/<defs>\n([\s\S]*?)\n\s*<\/defs>/)[1]
    .replace(/\s*<radialGradient id="bg"[\s\S]*?<\/radialGradient>/, "");
  const tile = icon.match(/\n\s*<!-- App tile -->\n\s*<rect width="512" height="512" rx="112" fill="url\(#bg\)"\/>\n/);
  const drawing = icon.slice(tile.index + tile[0].length, icon.lastIndexOf("</svg>"));
  const body = ("  <defs>\n" + defs + "\n  </defs>\n" + drawing)
    .replace(/\bid="([^"]+)"/g, 'id="' + PREFIX + '$1"')
    .replace(/url\(#([^)]+)\)/g, "url(#" + PREFIX + "$1)")
    .split("\n").filter(line => line.trim()).map(line => INDENT + line).join("\n");
  return INDENT + '<svg viewBox="0 0 512 512" width="44" height="44" focusable="false">\n' + body + "\n" + INDENT + "</svg>";
}

function pageWithMark(html, mark) {
  if (!MARK.test(html)) throw new Error("no brand mark on the page");
  return html.replace(MARK, (all, open, close) => open + mark + close);
}

function tableIds() {
  return Object.keys(require(path.join(ROOT, "shared/js/pit.js")).TABLES);
}

function sync() {
  for (const id of tableIds()) {
    const page = path.join(ROOT, "games", id, "index.html");
    const icon = fs.readFileSync(path.join(ROOT, "games", id, "icon.svg"), "utf8");
    const html = fs.readFileSync(page, "utf8");
    const next = pageWithMark(html, markFromIcon(icon));
    if (next !== html) {
      fs.writeFileSync(page, next);
      console.log("updated " + path.relative(ROOT, page));
    }
  }
}

if (require.main === module) sync();

module.exports = { markFromIcon, pageWithMark, tableIds, MARK };
