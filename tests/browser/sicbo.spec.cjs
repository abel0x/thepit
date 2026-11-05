/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// Real-browser suite for Table 18. Puppeteer is a development dependency only;
// the table never loads it.
// npm run test:browser  (or: PIT_PUPPETEER_PATH=/absolute/path/to/puppeteer node --test this-file)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { startServer } = require("./server.cjs");
const { resizeTo, sweepReach } = require("./reach.cjs");
const puppeteer = require(process.env.PIT_PUPPETEER_PATH || "puppeteer");
const root = path.resolve(__dirname, "../..");
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "thepit-sicbo-"));
let browser, server, workerRevision = 0;

test.before(async () => {
  server = await startServer(root, () => "pit-v" + (1300 + workerRevision));
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 20000, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  console.log("Browser: " + await browser.version());
  console.log("Screenshots: " + artifacts);
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

const fileURL = () => pathToFileURL(path.join(root, "games/sicbo/index.html")).href;

// Opens Table 18 in a fresh profile. options: web, width, height, motion,
// bankroll, lang, settings, rolls (the dice to come, e.g. [[1, 2, 3]]) and seed.
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
      localStorage.setItem("pit.sicbo.settings", JSON.stringify(Object.assign({ animationSpeed: "fast" }, config.settings)));
      localStorage.setItem("pit.sicbo.sound", "false");
      localStorage.setItem("spec.rolls", JSON.stringify(config.rolls || []));
      Object.keys(config.seed || {}).forEach(key => localStorage.setItem(key, JSON.stringify(config.seed[key])));
      localStorage.setItem("spec.seeded", "true");
    }
    Object.defineProperty(window, "SicBoEngine", {
      configurable: true,
      set(api) {
        // The dice given come first, across reloads; then real ones.
        const rollDice = api.rollDice;
        api.rollDice = function () {
          const queue = JSON.parse(localStorage.getItem("spec.rolls") || "[]");
          if (!queue.length) return rollDice.apply(api, arguments);
          const next = queue.shift();
          localStorage.setItem("spec.rolls", JSON.stringify(queue));
          return next;
        };
        Object.defineProperty(window, "SicBoEngine", { value: api, writable: true, configurable: true });
      }
    });
  }, options);
  try {
    await page.goto(options.web ? server.origin + "/games/sicbo/index.html" : fileURL(), { waitUntil: "load" });
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
async function roll(page) {
  const before = await page.evaluate(() => (JSON.parse(localStorage.getItem("pit.sicbo.stats")) || { rolls: 0 }).rolls);
  await page.click("#btnRoll");
  await page.waitForFunction(rolls => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false" &&
    (JSON.parse(localStorage.getItem("pit.sicbo.stats")) || { rolls: 0 }).rolls === rolls + 1, { timeout: 20000 }, before);
}
// Every line the banner shows from now on, read once the roll settles.
async function watchBanner(page) {
  await page.evaluate(() => {
    window.bannerLines = [];
    const node = document.getElementById("banner");
    new MutationObserver(() => window.bannerLines.push(node.textContent.replace(/\s+/g, " ").trim())).observe(node, { childList: true, characterData: true, subtree: true });
  });
  return () => page.evaluate(() => window.bannerLines.join("\n"));
}

test("a roll plays straight from file:// and pays every winning bet", async () => {
  await scene({ rolls: [[4, 4, 2]] }, async page => {
    await bet(page, "small", 4);                     // $100
    await chip(page, 5);
    await bet(page, "total10", 2);                   // $10 at 6 to 1
    await bet(page, "single4");                      // $5, two fours pay 2 to 1
    await bet(page, "big");                          // $5, loses
    await bet(page, "combo34");                      // $5, loses
    assert.equal(await text(page, "#layoutTotal"), "125");
    assert.equal(await text(page, "#bankroll"), "9,875");
    const lines = await watchBanner(page);
    await roll(page);
    assert.match(await lines(), /10, small/);
    assert.match(await lines(), /You win \$285/);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 125 + 200 + 70 + 15);
    assert.equal(await stored(page, "pit.sicbo.round"), null, "every bet is decided, so the round is over");
    assert.equal(await page.$$eval(".bet-chip", nodes => nodes.length), 0, "the layout clears");
    assert.deepEqual(await page.$$eval("#dice .die", nodes => nodes.map(n => n.dataset.face)), ["4", "4", "2"]);
    assert.deepEqual(await page.$$eval("#history li", nodes => nodes.map(n => [n.textContent, n.className])), [["10", "small latest"]]);
    const stats = await stored(page, "pit.sicbo.stats");
    assert.deepEqual([stats.rolls, stats.winningRolls, stats.wagered, stats.returned, stats.biggestWin], [1, 1, 125, 285, 160]);
  });
});

test("a triple takes Small and Big and pays the triple 180 to 1", async () => {
  await scene({ rolls: [[6, 6, 6]] }, async page => {
    await chip(page, 5);
    await bet(page, "small"); await bet(page, "big");
    await bet(page, "triple6"); await bet(page, "anyTriple");
    const lines = await watchBanner(page);
    await roll(page);
    assert.match(await lines(), /Triple 6/);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 20 + 5 * 181 + 5 * 31);
    const stats = await stored(page, "pit.sicbo.stats");
    assert.equal(stats.triples, 1);
    assert.deepEqual(await page.$$eval("#history li", nodes => nodes.map(n => n.className)), ["triple latest"]);
  });
});

test("the dice light every spot they win while the roll is paid", async () => {
  await scene({ rolls: [[1, 2, 6]], motion: true }, async page => {
    await bet(page, "odd");
    await page.click("#btnRoll");
    await page.waitForFunction(() => document.body.dataset.phase === "settling");
    const lit = await page.$$eval(".spot.lit", nodes => nodes.map(n => n.dataset.bet));
    assert.deepEqual(lit.sort(), ["combo12", "combo16", "combo26", "odd", "single1", "single2", "single6", "small", "total9"]);
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false", { timeout: 20000 });
    assert.equal(await page.$$eval(".spot.lit", nodes => nodes.length), 0);
  });
});

test("a reload while the dice shake settles the same roll", async () => {
  await scene({ rolls: [[5, 5, 1]], motion: true, settings: { animationSpeed: "cinematic" } }, async page => {
    await chip(page, 100); await bet(page, "big"); await bet(page, "double5");
    await page.click("#btnRoll");
    await page.waitForFunction(() => document.body.dataset.phase === "rolling");
    const round = await stored(page, "pit.sicbo.round");
    assert.deepEqual(round.dice, [5, 5, 1]);
    assert.deepEqual(round.bets, { big: 100, double5: 100 });
    assert.equal(await stored(page, "pit.bankroll"), 9800, "the bets left the balance before the dice showed");
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.busy === "false" && localStorage.getItem("pit.sicbo.round") === null);
    assert.equal(await stored(page, "pit.bankroll"), 9800 + 200 + 1100, "eleven is big and two fives pay the double");
    assert.match(await text(page, "#toast"), /11, big\. You win \$1,300/);
    assert.deepEqual(await page.$$eval("#dice .die", nodes => nodes.map(n => n.dataset.face)), ["5", "5", "1"]);
  });
});

test("table limits, undo, clear and rebet, from the keyboard too", async () => {
  await scene({ rolls: [[1, 1, 2]] }, async page => {
    await chip(page, 500);
    await bet(page, "triple1");
    assert.match(await text(page, "#toast"), /Table maximum for this bet: \$100/);
    assert.equal(await page.$eval('[data-stack="triple1"] .bet-chip', node => node.dataset.amount), "100");
    await bet(page, "triple1");
    assert.match(await text(page, "#toast"), /Table maximum for this bet: \$100/);
    await page.keyboard.press("z");
    assert.equal(await page.$$eval(".bet-chip", nodes => nodes.length), 0);
    await page.keyboard.press("2");
    await page.keyboard.press("s");
    await page.keyboard.press("b");
    await page.keyboard.press("z");
    assert.deepEqual(await page.$$eval(".bet-chip", nodes => nodes.map(n => n.dataset.amount)), ["25"]);
    await page.keyboard.press("c");
    assert.equal(await page.$$eval(".bet-chip", nodes => nodes.length), 0);
    await page.keyboard.press("s");
    await bet(page, "double1");
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press(" ");
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false" &&
      localStorage.getItem("pit.sicbo.stats") !== null, { timeout: 20000 });
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 50 + 50 + 275);
    assert.deepEqual(await stored(page, "pit.sicbo.lastBets"), { small: 25, double1: 25 });
    await page.keyboard.press("r");
    assert.equal(await text(page, "#layoutTotal"), "50");
    assert.equal(await text(page, "#bankroll"), "10,225");
  });
});

test("Turkish names the bets, the odds and the roll", async () => {
  await scene({ rolls: [[3, 4, 6]], lang: "tr" }, async page => {
    assert.equal(await page.$eval("html", node => node.lang), "tr");
    assert.equal(await text(page, "#btnRoll"), "At");
    assert.equal(await text(page, '[data-bet="small"] .spot-name'), "Küçük");
    assert.equal(await text(page, '[data-bet="even"] .spot-name'), "Çift");
    assert.equal(await text(page, '[data-bet="total4"] .spot-pay'), "1'E 60");
    // The dice are drawn, so the printed odds lead and the name follows.
    assert.equal(await page.$eval('[data-bet="combo34"]', n => n.getAttribute("aria-label")), "1'E 5. 3 ve 4 kombinasyonu. Bahis: $0");
    await bet(page, "big");
    const lines = await watchBanner(page);
    await roll(page);
    assert.match(await lines(), /13, büyük/);
    assert.match(await lines(), /\$50 kazandınız/);
  });
});

test("the statistics chart the last rolls with their exact chances and the rolls since", async () => {
  const history = [[6, 6, 6], [1, 2, 4], [3, 3, 5], [1, 2, 4]];
  await scene({ seed: { "pit.sicbo.table": { history } } }, async page => {
    await page.keyboard.press("i");
    await page.waitForFunction(() => !document.getElementById("statsModal").hidden);
    assert.equal(await page.$eval("#statsLead", node => node.textContent), "The last 4 rolls, up to 500.");
    const row = (body, key) => page.$eval("#" + body + ' tr[data-key="' + key + '"]', tr => [...tr.children].map(cell => cell.textContent));
    assert.deepEqual(await row("tallyTotals", 7), ["7", "", "2 · 50.0%", "6.9%", "last roll"]);
    assert.deepEqual(await row("tallyTotals", 11), ["11", "", "1 · 25.0%", "12.5%", "1 ago"]);
    assert.deepEqual(await row("tallyTotals", 3), ["3", "", "0 · 0.0%", "0.5%", "not yet"]);
    assert.deepEqual(await row("tallyFaces", 6), ["Number 6", "", "1 · 25.0%", "42.1%", "3 ago"]);
    assert.deepEqual(await row("tallyGroups", "triple"), ["Any triple", "", "1 · 25.0%", "2.8%", "3 ago"]);
    assert.deepEqual(await row("tallyGroups", "small"), ["Small", "", "2 · 50.0%", "48.6%", "last roll"]);
    await page.keyboard.press("Escape");
    assert.equal(await page.$eval("#statsModal", node => node.hidden), true);
  });
});

test("a round left open at another table holds the roll back", async () => {
  await scene({ seed: { "pit.blackjack.round": { v: 1, resume: "player" } } }, async page => {
    await bet(page, "small");
    await page.click("#btnRoll");
    await page.waitForFunction(() => /Finish the round still open at Table 21 first/.test(document.getElementById("toast").textContent));
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 10000);
    assert.equal(await stored(page, "pit.sicbo.round"), null);
  });
});

test("an empty balance is topped up, and a chip the balance cannot cover is refused", async () => {
  await scene({ bankroll: 30 }, async page => {
    await bet(page, "small");
    await bet(page, "small");
    assert.match(await text(page, "#toast"), /Not enough balance/);
    assert.equal(await text(page, "#layoutTotal"), "25");
  });
  await scene({ bankroll: 2 }, async page => {
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("pit.bankroll")) === 10000);
  });
});

for (const size of [[320, 568], [360, 640], [390, 844], [768, 1024], [844, 390], [1280, 720], [1920, 1080]]) {
  test("the table fits " + size[0] + "×" + size[1] + " without scrolling the page", async () => {
    await scene({ width: size[0], height: size[1], rolls: [[2, 3, 3]] }, async page => {
      await bet(page, "small");
      await roll(page);
      await bet(page, "total8");
      const box = await page.evaluate(() => {
        const inside = sel => [...document.querySelectorAll(sel)].every(node => {
          const r = node.getBoundingClientRect();
          return r.width > 0 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
        });
        const layout = document.getElementById("layout");
        const spots = [...document.querySelectorAll(".spot")].map(n => n.getBoundingClientRect());
        // Spots in the same band never overlap.
        const overlaps = spots.some((a, i) => spots.some((b, j) => j > i &&
          a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
        return {
          scroll: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
          controls: inside("#btnRoll, .chips-tray .chip, #bankroll, .dice, #layout"),
          wide: layout.scrollWidth <= layout.clientWidth + 1,
          room: spots.every(b => b.width >= 18 && b.height >= 30),
          overlaps
        };
      });
      assert.ok(box.scroll, "no page scroll");
      assert.ok(box.controls, "the dice, the layout and every control are on screen");
      assert.ok(box.wide, "the layout never scrolls sideways");
      assert.ok(box.room, "every spot has room");
      assert.ok(!box.overlaps, "no spot overlaps another");
      await page.screenshot({ path: path.join(artifacts, "fit-" + size.join("x") + ".png") });
    });
  });
}

// Every control within reach at every size, in both languages: while the bets
// go down, with a full stack of chips and a large total, and after a roll.
for (const lang of ["en", "tr"]) {
  test(lang + ": every control is within reach at every size, betting and after a roll", async () => {
    await scene({ lang, rolls: [[4, 4, 2]] }, async page => {
      for (const value of [5, 25, 100, 500, 1000]) { await chip(page, value); await bet(page, "big"); }
      await chip(page, 500); await bet(page, "anyTriple");
      const problems = await sweepReach(page, "betting");
      await resizeTo(page, 1280, 800);
      await roll(page);
      problems.push(...await sweepReach(page, "after"));
      assert.deepEqual(problems, []);
    });
  });
}

test("installed, the table rolls offline", async () => {
  workerRevision++;
  await scene({ web: true, rolls: [[1, 2, 3], [1, 2, 3]] }, async page => {
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, { timeout: 15000 }).catch(async () => {
      await page.reload();
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 });
    });
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    await bet(page, "small");
    await roll(page);
    assert.equal(await stored(page, "pit.bankroll"), 10025);
    await page.setOfflineMode(false);
  });
});
