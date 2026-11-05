/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// Can a finger reach every control? Shared by the browser suites of the
// tables. A control that is drawn on the page can still be out of reach: the
// table's frame clips what does not fit (overflow: hidden), so a button can be
// cut off without the page ever scrolling, and a part of the felt that runs
// over the tray covers the chips beneath it.

// From desktops to the smallest phones, upright and on their side.
const REACH_VIEWPORTS = [
  [1440, 900], [1280, 800], [1024, 768], [768, 1024], [932, 430], [844, 390],
  [740, 360], [667, 375], [568, 320], [390, 844], [360, 640], [320, 568]
];

// An emulated resize reaches the page in steps: elements already on the page
// keep the sizes they took from the old vw and vh for a frame or more. A
// 100vw x 100vh box placed before the resize catches up with them, so wait
// for it (see blackjack.spec.cjs). Some tables lay themselves out again a
// little after a resize (Table 37 waits 60 ms, its wheel 90 ms), so then wait
// until no control has moved for 200 ms.
async function resizeTo(page, width, height) {
  await page.evaluate(() => {
    if (document.getElementById("viewportProbe")) return;
    const probe = document.createElement("div");
    probe.id = "viewportProbe";
    probe.style.cssText = "position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; visibility: hidden; pointer-events: none";
    document.documentElement.appendChild(probe);
    probe.getBoundingClientRect();
  });
  await page.setViewport({ width, height });
  await page.waitForFunction((w, h) => {
    const box = document.getElementById("viewportProbe").getBoundingClientRect();
    return innerWidth === w && innerHeight === h && Math.round(box.width) === w && Math.round(box.height) === h;
  }, { polling: "raf" }, width, height);
  await page.evaluate(() => { window.layoutKey = ""; window.layoutSince = 0; });
  await page.waitForFunction(() => {
    const key = [...document.querySelectorAll(".table-felt, .controls, button, [role='button']")].map(node => {
      const r = node.getBoundingClientRect();
      return [r.left, r.top, r.width, r.height].map(Math.round).join(",");
    }).join("|") + "|" + document.documentElement.scrollHeight;
    if (key !== window.layoutKey) { window.layoutKey = key; window.layoutSince = performance.now(); }
    return performance.now() - window.layoutSince >= 200;
  }, { polling: "raf", timeout: 5000 });
}

// Runs in the page. Names every shown control a finger cannot reach: one that
// leaves the screen, is cut off by a frame that clips, or lies under another
// part of the page. A control inside a box that scrolls is reached by
// scrolling that box; only the box itself must then be on the screen.
function unreachableControls() {
  const out = [];
  const shown = node => {
    for (let item = node; item && item !== document.documentElement; item = item.parentElement) {
      const style = getComputedStyle(item);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    const r = node.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const scrolls = style => /auto|scroll/.test(style.overflowX + " " + style.overflowY);
  const name = node => {
    if (node.id) return "#" + node.id;
    const key = node.dataset && (node.dataset.bet || node.dataset.value);
    return "." + (node.getAttribute("class") || node.tagName.toLowerCase()).split(" ")[0] + (key ? "[" + key + "]" : "");
  };
  const nodes = [...document.querySelectorAll("button, input, select, [role='button']")]
    .filter(node => shown(node) && !node.closest("dialog"));
  for (const node of nodes) {
    const r = node.getBoundingClientRect();
    let view = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    let scroller = null;
    for (let item = node.parentElement; item && item !== document.body; item = item.parentElement) {
      const style = getComputedStyle(item);
      if (scrolls(style)) { scroller = item; break; }
      if (style.overflowX !== "visible" || style.overflowY !== "visible") {
        const box = item.getBoundingClientRect();
        view = { left: Math.max(view.left, box.left), top: Math.max(view.top, box.top), right: Math.min(view.right, box.right), bottom: Math.min(view.bottom, box.bottom) };
      }
    }
    const target = scroller ? scroller.getBoundingClientRect() : r;
    const cut = Math.max(view.left - target.left, view.top - target.top, target.right - view.right, target.bottom - view.bottom);
    if (cut > 1) { out.push(name(scroller || node) + " cut off by " + Math.round(cut) + "px"); continue; }
    if (scroller) continue;
    // The middle of the control must be the control itself, not something drawn over it.
    const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    if (hit && hit !== node && !node.contains(hit) && !hit.closest(".toast")) out.push(name(node) + " lies under " + name(hit));
  }
  // The stake beside the buttons must stay readable, not run under one of them.
  const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  document.querySelectorAll(".bet-total strong").forEach(total => {
    if (!shown(total)) return;
    const r = total.getBoundingClientRect();
    nodes.filter(node => node.closest(".controls") && !node.contains(total))
      .forEach(node => { if (overlap(r, node.getBoundingClientRect())) out.push("the total runs under " + name(node)); });
  });
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push("the page scrolls sideways");
  if (document.documentElement.scrollHeight > innerHeight + 1) out.push("the page is " + document.documentElement.scrollHeight + "px tall");
  return [...new Set(out)];
}

// Visits every size and lists what is out of reach, labelled with the size
// and the moment of the round. Leaves the page at the last size.
async function sweepReach(page, moment, viewports) {
  const found = [];
  for (const [width, height] of viewports || REACH_VIEWPORTS) {
    await resizeTo(page, width, height);
    for (const problem of await page.evaluate(unreachableControls)) found.push(width + "x" + height + " " + moment + ": " + problem);
  }
  return found;
}

module.exports = { REACH_VIEWPORTS, resizeTo, unreachableControls, sweepReach };
