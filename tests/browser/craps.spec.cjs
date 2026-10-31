/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// Real-browser suite for Table 7. Puppeteer is a development dependency only;
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
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "thepit-craps-"));
let browser, server, workerRevision = 0;

test.before(async () => {
  server = await startServer(root, () => "pit-v" + (1100 + workerRevision));
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 20000, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  console.log("Browser: " + await browser.version());
  console.log("Screenshots: " + artifacts);
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

const fileURL = () => pathToFileURL(path.join(root, "games/craps/index.html")).href;

// Opens Table 7 in a fresh profile. options: web, width, height, motion,
// bankroll, lang, settings, rolls (the dice to come, e.g. [[3, 4]]) and seed.
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
      localStorage.setItem("pit.craps.settings", JSON.stringify(Object.assign({ animationSpeed: "fast" }, config.settings)));
      localStorage.setItem("pit.craps.sound", "false");
      localStorage.setItem("spec.rolls", JSON.stringify(config.rolls || []));
      Object.keys(config.seed || {}).forEach(key => localStorage.setItem(key, JSON.stringify(config.seed[key])));
      localStorage.setItem("spec.seeded", "true");
    }
    Object.defineProperty(window, "CrapsEngine", {
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
        Object.defineProperty(window, "CrapsEngine", { value: api, writable: true, configurable: true });
      }
    });
  }, options);
  try {
    await page.goto(options.web ? server.origin + "/games/craps/index.html" : fileURL(), { waitUntil: "load" });
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
  const before = await page.evaluate(() => (JSON.parse(localStorage.getItem("pit.craps.stats")) || { rolls: 0 }).rolls);
  await page.click("#btnRoll");
  await page.waitForFunction(rolls => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false" &&
    (JSON.parse(localStorage.getItem("pit.craps.stats")) || { rolls: 0 }).rolls === rolls + 1, { timeout: 20000 }, before);
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

test("a come-out seven wins the pass line from file://, and the bet stays up", async () => {
  await scene({ rolls: [[3, 4]] }, async page => {
    await bet(page, "pass");
    assert.equal(await text(page, "#bankroll"), "9,975");
    const lines = await watchBanner(page);
    await roll(page);
    assert.match(await lines(), /7, a winner on the pass line/);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 25 + 25);
    assert.deepEqual((await stored(page, "pit.craps.round")).bets, { pass: 25 }, "the pass bet stays on the layout");
    assert.equal(await page.$eval('[data-stack="pass"] .bet-chip', node => node.dataset.amount), "25");
  });
});

test("a point, the odds behind it and the point made", async () => {
  await scene({ rolls: [[3, 3], [4, 2]] }, async page => {
    await bet(page, "pass");
    await roll(page);
    assert.equal(await page.$eval("body", node => node.dataset.point), "6");
    assert.equal(await page.$eval('.number-box[data-number="6"]', node => node.classList.contains("is-point")), true);
    assert.equal(await text(page, "#tablePoint"), "6");
    await bet(page, "passOdds", 2);
    assert.equal(await page.$eval('[data-stack="passOdds"] .bet-chip', node => node.dataset.amount), "50");
    await roll(page);
    // The pass line pays 25 and stays; the odds pay 6 to 5 on 50 and come down.
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 25 - 50 + 25 + 50 + 60);
    assert.equal(await page.$eval("body", node => node.dataset.point), "off");
    assert.equal((await stored(page, "pit.craps.stats")).pointsMade, 1);
  });
});

test("a come bet travels to its number, takes odds and wins there", async () => {
  await scene({ rolls: [[2, 2], [5, 4], [6, 3]] }, async page => {
    await bet(page, "pass");
    await roll(page);                                // point 4
    await bet(page, "come");
    await roll(page);                                // 9: the come bet goes to the 9
    assert.deepEqual((await stored(page, "pit.craps.round")).bets, { pass: 25, come9: 25 });
    assert.equal(await page.$eval('[data-bet="comeOdds9"]', node => node.hidden), false, "the odds open behind it");
    await bet(page, "comeOdds9", 2);
    await roll(page);                                // 9 again: 25 even money and 50 at 3 to 2
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 25 - 25 - 50 + 50 + 50 + 75);
    assert.deepEqual((await stored(page, "pit.craps.round")).bets, { pass: 25 });
  });
});

test("a seven out clears the layout and closes the round", async () => {
  await scene({ rolls: [[2, 2], [3, 4]] }, async page => {
    await bet(page, "pass");
    await chip(page, 5); await bet(page, "place8", 6);
    await roll(page);                                // point 4; the place bet is off
    assert.deepEqual((await stored(page, "pit.craps.round")).bets, { pass: 25, place8: 30 });
    const lines = await watchBanner(page);
    await roll(page);
    assert.match(await lines(), /Seven out/);
    assert.equal(await stored(page, "pit.craps.round"), null, "nothing stands, so the round is over");
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 55);
    assert.equal((await stored(page, "pit.craps.stats")).sevenOuts, 1);
  });
});

test("the layout refuses bets out of turn and takes down what may come down", async () => {
  await scene({ rolls: [[5, 5]] }, async page => {
    await bet(page, "passOdds");
    assert.match(await text(page, "#toast"), /Odds go behind/);
    await bet(page, "come");
    assert.match(await text(page, "#toast"), /once a point is set/);
    await bet(page, "pass");
    await bet(page, "place6");
    await roll(page);                                // point 10
    await bet(page, "pass");
    assert.match(await text(page, "#toast"), /before a point is set/);
    await page.click('[data-bet="pass"]', { button: "right" });
    assert.match(await text(page, "#toast"), /plays until it is decided/);
    await page.click('[data-bet="place6"]', { button: "right" });
    await page.waitForFunction(() => /Place 6 taken down: \$25 back/.test(document.getElementById("toast").textContent));
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 25);
    assert.deepEqual((await stored(page, "pit.craps.round")).bets, { pass: 25 });
  });
});

test("a reload while the dice roll settles the same roll", async () => {
  await scene({ rolls: [[6, 5]], motion: true, settings: { animationSpeed: "cinematic" } }, async page => {
    await chip(page, 100); await bet(page, "pass"); await bet(page, "field");
    await page.click("#btnRoll");
    await page.waitForFunction(() => document.body.dataset.phase === "rolling");
    const round = await stored(page, "pit.craps.round");
    assert.deepEqual(round.roll, { dice: [6, 5] });
    assert.equal(await stored(page, "pit.bankroll"), 9800, "the bets left the balance before the dice showed");
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.busy === "false" && JSON.parse(localStorage.getItem("pit.craps.round") || "{}").roll === null);
    assert.equal(await stored(page, "pit.bankroll"), 9800 + 100 + 100, "eleven wins the pass line and the field");
    assert.match(await text(page, "#toast"), /11, a winner on the pass line/);
    assert.deepEqual((await stored(page, "pit.craps.round")).bets, { pass: 100, field: 100 });
  });
});

test("undo, clear and rebet work on new chips, from the keyboard too", async () => {
  await scene({ rolls: [[1, 1]] }, async page => {
    await page.keyboard.press("2");
    await page.keyboard.press("p");
    await page.keyboard.press("f");
    await page.keyboard.press("z");
    assert.deepEqual(await page.$$eval(".bet-chip", nodes => nodes.map(n => n.dataset.amount)), ["25"]);
    await page.keyboard.press("c");
    assert.equal(await page.$$eval(".bet-chip", nodes => nodes.length), 0);
    await page.keyboard.press("p");
    await page.keyboard.press("f");
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press(" ");
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false" &&
      localStorage.getItem("pit.craps.stats") !== null, { timeout: 20000 });
    // Two is craps on the pass line and pays double in the field, which stays up.
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 50 + 50);
    assert.deepEqual((await stored(page, "pit.craps.round")).bets, { field: 25 });
    await page.keyboard.press("r");
    assert.match(await text(page, "#pendingTotal"), /^50$/);
  });
});

test("Turkish calls the roll and names the bets", async () => {
  await scene({ rolls: [[4, 4]], lang: "tr" }, async page => {
    assert.equal(await page.$eval("html", node => node.lang), "tr");
    assert.equal(await text(page, "#btnRoll"), "At");
    assert.equal(await text(page, '[data-bet="pass"] .spot-name'), "Pass çizgisi");
    assert.equal(await text(page, '[data-bet="hard8"] .spot-name'), "Zor 8");
    await bet(page, "pass");
    const lines = await watchBanner(page);
    await roll(page);
    assert.match(await lines(), /8: puan 8/);
    assert.equal(await text(page, "#tablePoint"), "8");
  });
});

test("a round left open at another table holds the roll back", async () => {
  await scene({ seed: { "pit.blackjack.round": { v: 1, resume: "player" } } }, async page => {
    await bet(page, "pass");
    await page.click("#btnRoll");
    await page.waitForFunction(() => /Finish the round still open at Table 21 first/.test(document.getElementById("toast").textContent));
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 10000);
    assert.equal(await stored(page, "pit.craps.round"), null);
  });
});

for (const size of [[320, 568], [360, 640], [390, 844], [768, 1024], [844, 390], [1280, 720], [1920, 1080]]) {
  test("the table fits " + size[0] + "×" + size[1] + " without scrolling the page", async () => {
    await scene({ width: size[0], height: size[1], rolls: [[3, 3]] }, async page => {
      await bet(page, "pass");
      await roll(page);
      const box = await page.evaluate(() => {
        const inside = sel => [...document.querySelectorAll(sel)].every(node => {
          const r = node.getBoundingClientRect();
          return r.width > 0 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
        });
        const layout = document.getElementById("layout");
        const boxes = [...document.querySelectorAll(".number-box")].map(n => n.getBoundingClientRect());
        return {
          scroll: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
          controls: inside("#btnRoll, .chips-tray .chip, #bankroll, .dice, #layout"),
          wide: layout.scrollWidth <= layout.clientWidth + 1,
          boxes: boxes.every(b => b.width >= 40 && b.height >= 56)
        };
      });
      assert.ok(box.scroll, "no page scroll");
      assert.ok(box.controls, "the dice, the layout and every control are on screen");
      assert.ok(box.wide, "the layout never scrolls sideways");
      assert.ok(box.boxes, "every number box has room");
      await page.screenshot({ path: path.join(artifacts, "fit-" + size.join("x") + ".png") });
    });
  });
}

test("installed, the table rolls offline", async () => {
  workerRevision++;
  await scene({ web: true, rolls: [[3, 4], [3, 4]] }, async page => {
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, { timeout: 15000 }).catch(async () => {
      await page.reload();
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 });
    });
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    await bet(page, "pass");
    await roll(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000);
    await page.setOfflineMode(false);
  });
});
