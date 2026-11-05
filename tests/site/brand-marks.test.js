/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// The mark in each table's header is the table's tab icon without its tile.
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var Marks = require("../../tools/sync-brand-marks.cjs");

var root = path.resolve(__dirname, "../..");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };

test("every table's header mark is drawn from its tab icon (run tools/sync-brand-marks.cjs)", function () {
  var ids = Marks.tableIds();
  assert.equal(ids.length, 14);
  ids.forEach(function (id) {
    var html = read("games/" + id + "/index.html");
    var expected = Marks.pageWithMark(html, Marks.markFromIcon(read("games/" + id + "/icon.svg")));
    assert.ok(html === expected, id + ": the header mark differs from icon.svg");
  });
});

test("a header mark keeps the drawing, drops the tile and shares no id with the page", function () {
  var icon = read("games/keno/icon.svg");
  var mark = Marks.markFromIcon(icon);
  assert.match(mark, /^\s*<svg viewBox="0 0 512 512" width="44" height="44" focusable="false">/);
  assert.doesNotMatch(mark, /rx="112"/, "no tile");
  assert.doesNotMatch(mark, /id="mark-bg"/, "no tile gradient");
  assert.match(mark, />80<\/text>/, "the drawing itself");
  (mark.match(/\bid="([^"]+)"/g) || []).forEach(function (id) { assert.match(id, /^id="mark-/); });
  (mark.match(/url\(#[^)]+\)/g) || []).forEach(function (ref) {
    assert.match(ref, /^url\(#mark-/);
    assert.ok(mark.indexOf('id="' + ref.slice(5, -1) + '"') !== -1, ref + " is defined in the mark");
  });
});
