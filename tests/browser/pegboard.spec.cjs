/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// Real-browser suite for Drop 16. Puppeteer is a development dependency only;
// the machine never loads it.
// npm run test:browser  (or: PIT_PUPPETEER_PATH=/absolute/path/to/puppeteer node --test this-file)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { startServer } = require("./server.cjs");
const { unreachableControls } = require("./reach.cjs");
const Engine = require("../../games/pegboard/js/engine.js");
const puppeteer = require(process.env.PIT_PUPPETEER_PATH || "puppeteer");
const root = path.resolve(__dirname, "../..");
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "thepit-pegboard-"));
let browser, server, workerRevision = 0;

test.before(async () => {
  server = await startServer(root, () => "pit-v" + (1600 + workerRevision));
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 20000, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  console.log("Browser: " + await browser.version());
  console.log("Screenshots: " + artifacts);
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

const fileURL = () => pathToFileURL(path.join(root, "games/pegboard/index.html")).href;

// Opens Drop 16 in a fresh profile. options: web, width, height, motion,
// bankroll, lang, settings, paths (the ways down the next balls take, in
// turn) and seed (more saved values).
async function scene(options, run) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [], remote = [];
  page.setDefaultTimeout(8000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith(server.origin + "/")) remote.push(request.url());
  });
  await page.setViewport({ width: options.width || 1280, height: options.height || 800 });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: options.motion ? "no-preference" : "reduce" }]);
  await page.evaluateOnNewDocument(config => {
    if (!["file:", "http:", "https:"].includes(location.protocol)) return;
    // Seed once per scene; every scene starts from an empty profile.
    if (!localStorage.getItem("spec.seeded")) {
      localStorage.setItem("pit.bankroll", JSON.stringify(config.bankroll == null ? 10000 : config.bankroll));
      localStorage.setItem("pit.lang", config.lang || "en");
      localStorage.setItem("pit.pegboard.settings", JSON.stringify(Object.assign({ animationSpeed: "fast" }, config.settings)));
      localStorage.setItem("pit.pegboard.sound", "false");
      Object.keys(config.seed || {}).forEach(key => localStorage.setItem(key, JSON.stringify(config.seed[key])));
      localStorage.setItem("spec.seeded", "true");
    }
    Object.defineProperty(window, "PegboardEngine", {
      configurable: true,
      set(api) {
        if (config.paths) {
          let next = 0;
          api.drop = function () { return config.paths[next++ % config.paths.length]; };
        }
        Object.defineProperty(window, "PegboardEngine", { value: api, writable: true, configurable: true });
      }
    });
  }, options);
  try {
    await page.goto(options.web ? server.origin + "/games/pegboard/index.html" : fileURL(), { waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    await run(page, context);
    assert.deepEqual(errors, [], "page errors");
    assert.deepEqual(remote, [], "remote requests");
  } catch (error) {
    await page.screenshot({ path: path.join(artifacts, "failure-" + Date.now() + ".png") }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

const stored = (page, key) => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const text = (page, selector) => page.$eval(selector, node => node.textContent.trim());
const texts = (page, selector) => page.$$eval(selector, nodes => nodes.map(node => node.textContent.trim()));
async function dropped(page) {
  await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false" &&
    localStorage.getItem("pit.pegboard.round") === null, { timeout: 20000 });
}
async function drop(page) {
  await page.click("#btnDrop");
  await dropped(page);
}

test("a ball drops straight from file:// and pays the slot it lands in", async () => {
  await scene({ settings: { rows: 8, risk: "high", balls: 1, bet: 10 }, paths: ["LLLLLLLL"] }, async page => {
    assert.equal(await page.$$eval("#board .slot", nodes => nodes.length), 9);
    assert.deepEqual(await texts(page, "#board .slot text"), ["32×", "4×", "1.3×", "0.3×", "0.2×", "0.3×", "1.3×", "4×", "32×"]);
    assert.equal(await text(page, "#tableRtp"), "97.03%");
    await drop(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 10 + 320);
    assert.equal(await text(page, "#bannerText"), "32×: you win $320");
    assert.equal(await text(page, "#lastMultiple"), "32×");
    assert.deepEqual(await texts(page, "#history li"), ["32×"]);
    const stats = await stored(page, "pit.pegboard.stats");
    assert.deepEqual([stats.rounds, stats.drops, stats.winningDrops, stats.wagered, stats.returned, stats.bestMultiplier], [1, 1, 1, 10, 320, 320]);
  });
});

test("five balls are staked together, counted as they land and paid together", async () => {
  const paths = ["LLLLLLLL", "LRLRLRLR", "RRRRRRRR", "LLRRLLRR", "LLLRRRRR"];
  await scene({ settings: { rows: 8, risk: "medium", balls: 5, bet: 50 }, paths }, async page => {
    assert.equal(await text(page, "#ballsLine"), "5 balls · $250");
    await drop(page);
    // 16×, 0.4×, 16×, 0.4× and 0.6× of $50.
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 250 + 1670);
    assert.equal(await text(page, "#bannerText"), "5 balls: $1,670 back");
    assert.equal(await text(page, "#bannerSub"), "You win $1,420");
    assert.equal(await text(page, "#ballsDown"), "5");
    assert.equal(await text(page, "#lastMultiple"), "0.6×");
    assert.deepEqual(await texts(page, "#history li"), ["0.6×", "0.4×", "16×", "0.4×", "16×"], "newest first");
    assert.equal((await stored(page, "pit.pegboard.stats")).drops, 5);
  });
});

test("the rows and the risk redraw the board, and the keyboard steps through them", async () => {
  await scene({}, async page => {
    assert.equal(await page.$$eval("#board .slot", nodes => nodes.length), 13, "12 rows by default");
    await page.click('#rowsPicker [data-rows="16"]');
    await page.click('#riskPicker [data-risk="high"]');
    assert.equal(await page.$$eval("#board .peg", nodes => nodes.length), Array.from({ length: 16 }, (_, row) => row + 3).reduce((a, b) => a + b));
    assert.deepEqual((await texts(page, "#board .slot text")).slice(0, 3), ["1000×", "190×", "40×"]);
    assert.equal(await text(page, "#tableRtp"), "97.19%");
    assert.deepEqual(await stored(page, "pit.pegboard.settings"), { rows: 16, risk: "high", balls: 1, bet: 10, animationSpeed: "fast" });
    await page.keyboard.press("w");
    await page.keyboard.press("k");
    await page.keyboard.press("b");
    await page.keyboard.press("3");
    assert.deepEqual(await stored(page, "pit.pegboard.settings"), { rows: 8, risk: "low", balls: 5, bet: 100, animationSpeed: "fast" });
    assert.equal(await page.$eval('#rowsPicker [data-rows="8"]', node => node.getAttribute("aria-checked")), "true");
    assert.equal(await text(page, "#tableRtp"), "97.11%");
    assert.equal(await text(page, "#betAmount"), "100");
  });
});

test("a drop the balance cannot pay is refused before any ball falls", async () => {
  await scene({ bankroll: 40, settings: { balls: 5, bet: 10 } }, async page => {
    await page.click("#btnDrop");
    await page.waitForFunction(() => /Not enough balance/.test(document.getElementById("toast").textContent));
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 40);
    assert.equal(await stored(page, "pit.pegboard.round"), null);
  });
});

test("a reload while the balls fall settles the very same drop", async () => {
  const paths = Array.from({ length: 20 }, (_, i) => Array.from({ length: 16 }, (_, row) => ((i * 7 + row * 3) % 5) < 2 ? "R" : "L").join(""));
  const expected = Engine.settle(100, 16, "medium", paths);
  await scene({ motion: true, settings: { rows: 16, risk: "medium", balls: 20, bet: 100, animationSpeed: "cinematic" }, paths }, async page => {
    await page.click("#btnDrop");
    await page.waitForFunction(() => document.body.dataset.phase === "dropping");
    const round = await stored(page, "pit.pegboard.round");
    assert.deepEqual(round.paths, paths, "every path is saved before the first ball falls");
    assert.equal(round.stake, 2000);
    assert.equal(await stored(page, "pit.bankroll"), 8000, "the stake left the balance first");
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => localStorage.getItem("pit.pegboard.round") === null && document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 8000 + expected.returned);
    assert.match(await text(page, "#toast"), /Your unfinished drop was settled: 20 balls/);
    assert.equal((await stored(page, "pit.pegboard.stats")).drops, 20);
  });
});

test("Turkish names the board, the multiples and the result", async () => {
  await scene({ lang: "tr", settings: { rows: 8, risk: "low", balls: 1, bet: 10 }, paths: ["LRLRLRLR"] }, async page => {
    assert.equal(await page.$eval("html", node => node.lang), "tr");
    assert.equal(await text(page, "#bannerText"), "Bahsinizi seçin ve bırakın");
    assert.equal(await page.$eval("#board", node => node.getAttribute("aria-label")), "Tahta: 8 sıra çivi, düşük risk");
    assert.equal(await text(page, "#btnDrop"), "Bırak");
    await drop(page);
    assert.equal(await text(page, "#bannerText"), "0,5×: $5 geri döndü");
    assert.equal(await text(page, "#tableRtp"), "%97,11", "the sign goes first in Turkish");
    assert.deepEqual(await texts(page, "#history li"), ["0,5×"]);
  });
});

test("a round left open at another table holds the drop back", async () => {
  await scene({ seed: { "pit.blackjack.round": { v: 1, resume: "player" } } }, async page => {
    await page.click("#btnDrop");
    await page.waitForFunction(() => /Finish the round still open at Table 21 first/.test(document.getElementById("toast").textContent));
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 10000);
    assert.equal(await stored(page, "pit.pegboard.round"), null);
  });
});

// Layouts. From desktops to the smallest phones, upright and on their side,
// in both languages: nothing scrolls, the board keeps inside its place on
// the felt, the parts of the felt never overlap, and every control stays on
// the screen, before a drop and after twenty balls have filled the history.
const LAYOUT_VIEWPORTS = [
  [1440, 900], [1280, 800], [1024, 768], [768, 1024], [932, 430], [844, 390],
  [740, 360], [667, 375], [568, 320], [390, 844], [360, 640], [320, 568]
];

// An emulated resize reaches the page in steps: elements already on the page
// keep the sizes they took from the old vw and vh for a frame or more. A
// 100vw x 100vh box placed before the resize catches up with them, so wait
// for it, then until the layout stops moving (see blackjack.spec.cjs).
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
  await page.evaluate(() => { window.layoutKey = ""; window.layoutStill = 0; });
  await page.waitForFunction(() => {
    const key = [".table-felt", ".controls", ".board-wrap", ".peg-side"].map(selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return [r.left, r.top, r.width, r.height].map(Math.round).join(",");
    }).join("|") + "|" + document.documentElement.scrollHeight;
    window.layoutStill = key === window.layoutKey ? window.layoutStill + 1 : 0;
    window.layoutKey = key;
    return window.layoutStill >= 3;
  }, { polling: "raf", timeout: 3000 });
}

// Runs in the page. Returns readable descriptions of every layout problem.
function layoutProblems() {
  const out = [];
  const rect = node => node.getBoundingClientRect();
  const shown = node => {
    for (let item = node; item && item !== document.body; item = item.parentElement) {
      const style = getComputedStyle(item);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    const r = rect(node);
    return r.width > 0 && r.height > 0;
  };
  const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  const felt = rect(document.querySelector(".table-felt"));
  const parts = [".felt-head", ".board-wrap", ".peg-side"].map(selector => ({ selector, node: document.querySelector(selector) }))
    .filter(part => shown(part.node));
  parts.forEach(part => {
    const r = rect(part.node);
    if (r.left < felt.left - 1 || r.right > felt.right + 1 || r.top < felt.top - 1 || r.bottom > felt.bottom + 1) out.push(part.selector + " leaves the felt");
  });
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (overlap(rect(parts[i].node), rect(parts[j].node))) out.push(parts[i].selector + " overlaps " + parts[j].selector);
    }
  }
  const place = rect(document.querySelector(".board-wrap"));
  document.querySelectorAll("#board .peg, #board .slot rect").forEach(node => {
    const r = rect(node);
    if (r.left < place.left - 1 || r.right > place.right + 1 || r.top < place.top - 1 || r.bottom > place.bottom + 1) out.push("the board leaves its place");
  });
  document.querySelectorAll(".controls button, .peg-side button, #bankroll, #settingsBtn").forEach(node => {
    if (!shown(node)) return;
    const r = rect(node);
    if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push((node.id || node.getAttribute("data-value") || node.className.split(" ")[0]) + " leaves the screen");
  });
  // A choice whose word does not fit its button is cut off inside it.
  document.querySelectorAll(".peg-side .seg-btn, .balls-picker .seg-btn, #btnDrop").forEach(node => {
    if (shown(node) && node.scrollWidth > node.clientWidth + 1) out.push("\"" + node.textContent.trim() + "\" is cut off");
  });
  // A large total must stay beside the main buttons, not run under them.
  const total = document.querySelector(".bet-total strong");
  document.querySelectorAll(".action-row .deal-btn, .action-row .fold-btn").forEach(button => {
    if (shown(total) && shown(button) && overlap(rect(total), rect(button))) out.push("the total runs under #" + button.id);
  });
  if (overlap(rect(document.querySelector(".controls")), felt)) out.push("the controls overlap the felt");
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push("horizontal scroll");
  if (document.documentElement.scrollHeight > innerHeight + 1) out.push("page " + document.documentElement.scrollHeight + "px tall");
  return [...new Set(out)];
}

async function sweepLayouts(page, moment) {
  const found = [];
  for (const [width, height] of LAYOUT_VIEWPORTS) {
    await resizeTo(page, width, height);
    const problems = [...await page.evaluate(layoutProblems), ...await page.evaluate(unreachableControls)];
    for (const problem of new Set(problems)) found.push(width + "x" + height + " " + moment + ": " + problem);
  }
  return found;
}

for (const lang of ["en", "tr"]) {
  test(lang + ": the machine fits every size, before a drop and after twenty balls", async () => {
    // The largest drop, twenty balls of $5,000, makes the longest totals.
    await scene({ lang, bankroll: 1000000, settings: { rows: 16, risk: "high", balls: 20, bet: 5000 } }, async page => {
      const problems = await sweepLayouts(page, "before");
      await resizeTo(page, 1280, 800);
      await drop(page);
      assert.equal(await page.$$eval("#history li", nodes => nodes.length), 12, "the history holds the last twelve");
      problems.push(...await sweepLayouts(page, "after"));
      await page.screenshot({ path: path.join(artifacts, lang + "-320x568-after.png") });
      assert.deepEqual(problems, []);
    });
  });
}

test("installed, the machine drops offline", async () => {
  workerRevision++;
  await scene({ web: true, settings: { rows: 8, risk: "low", balls: 1, bet: 10 }, paths: ["LLLLLLLL"] }, async page => {
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, { timeout: 15000 }).catch(async () => {
      await page.reload();
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 });
    });
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    await drop(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 10 + 60, "the edge of the 8-row low board pays 6×");
    await page.setOfflineMode(false);
  });
});
