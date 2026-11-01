/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// Real-browser suite for Wheel 54. Puppeteer is a development dependency only;
// the table never loads it.
// npm run test:browser  (or: PIT_PUPPETEER_PATH=/absolute/path/to/puppeteer node --test this-file)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { startServer } = require("./server.cjs");
const puppeteer = require(process.env.PIT_PUPPETEER_PATH || "puppeteer");
const root = path.resolve(__dirname, "../..");
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "thepit-bigsix-"));
let browser, server, workerRevision = 0;

test.before(async () => {
  server = await startServer(root, () => "pit-v" + (1500 + workerRevision));
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 20000, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  console.log("Browser: " + await browser.version());
  console.log("Screenshots: " + artifacts);
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

const fileURL = () => pathToFileURL(path.join(root, "games/bigsix/index.html")).href;

// Opens Wheel 54 in a fresh profile. options: web, width, height, motion,
// bankroll, lang, settings, spins (the segments to come, e.g. [0, 13]) and seed.
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
    if (!localStorage.getItem("spec.seeded")) {
      localStorage.setItem("pit.bankroll", JSON.stringify(config.bankroll == null ? 10000 : config.bankroll));
      localStorage.setItem("pit.lang", config.lang || "en");
      localStorage.setItem("pit.bigsix.settings", JSON.stringify(Object.assign({ animationSpeed: "fast" }, config.settings)));
      localStorage.setItem("pit.bigsix.sound", "false");
      localStorage.setItem("spec.spins", JSON.stringify(config.spins || []));
      Object.keys(config.seed || {}).forEach(key => localStorage.setItem(key, JSON.stringify(config.seed[key])));
      localStorage.setItem("spec.seeded", "true");
    }
    Object.defineProperty(window, "BigSixEngine", {
      configurable: true,
      set(api) {
        // The segments given come first, across reloads; then real spins.
        const spin = api.spin;
        api.spin = function () {
          const queue = JSON.parse(localStorage.getItem("spec.spins") || "[]");
          if (!queue.length) return spin.apply(api, arguments);
          const next = queue.shift();
          localStorage.setItem("spec.spins", JSON.stringify(queue));
          return next;
        };
        Object.defineProperty(window, "BigSixEngine", { value: api, writable: true, configurable: true });
      }
    });
  }, options);
  try {
    await page.goto(options.web ? server.origin + "/games/bigsix/index.html" : fileURL(), { waitUntil: "load" });
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
async function bet(page, key, times) { for (let i = 0; i < (times || 1); i++) await page.click('[data-bet="' + key + '"]'); }
async function spin(page) {
  const before = await page.evaluate(() => (JSON.parse(localStorage.getItem("pit.bigsix.stats")) || { spins: 0 }).spins);
  await page.click("#btnSpin");
  await page.waitForFunction(spins => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false" &&
    (JSON.parse(localStorage.getItem("pit.bigsix.stats")) || { spins: 0 }).spins === spins + 1, { timeout: 20000 }, before);
}
async function watchBanner(page) {
  await page.evaluate(() => {
    window.bannerLines = [];
    const node = document.getElementById("banner");
    new MutationObserver(() => window.bannerLines.push(node.textContent.replace(/\s+/g, " ").trim())).observe(node, { childList: true, characterData: true, subtree: true });
  });
  return () => page.evaluate(() => window.bannerLines.join("\n"));
}
// The segment under the pointer, read from how far the wheel has turned.
const underPointer = page => page.$eval("#wheelRotor", node => {
  const degrees = Number(/rotate\((-?[\d.]+)deg\)/.exec(node.style.transform)[1]);
  return Math.round((((360 - degrees) % 360) + 360) % 360 / (360 / 54)) % 54;
});

// Segment 13 is a $20, segment 0 the Joker, segment 2 a $1.
test("a spin plays straight from file:// and pays the symbol that comes up", async () => {
  await scene({ spins: [13] }, async page => {
    assert.equal(await page.$$eval("#wheelRotor .wedge", nodes => nodes.length), 54);
    await chip(page, 5);
    await bet(page, "twenty", 2);                    // $10 at 20 to 1
    await bet(page, "one", 4);                       // $20, loses
    assert.equal(await text(page, "#layoutTotal"), "30");
    const lines = await watchBanner(page);
    await spin(page);
    assert.match(await lines(), /The wheel stops on \$20/);
    assert.match(await lines(), /You win \$210/);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 30 + 210);
    assert.equal(await underPointer(page), 13, "the wheel stops with the segment under the pointer");
    assert.equal(await page.$eval('.wedge[data-segment="13"]', node => node.classList.contains("landed")), true);
    assert.equal(await stored(page, "pit.bigsix.round"), null);
    assert.equal(await page.$$eval(".bet-chip", nodes => nodes.length), 0, "the layout clears");
    assert.deepEqual(await page.$$eval("#history li", nodes => nodes.map(n => [n.textContent, n.className])), [["20", "symbol-twenty latest"]]);
    const stats = await stored(page, "pit.bigsix.stats");
    assert.deepEqual([stats.spins, stats.winningSpins, stats.jackpots, stats.wagered, stats.returned, stats.biggestWin], [1, 1, 0, 30, 210, 180]);
  });
});

test("the Joker pays 40 to 1 and counts as a jackpot; the wheel always turns forward", async () => {
  await scene({ spins: [0, 2], motion: true }, async page => {
    await chip(page, 5);
    await bet(page, "joker");
    await bet(page, "logo");
    await page.click("#btnSpin");
    await page.waitForFunction(() => document.body.dataset.phase === "spinning");
    await page.waitForFunction(() => document.body.dataset.phase === "settling", { timeout: 20000 });
    assert.deepEqual(await page.$$eval(".spot.lit", nodes => nodes.map(n => n.dataset.bet)), ["joker"]);
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false", { timeout: 20000 });
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 10 + 205);
    assert.equal((await stored(page, "pit.bigsix.stats")).jackpots, 1);
    const first = await page.$eval("#wheelRotor", node => node.style.transform);
    await page.click("#btnRebet");
    await spin(page);
    const second = await page.$eval("#wheelRotor", node => node.style.transform);
    const turn = value => Number(/rotate\((-?[\d.]+)deg\)/.exec(value)[1]);
    assert.ok(turn(second) - turn(first) >= 4 * 360, "every spin turns the wheel four times and more");
    assert.equal(await underPointer(page), 2);
  });
});

test("a reload while the wheel turns settles the same spin", async () => {
  await scene({ spins: [27], motion: true, settings: { animationSpeed: "cinematic" } }, async page => {
    await bet(page, "logo");
    await page.click("#btnSpin");
    await page.waitForFunction(() => document.body.dataset.phase === "spinning");
    const round = await stored(page, "pit.bigsix.round");
    assert.equal(round.segment, 27);
    assert.deepEqual(round.bets, { logo: 25 });
    assert.equal(await stored(page, "pit.bankroll"), 9975, "the bet left the balance before the wheel turned");
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.busy === "false" && localStorage.getItem("pit.bigsix.round") === null);
    assert.equal(await stored(page, "pit.bankroll"), 9975 + 25 * 41);
    assert.match(await text(page, "#toast"), /The wheel stops on Logo\. You win \$1,025/);
    assert.equal(await underPointer(page), 27, "the wheel shows the spin it settled");
  });
});

test("table limits, undo, clear and rebet, from the keyboard too", async () => {
  await scene({ spins: [2] }, async page => {
    await chip(page, 500);
    await bet(page, "joker");
    assert.match(await text(page, "#toast"), /Table maximum for this bet: \$125/);
    assert.equal(await page.$eval('[data-stack="joker"] .bet-chip', node => node.dataset.amount), "125");
    await page.keyboard.press("z");
    assert.equal(await page.$$eval(".bet-chip", nodes => nodes.length), 0);
    await page.keyboard.press("2");
    await bet(page, "one");
    await bet(page, "two");
    await page.keyboard.press("c");
    assert.equal(await page.$$eval(".bet-chip", nodes => nodes.length), 0);
    await bet(page, "one");
    await bet(page, "five");
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press(" ");
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false" &&
      localStorage.getItem("pit.bigsix.stats") !== null, { timeout: 20000 });
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 50 + 50);
    assert.deepEqual(await stored(page, "pit.bigsix.lastBets"), { one: 25, five: 25 });
    await page.keyboard.press("r");
    assert.equal(await text(page, "#layoutTotal"), "50");
  });
});

test("Turkish names the bets, the odds and the stop", async () => {
  await scene({ spins: [6], lang: "tr" }, async page => {
    assert.equal(await page.$eval("html", node => node.lang), "tr");
    assert.equal(await text(page, "#btnSpin"), "Çevir");
    assert.equal(await text(page, '[data-bet="ten"] .spot-pay'), "1'E 10");
    assert.equal(await text(page, '[data-bet="one"] .spot-count'), "54'te 24");
    await bet(page, "ten");
    const lines = await watchBanner(page);
    await spin(page);
    assert.match(await lines(), /Çark \$10 üzerinde durdu/);
    assert.match(await lines(), /\$275 kazandınız/);
  });
});

test("a round left open at another table holds the spin back", async () => {
  await scene({ seed: { "pit.blackjack.round": { v: 1, resume: "player" } } }, async page => {
    await bet(page, "one");
    await page.click("#btnSpin");
    await page.waitForFunction(() => /Finish the round still open at Table 21 first/.test(document.getElementById("toast").textContent));
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 10000);
    assert.equal(await stored(page, "pit.bigsix.round"), null);
  });
});

for (const size of [[320, 568], [360, 640], [390, 844], [768, 1024], [844, 390], [1280, 720], [1920, 1080]]) {
  test("the table fits " + size[0] + "×" + size[1] + " without scrolling the page", async () => {
    await scene({ width: size[0], height: size[1], spins: [13] }, async page => {
      await bet(page, "twenty");
      await spin(page);
      await bet(page, "one");
      const box = await page.evaluate(() => {
        const inside = sel => [...document.querySelectorAll(sel)].every(node => {
          const r = node.getBoundingClientRect();
          return r.width > 0 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
        });
        const felt = document.getElementById("tableFelt").getBoundingClientRect();
        const wheel = document.getElementById("wheel").getBoundingClientRect();
        const spots = [...document.querySelectorAll(".spot")].map(n => n.getBoundingClientRect());
        const overlaps = spots.some((a, i) => spots.some((b, j) => j > i &&
          a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
        const onWheel = spots.some(s => s.left < wheel.right - 1 && wheel.left < s.right - 1 && s.top < wheel.bottom - 1 && wheel.top < s.bottom - 1);
        return {
          scroll: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
          controls: inside("#btnSpin, .chips-tray .chip, #bankroll, .spot"),
          wheel: wheel.width >= 150 && wheel.top >= felt.top - 1 && wheel.bottom <= felt.bottom + 1 && wheel.left >= felt.left - 1 && wheel.right <= felt.right + 1,
          room: spots.every(b => b.width >= 50 && b.height >= 28),
          overlaps: overlaps || onWheel
        };
      });
      assert.ok(box.scroll, "no page scroll");
      assert.ok(box.controls, "every bet and control is on screen");
      assert.ok(box.wheel, "the whole wheel stands on the felt");
      assert.ok(box.room, "every spot has room");
      assert.ok(!box.overlaps, "no spot overlaps another or the wheel");
      await page.screenshot({ path: path.join(artifacts, "fit-" + size.join("x") + ".png") });
    });
  });
}

test("installed, the wheel spins offline", async () => {
  workerRevision++;
  await scene({ web: true, spins: [2, 2] }, async page => {
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, { timeout: 15000 }).catch(async () => {
      await page.reload();
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 });
    });
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    await bet(page, "one");
    await spin(page);
    assert.equal(await stored(page, "pit.bankroll"), 10025);
    await page.setOfflineMode(false);
  });
});
