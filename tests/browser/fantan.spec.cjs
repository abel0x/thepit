/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// Real-browser suite for Table 4. Puppeteer is a development dependency only;
// the table never loads it.
// npm run test:browser  (or: PIT_PUPPETEER_PATH=/absolute/path/to/puppeteer node --test this-file)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { startServer } = require("./server.cjs");
const { unreachableControls } = require("./reach.cjs");
const Engine = require("../../games/fantan/js/engine.js");
const puppeteer = require(process.env.PIT_PUPPETEER_PATH || "puppeteer");
const root = path.resolve(__dirname, "../..");
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "thepit-fantan-"));
let browser, server, workerRevision = 0;

test.before(async () => {
  server = await startServer(root, () => "pit-v" + (400 + workerRevision));
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 20000, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  console.log("Browser: " + await browser.version());
  console.log("Screenshots: " + artifacts);
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

const fileURL = () => pathToFileURL(path.join(root, "games/fantan/index.html")).href;

// Opens Table 4 in a fresh profile. options: web, width, height, motion,
// bankroll, lang, settings, piles (the beads the next rounds take, in turn)
// and seed (more saved values).
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
      localStorage.setItem("pit.fantan.settings", JSON.stringify(Object.assign({ animationSpeed: "fast" }, config.settings)));
      localStorage.setItem("pit.fantan.sound", "false");
      Object.keys(config.seed || {}).forEach(key => localStorage.setItem(key, JSON.stringify(config.seed[key])));
      localStorage.setItem("spec.seeded", "true");
    }
    Object.defineProperty(window, "FanTanEngine", {
      configurable: true,
      set(api) {
        if (config.piles) {
          let next = 0;
          api.drawBeads = function () { return config.piles[next++ % config.piles.length]; };
        }
        Object.defineProperty(window, "FanTanEngine", { value: api, writable: true, configurable: true });
      }
    });
  }, options);
  try {
    await page.goto(options.web ? server.origin + "/games/fantan/index.html" : fileURL(), { waitUntil: "load" });
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
async function chip(page, value) { await page.click('.chip[data-value="' + value + '"]'); }
async function bet(page, key, times) { for (let i = 0; i < (times || 1); i++) await page.click('.spot[data-bet="' + key + '"]'); }
async function settled(page) {
  await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false" &&
    localStorage.getItem("pit.fantan.round") === null, { timeout: 20000 });
}
async function open(page) {
  await page.click("#btnOpen");
  await settled(page);
}

test("a round plays straight from file://: Fan pays 3 to 1 less 5%, and the change waits in the box", async () => {
  await scene({ piles: [66] }, async page => {
    assert.equal(await page.$eval("#boxSpec", node => node.hidden), true, "an empty box is not shown");
    await chip(page, 25); await bet(page, "fan2");
    assert.equal(await text(page, "#bankroll"), "9,975");
    await open(page);
    // $25 at 3 to 1 less 5%: $71.25 won, $71 paid with the stake, 25¢ kept.
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 25 + 96);
    assert.equal(await stored(page, "pit.fantan.box"), 30);
    assert.equal(await page.$eval("#boxSpec", node => node.hidden), false);
    assert.equal(await text(page, "#boxAmount"), "$0.25");
    assert.equal(await text(page, "#bannerText"), "66 beads: 2 left");
    assert.equal(await text(page, "#bannerSub"), "You win $71");
    assert.equal(await text(page, "#bowlResult"), "2");
    assert.equal(await page.$$eval("#beads .bead.left", nodes => nodes.length), 2);
    assert.deepEqual(await page.$$eval("#results .result", nodes => nodes.map(node => node.textContent)), ["2"]);
    assert.equal(await page.$eval('.spot[data-bet="fan2"]', node => node.classList.contains("lit")), true);
    const stats = await stored(page, "pit.fantan.stats");
    assert.deepEqual([stats.rounds, stats.winningRounds, stats.twos, stats.wagered, stats.returned], [1, 1, 1, 25, 96]);
  });
});

test("the box makes up the dollar on a later win", async () => {
  await scene({ piles: [66, 69] }, async page => {
    await chip(page, 5); await bet(page, "kwok12", 2);
    await open(page);
    // $10 at even money less 5%: $9.50, so $19 now and 50¢ in the box.
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 10 + 19);
    assert.equal(await text(page, "#boxAmount"), "$0.50");
    await page.keyboard.press("r");
    await open(page);
    assert.equal(await stored(page, "pit.bankroll"), 10009 - 10 + 20, "69 beads leave 1: the box pays the half dollar");
    assert.equal(await stored(page, "pit.fantan.box"), 0);
    assert.equal(await page.$eval("#boxSpec", node => node.hidden), true);
    assert.deepEqual(await page.$$eval("#results .result", nodes => nodes.map(node => node.textContent)), ["1", "2"], "newest first");
  });
});

test("Nim and Nga Tan are returned on their other number, beside a winning Fan", async () => {
  await scene({ piles: [67] }, async page => {
    await chip(page, 5);
    await bet(page, "nim13", 2); await bet(page, "tan123", 2); await bet(page, "fan3");
    await open(page);
    // 67 beads leave 3: both are returned, the Fan wins $14.25.
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 25 + 39);
    assert.equal(await stored(page, "pit.fantan.box"), 30);
    const mark = key => page.$eval('.spot[data-bet="' + key + '"]', node => node.classList.contains("lit") ? "lit" : node.classList.contains("returned") ? "returned" : "");
    assert.deepEqual([await mark("nim13"), await mark("tan123"), await mark("fan3"), await mark("fan1")], ["returned", "returned", "lit", ""]);
    await bet(page, "odd");
    assert.equal(await page.$$eval(".spot.lit, .spot.returned", nodes => nodes.length), 0, "the next bet clears the marks");
  });
});

test("the pile is saved before the bowl is lifted, and a reload settles the very same round", async () => {
  const bets = { fan4: 100, even: 100, ssh234: 100 };
  const expected = Engine.settle(bets, Engine.remainderOf(80), 0);
  await scene({ motion: true, settings: { animationSpeed: "cinematic" }, piles: [80] }, async page => {
    await chip(page, 100);
    await bet(page, "fan4"); await bet(page, "even"); await bet(page, "ssh234");
    await page.click("#btnOpen");
    await page.waitForFunction(() => document.body.dataset.phase === "counting");
    const round = await stored(page, "pit.fantan.round");
    assert.equal(round.beads, 80);
    assert.deepEqual(round.bets, bets);
    assert.equal(await stored(page, "pit.bankroll"), 9700, "the stake left the balance first");
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => localStorage.getItem("pit.fantan.round") === null && document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 9700 + expected.paid);
    assert.equal(await stored(page, "pit.fantan.box"), expected.box);
    assert.match(await text(page, "#toast"), /Your unfinished round was settled: 80 beads: 4 left/);
    assert.equal(await text(page, "#bowlCount"), "80 beads, 4 left");
  });
});

test("bets stop at each table maximum; undo, clear, double and rebet work from the keyboard", async () => {
  await scene({ piles: [70] }, async page => {
    await chip(page, 5000); await bet(page, "fan1");
    assert.equal(await page.$eval('.spot[data-bet="fan1"] .bet-chip', node => node.dataset.amount), "2500");
    assert.match(await text(page, "#toast"), /\$2,500/);
    await page.keyboard.press("c");
    const amounts = () => page.$$eval(".spot-stack .bet-chip", nodes => nodes.map(n => n.dataset.amount));
    assert.deepEqual(await amounts(), []);
    await page.keyboard.press("2");                 // the $25 chip
    await page.keyboard.press("o");
    await page.keyboard.press("e");
    await page.keyboard.press("d");
    assert.deepEqual(await amounts(), ["50", "50"]);
    await page.keyboard.press("z");
    assert.deepEqual(await amounts(), ["25", "25"]);
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press("Enter");
    await settled(page);
    // 70 beads leave 2: Even wins $23.75, Odd loses.
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 50 + 48);
    await page.keyboard.press("r");
    assert.deepEqual(await amounts(), ["25", "25"]);
  });
});

test("Turkish names the bets, the count and the change", async () => {
  await scene({ lang: "tr", piles: [66] }, async page => {
    assert.equal(await page.$eval("html", node => node.lang), "tr");
    assert.equal(await text(page, "#bannerText"), "Bahislerinizi yapın");
    assert.equal(await text(page, '.spot[data-bet="odd"] .spot-name'), "Tek");
    assert.equal(await text(page, ".section-tan .section-pay"), "2'YE 1");
    assert.equal(await page.$eval('.spot[data-bet="nim21"]', node => node.getAttribute("aria-label")),
      "2 NIM 1. 2 gelirse kazanır, 1 gelirse geri döner, 1'e 2 öder. Bahis: $0");
    await chip(page, 25); await bet(page, "fan2");
    await open(page);
    assert.equal(await text(page, "#bannerText"), "66 boncuk: 2 kaldı");
    assert.equal(await text(page, "#bannerSub"), "$71 kazandınız");
    assert.equal(await text(page, "#boxAmount"), "$0,25");
    assert.equal(await text(page, "#btnOpen"), "Aç");
  });
});

test("a round left open at another table holds the bowl back", async () => {
  await scene({ seed: { "pit.blackjack.round": { v: 1, resume: "player" } } }, async page => {
    await bet(page, "odd");
    await page.click("#btnOpen");
    await page.waitForFunction(() => /Finish the round still open at Table 21 first/.test(document.getElementById("toast").textContent));
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 10000);
    assert.equal(await stored(page, "pit.fantan.round"), null);
  });
});

// Layouts. From desktops to the smallest phones, upright and on their side,
// in both languages: nothing scrolls but the layout itself where it must,
// nothing leaves the felt or the screen, the parts of the felt never
// overlap, and a full stack of five chips on a spot of every kind stays
// inside it and clear of its name, before the bowl is lifted and after.
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
    const key = [".table-felt", ".controls", ".bowl", ".layout"].map(selector => {
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
  const parts = [".felt-head", ".bowl-area", ".layout"].map(selector => ({ selector, node: document.querySelector(selector) }))
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
  if (rect(document.querySelector(".bowl")).width < 60) out.push("the bowl is too small");
  document.querySelectorAll(".spot").forEach(spot => {
    const box = rect(spot), label = spot.querySelector(".spot-name");
    if (label.scrollWidth > label.clientWidth + 1) out.push(spot.dataset.bet + ": its name is cut off");
    spot.querySelectorAll(".bet-chip").forEach(stack => {
      const r = rect(stack);
      if (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1) out.push(spot.dataset.bet + ": chips leave the spot");
      if (overlap(r, rect(label))) out.push(spot.dataset.bet + ": chips cover its name");
    });
  });
  document.querySelectorAll(".controls button, #bankroll, #settingsBtn").forEach(node => {
    if (!shown(node)) return;
    const r = rect(node);
    if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push((node.id || node.getAttribute("data-value") || "a button") + " leaves the screen");
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
  test(lang + ": the table fits every size, with full stacks on a spot of every kind", async () => {
    await scene({ lang, piles: [72] }, async page => {
      // Five different chips make the tallest stack: $1,630 on each.
      for (const value of [5, 25, 100, 500, 1000]) {
        await chip(page, value);
        for (const key of ["fan3", "kwok41", "even", "ssh412", "nim43", "tan342"]) await bet(page, key);
      }
      const problems = await sweepLayouts(page, "betting");
      await resizeTo(page, 1280, 800);
      await open(page);
      await page.keyboard.press("r");
      problems.push(...await sweepLayouts(page, "after"));
      await page.screenshot({ path: path.join(artifacts, lang + "-320x568.png") });
      assert.deepEqual(problems, []);
    });
  });
}

test("installed, the table plays offline", async () => {
  workerRevision++;
  await scene({ web: true, piles: [41] }, async page => {
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, { timeout: 15000 }).catch(async () => {
      await page.reload();
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 });
    });
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    await chip(page, 100); await bet(page, "odd");
    await open(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 + 95, "41 beads leave 1: Odd wins $95");
    await page.setOfflineMode(false);
  });
});
