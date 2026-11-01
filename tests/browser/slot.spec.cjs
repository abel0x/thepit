/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// Real-browser suite for Slot 5. Puppeteer is a development dependency only;
// the machine never loads it.
// npm run test:browser  (or: PIT_PUPPETEER_PATH=/absolute/path/to/puppeteer node --test this-file)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { startServer } = require("./server.cjs");
const Engine = require("../../games/slot/js/engine.js");
const puppeteer = require(process.env.PIT_PUPPETEER_PATH || "puppeteer");
const root = path.resolve(__dirname, "../..");
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "thepit-slot-"));
let browser, server, workerRevision = 0;

// Spins whose results are known: four sevens on line 1 and three jacks on
// line 18, nothing at all, and every star in sight.
const WIN = [31, 8, 8, 3, 20];
const LOSE = [0, 0, 5, 11, 0];
const STARS = Engine.STRIPS.map(strip => (strip.indexOf("star") - 1 + strip.length) % strip.length);
const FREE = Array.from({ length: Engine.FREE_SPINS }, (unused, i) => [i, i * 3 % 32, i * 5 % 32, i * 7 % 32, i * 11 % 32]);

test.before(async () => {
  server = await startServer(root, () => "pit-v" + (1000 + workerRevision));
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 20000, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  console.log("Browser: " + await browser.version());
  console.log("Screenshots: " + artifacts);
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

const fileURL = () => pathToFileURL(path.join(root, "games/slot/index.html")).href;

// Opens Slot 5 in a fresh profile. options: web, width, height, motion,
// bankroll, lang, settings, spins (the paid spins to come, each { stops,
// free }) and seed (more saved values).
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
      localStorage.setItem("pit.slot.settings", JSON.stringify(Object.assign({ animationSpeed: "fast", lineBet: 5 }, config.settings)));
      localStorage.setItem("pit.slot.sound", "false");
      localStorage.setItem("spec.spins", JSON.stringify(config.spins || []));
      Object.keys(config.seed || {}).forEach(key => localStorage.setItem(key, JSON.stringify(config.seed[key])));
      localStorage.setItem("spec.seeded", "true");
    }
    Object.defineProperty(window, "SlotEngine", {
      configurable: true,
      set(api) {
        // The spins given come first, across reloads; then the machine's own.
        const play = api.play;
        api.play = function () {
          const queue = JSON.parse(localStorage.getItem("spec.spins") || "[]");
          if (!queue.length) return play.apply(api, arguments);
          const next = queue.shift();
          localStorage.setItem("spec.spins", JSON.stringify(queue));
          return { stops: next.stops, free: next.free || null };
        };
        Object.defineProperty(window, "SlotEngine", { value: api, writable: true, configurable: true });
      }
    });
  }, options);
  try {
    await page.goto(options.web ? server.origin + "/games/slot/index.html" : fileURL(), { waitUntil: "load" });
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
async function spinAndSettle(page) {
  await page.click("#btnSpin");
  await page.waitForFunction(() => document.body.dataset.phase !== "betting" || localStorage.getItem("pit.slot.round") === null);
  await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false" &&
    localStorage.getItem("pit.slot.round") === null, { timeout: 30000 });
}

test("a spin plays straight from file:// and pays every winning line", async () => {
  await scene({ spins: [{ stops: WIN }] }, async page => {
    assert.equal(await text(page, "#totalBet"), "100");
    await spinAndSettle(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 100 + 775);
    assert.equal(await text(page, "#winMeter"), "775");
    const lines = await page.$$eval("#winList li", nodes => nodes.map(n => n.textContent));
    assert.deepEqual(lines, ["Line 1: 4 × Seven, $750", "Line 18: 3 × Jack, $25"]);
    assert.equal(await page.$$eval("#paylines polyline", nodes => nodes.length), 2);
    assert.equal(await page.$$eval(".cell.win", nodes => nodes.length), 7);
    const stats = await stored(page, "pit.slot.stats");
    assert.deepEqual([stats.spins, stats.winningSpins, stats.wagered, stats.returned], [1, 1, 100, 775]);
  });
});

test("a losing spin takes the bet and says so", async () => {
  await scene({ spins: [{ stops: LOSE }] }, async page => {
    await spinAndSettle(page);
    assert.equal(await stored(page, "pit.bankroll"), 9900);
    assert.equal(await text(page, "#bannerText"), "No win this spin");
    assert.equal(await page.$$eval("#winList li", nodes => nodes.length), 0);
  });
});

test("five stars pay and bring ten free spins at triple pay", async () => {
  const spin = { stops: STARS, free: FREE };
  const expected = Engine.settle(spin, 1);
  await scene({ spins: [spin], settings: { lineBet: 1 } }, async page => {
    await spinAndSettle(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 20 + expected.returned);
    assert.ok(expected.returned >= 100 * 20, "five stars alone pay 100 times the bet");
    const stats = await stored(page, "pit.slot.stats");
    assert.deepEqual([stats.features, stats.freeSpinsWon], [1, 10]);
    assert.equal(await page.$eval("#featureBar", node => node.hidden), true, "the feature bar goes once the free spins end");
  });
});

test("the free spins show their count while they play", async () => {
  await scene({ spins: [{ stops: STARS, free: FREE }], motion: true }, async page => {
    await page.click("#btnSpin");
    await page.waitForFunction(() => /Free spin 1 of 10 · ×3/.test(document.getElementById("featureBar").textContent), { timeout: 15000 });
    assert.equal(await page.$eval("body", node => node.dataset.phase), "feature");
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false", { timeout: 60000 });
  });
});

test("a reload while the reels turn settles the same spin, free spins and all", async () => {
  const spin = { stops: STARS, free: FREE };
  const expected = Engine.settle(spin, 5);
  await scene({ spins: [spin], motion: true, settings: { animationSpeed: "cinematic" } }, async page => {
    await page.click("#btnSpin");
    await page.waitForFunction(() => document.body.dataset.phase === "spinning");
    const round = await stored(page, "pit.slot.round");
    assert.deepEqual(round.stops, STARS);
    assert.equal(round.free.length, 10);
    assert.equal(await stored(page, "pit.bankroll"), 9900, "the stake left the balance before the reels turned");
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => localStorage.getItem("pit.slot.round") === null && document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 9900 + expected.returned);
    assert.match(await text(page, "#toast"), new RegExp("settled: You win \\$" + expected.returned.toLocaleString("en-US").replace(",", ",")));
    assert.equal((await stored(page, "pit.slot.stats")).features, 1);
  });
});

test("the chips choose the bet on every line, from the keyboard too", async () => {
  await scene({ spins: [{ stops: WIN }] }, async page => {
    await page.click('.chip[data-value="25"]');
    assert.equal(await text(page, "#totalBet"), "500");
    assert.equal(await text(page, "#perLine"), "$25 a line × 20 lines");
    assert.equal(await page.$eval("#betStack .bet-chip", node => node.dataset.amount), "500");
    await page.keyboard.press("3");
    assert.equal(await text(page, "#totalBet"), "200");
    assert.equal((await stored(page, "pit.slot.settings")).lineBet, 10, "the bet is remembered");
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press(" ");
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false" &&
      localStorage.getItem("pit.slot.round") === null && localStorage.getItem("pit.slot.stats") !== null, { timeout: 30000 });
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 200 + 775 * 2, "every win scales with the line bet");
  });
});

test("a bet the balance cannot cover is refused, and an empty balance is topped up", async () => {
  await scene({ bankroll: 60 }, async page => {
    await page.click("#btnSpin");
    await page.waitForFunction(() => /Not enough balance/.test(document.getElementById("toast").textContent));
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.slot.round"), null);
    assert.equal(await stored(page, "pit.bankroll"), 60);
    assert.equal(await page.$eval('.chip[data-value="5"]', node => node.classList.contains("unaffordable")), true);
    assert.equal(await page.$eval('.chip[data-value="1"]', node => node.classList.contains("unaffordable")), false);
  });
  await scene({ bankroll: 10 }, async page => {
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("pit.bankroll")) === 10000);
  });
});

test("Turkish names the bet, the symbols and the wins", async () => {
  await scene({ spins: [{ stops: WIN }], lang: "tr" }, async page => {
    assert.equal(await page.$eval("html", node => node.lang), "tr");
    assert.equal(await text(page, "#btnSpin"), "Çevir");
    assert.equal(await text(page, "#perLine"), "Çizgi başına $5 × 20 çizgi");
    await spinAndSettle(page);
    const lines = await page.$$eval("#winList li", nodes => nodes.map(n => n.textContent));
    assert.deepEqual(lines, ["1. çizgi: 4 × Yedi, $750", "18. çizgi: 3 × Vale, $25"]);
    assert.equal(await text(page, "#bannerText"), "$775 kazandınız");
  });
});

test("the fruit set dresses the letters as fruits and pays the same", async () => {
  await scene({ spins: [{ stops: WIN }, { stops: WIN }], settings: { symbolSet: "fruit" } }, async page => {
    await spinAndSettle(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 100 + 775, "fruit pays what the cards pay");
    const lines = await page.$$eval("#winList li", nodes => nodes.map(n => n.textContent));
    assert.deepEqual(lines, ["Line 1: 4 × Seven, $750", "Line 18: 3 × Cherry, $25"]);
    const faces = await page.$$eval(".reel .cell", cells => cells.map(c => [c.dataset.symbol, c.querySelector("use").getAttribute("href")]));
    const fruit = { ace: "watermelon", king: "grapes", queen: "lemon", jack: "cherry" };
    faces.forEach(([symbol, href]) => assert.equal(href, "#sym-" + (fruit[symbol] || symbol)));
    assert.ok(faces.some(([symbol]) => symbol === "seven"), "the seven is still on the reels");
    assert.match(await page.$eval(".reels", node => node.getAttribute("aria-label")), /Cherry/);
    await page.click("#settingsBtn");
    assert.equal(await page.$eval('#paysTable tr[data-symbol="ace"] th span', n => n.textContent), "Watermelon");
    assert.equal(await page.$eval('#paysTable tr[data-symbol="seven"] use', n => n.getAttribute("href")), "#sym-seven");
    await page.screenshot({ path: path.join(artifacts, "fruit-pays.png") });

    // Back to cards: the reels, the list and the table follow at once, and stay.
    await page.click('[data-set-symbols="classic"]');
    assert.equal(await page.$eval('#paysTable tr[data-symbol="jack"] th span', n => n.textContent), "Jack");
    assert.equal(await page.$$eval('.reel .cell[data-symbol="jack"] use', nodes => nodes.every(n => n.getAttribute("href") === "#sym-jack")), true);
    assert.deepEqual(await page.$$eval("#winList li", nodes => nodes.map(n => n.textContent)), ["Line 1: 4 × Seven, $750", "Line 18: 3 × Jack, $25"]);
    assert.equal((await stored(page, "pit.slot.settings")).symbolSet, "classic");
    await page.click('[data-set-symbols="fruit"]');
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    assert.equal(await page.$eval("body", b => b.dataset.symbolSet), "fruit");
    assert.equal(await page.$eval('[data-set-symbols="fruit"]', b => b.getAttribute("aria-checked")), "true");
  });
});

test("Turkish names the fruits", async () => {
  await scene({ spins: [{ stops: WIN }], lang: "tr", settings: { symbolSet: "fruit" } }, async page => {
    await spinAndSettle(page);
    const lines = await page.$$eval("#winList li", nodes => nodes.map(n => n.textContent));
    assert.deepEqual(lines, ["1. çizgi: 4 × Yedi, $750", "18. çizgi: 3 × Kiraz, $25"]);
    assert.equal(await page.$eval('#paysTable tr[data-symbol="king"] th span', n => n.textContent), "Üzüm");
    assert.equal(await text(page, '[data-set-symbols="fruit"]'), "Meyveler");
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(artifacts, "fruit-reels.png") });
  });
});

test("a round left open at another table holds the spin back", async () => {
  await scene({ seed: { "pit.blackjack.round": { v: 1, resume: "player" } } }, async page => {
    await page.click("#btnSpin");
    await page.waitForFunction(() => /Finish the round still open at Table 21 first/.test(document.getElementById("toast").textContent));
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 10000);
    assert.equal(await stored(page, "pit.slot.round"), null);
  });
});

for (const size of [[320, 568], [360, 640], [390, 844], [768, 1024], [844, 390], [1280, 720], [1920, 1080]]) {
  test("the machine fits " + size[0] + "×" + size[1] + " without scrolling", async () => {
    await scene({ width: size[0], height: size[1], spins: [{ stops: WIN }] }, async page => {
      await spinAndSettle(page);
      const box = await page.evaluate(() => {
        const inside = sel => [...document.querySelectorAll(sel)].every(node => {
          const r = node.getBoundingClientRect();
          return r.width > 0 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
        });
        const cells = [...document.querySelectorAll(".reel .cell")].map(n => n.getBoundingClientRect());
        return {
          scroll: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
          controls: inside("#btnSpin, .chips-tray .chip, #bankroll, #totalBet, #winMeter"),
          reels: cells.length === 15 && inside(".reels"),
          square: cells.every(c => c.width > 24 && c.height > 24)
        };
      });
      assert.ok(box.scroll, "no page scroll");
      assert.ok(box.controls, "every control is on screen");
      assert.ok(box.reels, "the whole window of reels is on screen");
      assert.ok(box.square, "every symbol has room");
      await page.screenshot({ path: path.join(artifacts, "fit-" + size.join("x") + ".png") });
    });
  });
}

test("installed, the machine spins offline", async () => {
  workerRevision++;
  await scene({ web: true, spins: [{ stops: WIN }, { stops: WIN }] }, async page => {
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, { timeout: 15000 }).catch(async () => {
      await page.reload();
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 });
    });
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    await spinAndSettle(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 100 + 775);
    await page.setOfflineMode(false);
  });
});
