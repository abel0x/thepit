/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   ThePit — the frequency charts of a table's last results
   How often each result has come in the record a table keeps, how many
   rounds ago it last came, and what its exact chance is, drawn as bars
   with the chance marked on each. The counting is pure (tested in Node);
   draw() builds the rows of a table in the page.
   Exposed as window.PitTally and CommonJS.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PitTally = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Rounds since the last result that passes `test`, counting back from the
  // latest (0 when the latest passes), or null when none in the record does.
  function since(list, test) {
    for (var i = list.length - 1; i >= 0; i--) {
      if (test(list[i])) return list.length - 1 - i;
    }
    return null;
  }

  function count(list, test) {
    return list.reduce(function (sum, item) { return sum + (test(item) ? 1 : 0); }, 0);
  }

  // One row for each spec { key, chance, test }: how many results of the
  // record pass its test, their share of the record, the exact chance of
  // one result passing, and the rounds since the last that did.
  function rows(list, specs) {
    return specs.map(function (spec) {
      var hits = count(list, spec.test);
      return {
        key: spec.key,
        count: hits,
        share: list.length ? hits / list.length : 0,
        chance: spec.chance,
        since: since(list, spec.test)
      };
    });
  }

  // Draws rows into a <tbody>: the name, a bar for the share with a mark at
  // the chance, the count and the rounds since. words: { name(key),
  // percent(fraction), since(n or null) }. The bars are scaled to the
  // largest share or chance, so the rare results stay readable.
  function draw(body, list, words) {
    var doc = body.ownerDocument;
    body.textContent = "";
    var top = list.reduce(function (max, row) { return Math.max(max, row.share, row.chance); }, 0) || 1;
    list.forEach(function (row) {
      var tr = doc.createElement("tr");
      tr.setAttribute("data-key", String(row.key));
      var name = doc.createElement("th");
      name.scope = "row";
      name.textContent = words.name(row.key);
      var barCell = doc.createElement("td");
      barCell.className = "tally-bar";
      var track = doc.createElement("span");
      track.className = "tally-track";
      var bar = doc.createElement("span");
      bar.className = "tally-fill";
      bar.style.width = (row.share / top * 100).toFixed(1) + "%";
      var mark = doc.createElement("span");
      mark.className = "tally-chance";
      mark.style.left = (row.chance / top * 100).toFixed(1) + "%";
      track.appendChild(bar);
      track.appendChild(mark);
      barCell.appendChild(track);
      var share = doc.createElement("td");
      share.className = "tally-share";
      share.textContent = row.count + " · " + words.percent(row.share);
      var chance = doc.createElement("td");
      chance.className = "tally-expected";
      chance.textContent = words.percent(row.chance);
      var ago = doc.createElement("td");
      ago.className = "tally-since";
      ago.textContent = words.since(row.since);
      [name, barCell, share, chance, ago].forEach(function (cell) { tr.appendChild(cell); });
      body.appendChild(tr);
    });
  }

  return {
    since: since,
    count: count,
    rows: rows,
    draw: draw
  };
});
