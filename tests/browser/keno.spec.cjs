/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// Real-browser suite for Keno 80. Puppeteer is a development dependency only;
// the machine never loads it.
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
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "thepit-keno-"));
let browser, server, workerRevision = 0;

test.before(async () => {
  server = await startServer(root, () => "pit-v" + (1400 + workerRevision));
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 20000, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  console.log("Browser: " + await browser.version());
  console.log("Screenshots: " + artifacts);
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

const fileURL = () => pathToFileURL(path.join(root, "games/keno/index.html")).href;

// Opens Keno 80 in a fresh profile. options: web, width, height, motion,
// bankroll, lang, settings (the ticket among them), draws (the balls of the
// games to come, twenty each) and seed.
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
      localStorage.setItem("pit.keno.settings", JSON.stringify(Object.assign({ animationSpeed: "fast", bet: 5, picks: [] }, config.settings)));
      localStorage.setItem("pit.keno.sound", "false");
      localStorage.setItem("spec.draws", JSON.stringify(config.draws || []));
      Object.keys(config.seed || {}).forEach(key => localStorage.setItem(key, JSON.stringify(config.seed[key])));
      localStorage.setItem("spec.seeded", "true");
    }
    Object.defineProperty(window, "KenoEngine", {
      configurable: true,
      set(api) {
        // The draws given come first, across reloads; then real ones.
        const draw = api.draw;
        api.draw = function () {
          const queue = JSON.parse(localStorage.getItem("spec.draws") || "[]");
          if (!queue.length) return draw.apply(api, arguments);
          const next = queue.shift();
          localStorage.setItem("spec.draws", JSON.stringify(queue));
          return next;
        };
        Object.defineProperty(window, "KenoEngine", { value: api, writable: true, configurable: true });
      }
    });
  }, options);
  try {
    await page.goto(options.web ? server.origin + "/games/keno/index.html" : fileURL(), { waitUntil: "load" });
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
async function mark(page, numbers) { for (const n of numbers) await page.click('.ball-cell[data-number="' + n + '"]'); }
async function play(page) {
  const before = await page.evaluate(() => (JSON.parse(localStorage.getItem("pit.keno.stats")) || { games: 0 }).games);
  await page.click("#btnPlay");
  await page.waitForFunction(games => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false" &&
    (JSON.parse(localStorage.getItem("pit.keno.stats")) || { games: 0 }).games === games + 1, { timeout: 20000 }, before);
}
const cells = (page, cls) => page.$$eval(".ball-cell." + cls, nodes => nodes.map(n => Number(n.dataset.number)));

// Twenty balls with known catches: 3, 17, 22, 41, 5 and 60 among them.
const BALLS = [3, 17, 22, 41, 5, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74];

test("a game plays straight from file:// and pays by the marks caught", async () => {
  await scene({ draws: [BALLS] }, async page => {
    assert.equal(await text(page, "#bannerText"), "Mark 1 to 10 numbers");
    assert.equal(await page.$eval("#btnPlay", node => node.disabled), true, "nothing to play without marks");
    await mark(page, [3, 17, 22, 41, 80]);
    assert.equal(await text(page, "#bannerText"), "5 marked: play for $5");
    assert.equal(await text(page, "#paytableTitle"), "Pays for 5 marks");
    assert.deepEqual(await page.$$eval("#payRows tr", rows => rows.map(r => r.dataset.hits)), ["5", "4", "3"]);
    assert.equal(await text(page, '#payRows tr[data-hits="4"] b'), "$60");
    assert.equal(await text(page, "#tableRtp"), "91.93%");
    await play(page);
    // Four of five marks caught pay 12 for 1.
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 5 + 60);
    assert.equal(await text(page, "#bannerText"), "Caught 4 of 5");
    assert.equal(await text(page, "#bannerSub"), "You win $60");
    assert.deepEqual(await cells(page, "caught"), [3, 17, 22, 41]);
    assert.deepEqual(await cells(page, "marked"), [3, 17, 22, 41, 80]);
    assert.equal((await cells(page, "drawn")).length, 16);
    assert.equal(await page.$eval("#payRows tr.won", row => row.dataset.hits), "4");
    assert.equal(await text(page, "#drawnCount"), "20");
    assert.equal(await text(page, "#caughtCount"), "4");
    assert.equal(await stored(page, "pit.keno.round"), null);
    const stats = await stored(page, "pit.keno.stats");
    assert.deepEqual([stats.games, stats.winningGames, stats.wagered, stats.returned, stats.biggestWin, stats.bestCatch], [1, 1, 5, 60, 55, 4]);
    assert.deepEqual((await stored(page, "pit.keno.settings")).picks, [3, 17, 22, 41, 80], "the ticket stays for the next game");
  });
});

test("one ticket plays five draws in a row, paid together", async () => {
  const OTHER = [80, 1, 2, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 23];
  await scene({ draws: [BALLS, OTHER, BALLS, OTHER, BALLS], settings: { picks: [3, 17, 80], bet: 10 } }, async page => {
    await page.click('#racesPicker [data-races="5"]');
    assert.equal(await text(page, "#betAmount"), "50");
    assert.equal(await text(page, "#racesLine"), "$10 × 5 draws");
    assert.equal(await text(page, "#bannerText"), "3 marked: play for $50");
    const before = 10000;
    await page.click("#btnPlay");
    await page.waitForFunction(() => document.body.dataset.phase !== "betting");
    assert.equal(await stored(page, "pit.bankroll"), before - 50, "every draw is paid for before the first ball");
    assert.equal((await stored(page, "pit.keno.round")).races.length, 5, "and all five are drawn and saved");
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false" &&
      localStorage.getItem("pit.keno.round") === null, { timeout: 30000 });
    // Two of three caught pay 2 for 1 on each BALLS draw; OTHER catches only 80.
    assert.equal(await stored(page, "pit.bankroll"), before - 50 + 3 * 20);
    assert.equal(await text(page, "#bannerText"), "5 draws played");
    assert.equal(await text(page, "#bannerSub"), "You win $60");
    const stats = await stored(page, "pit.keno.stats");
    assert.deepEqual([stats.games, stats.winningGames, stats.wagered, stats.returned], [5, 3, 50, 60]);
    assert.equal((await stored(page, "pit.keno.settings")).races, 5, "the count of draws stays for the next ticket");
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press("d");
    assert.equal(await text(page, "#betAmount"), "100", "D steps on to ten draws");
  });
});

test("a reload in the middle of five draws settles all of them", async () => {
  const OTHER = [80, 1, 2, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 23];
  await scene({ draws: [OTHER, OTHER, BALLS, OTHER, OTHER], motion: true, settings: { picks: [3, 17, 80], bet: 10, races: 5, animationSpeed: "cinematic" } }, async page => {
    await page.click("#btnPlay");
    await page.waitForFunction(() => /^Draw 2 of 5/.test(document.getElementById("bannerText").textContent), { timeout: 20000 });
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => localStorage.getItem("pit.keno.round") === null && document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 50 + 20);
    assert.match(await text(page, "#toast"), /5 draws played\. You win \$20/);
    assert.equal((await stored(page, "pit.keno.stats")).games, 5);
  });
});

test("the ticket holds ten marks, a new mark wipes the last draw, and quick pick and clear work from the keyboard", async () => {
  await scene({ draws: [BALLS] }, async page => {
    await mark(page, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    assert.match(await text(page, "#toast"), /up to 10 numbers/);
    assert.equal((await cells(page, "marked")).length, 10);
    await play(page);
    assert.ok((await cells(page, "drawn")).length > 0);
    await mark(page, [10]);
    assert.equal((await cells(page, "drawn")).length + (await cells(page, "caught")).length, 0, "the board is clean again");
    assert.equal((await cells(page, "marked")).length, 9);
    await page.keyboard.press("q");
    const quick = await cells(page, "marked");
    assert.equal(quick.length, 9, "quick pick marks as many as were marked");
    await page.keyboard.press("c");
    assert.equal((await cells(page, "marked")).length, 0);
    await page.keyboard.press("q");
    assert.equal((await cells(page, "marked")).length, 10, "an empty ticket gets ten");
    await page.keyboard.press("4");
    assert.equal(await text(page, "#betAmount"), "25");
    assert.equal((await stored(page, "pit.keno.settings")).bet, 25);
  });
});

test("a reload while the balls come out settles the same game", async () => {
  await scene({ draws: [BALLS], motion: true, settings: { animationSpeed: "cinematic", picks: [22, 60], bet: 10 } }, async page => {
    await page.click("#btnPlay");
    await page.waitForFunction(() => document.body.dataset.phase === "drawing");
    const round = await stored(page, "pit.keno.round");
    assert.deepEqual(round.races, [BALLS]);
    assert.deepEqual(round.picks, [22, 60]);
    assert.equal(await stored(page, "pit.bankroll"), 9990, "the bet left the balance before the first ball");
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.busy === "false" && localStorage.getItem("pit.keno.round") === null);
    assert.equal(await stored(page, "pit.bankroll"), 9990 + 150, "two of two pay 15 for 1");
    assert.match(await text(page, "#toast"), /Caught 2 of 2\. You win \$150/);
    assert.deepEqual(await cells(page, "caught"), [22, 60], "the board shows the game it settled");
  });
});

test("Turkish names the ticket, the pays and the catch", async () => {
  await scene({ draws: [BALLS], lang: "tr", settings: { picks: [3, 80] } }, async page => {
    assert.equal(await page.$eval("html", node => node.lang), "tr");
    assert.equal(await text(page, "#btnPlay"), "Oyna");
    assert.equal(await text(page, "#bannerText"), "2 işaretli: $5 ile oynayın");
    assert.equal(await text(page, "#paytableTitle"), "2 işaret için ödemeler");
    assert.equal(await text(page, '#payRows tr[data-hits="2"] small'), "1'e 15");
    assert.equal(await text(page, "#tableRtp"), "%90,19");
    await play(page);
    assert.equal(await text(page, "#bannerText"), "2 işaretten 1 tuttu");
    assert.equal(await text(page, "#bannerSub"), "Bu oyunda kazanç yok");
  });
});

test("a round left open at another table holds the game back", async () => {
  await scene({ settings: { picks: [5] }, seed: { "pit.blackjack.round": { v: 1, resume: "player" } } }, async page => {
    await page.click("#btnPlay");
    await page.waitForFunction(() => /Finish the round still open at Table 21 first/.test(document.getElementById("toast").textContent));
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 10000);
    assert.equal(await stored(page, "pit.keno.round"), null);
  });
});

test("a bet the balance cannot cover is refused, and an empty balance is topped up", async () => {
  await scene({ bankroll: 60, settings: { picks: [5], bet: 100 } }, async page => {
    await page.click("#btnPlay");
    await page.waitForFunction(() => /Not enough balance/.test(document.getElementById("toast").textContent));
    assert.equal(await stored(page, "pit.bankroll"), 60);
  });
  await scene({ bankroll: 0 }, async page => {
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("pit.bankroll")) === 10000);
  });
});

for (const size of [[320, 568], [360, 640], [390, 844], [768, 1024], [844, 390], [1280, 720], [1920, 1080]]) {
  test("the machine fits " + size[0] + "×" + size[1] + " without scrolling the page", async () => {
    await scene({ width: size[0], height: size[1], draws: [BALLS], settings: { picks: [3, 17, 22, 41, 5, 6, 7, 8, 9, 10] } }, async page => {
      await play(page);
      const box = await page.evaluate(() => {
        const inside = sel => [...document.querySelectorAll(sel)].every(node => {
          const r = node.getBoundingClientRect();
          return r.width > 0 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
        });
        const balls = [...document.querySelectorAll(".ball-cell")].map(n => n.getBoundingClientRect());
        const board = document.getElementById("board").getBoundingClientRect();
        const pays = document.querySelector(".paytable").getBoundingClientRect();
        return {
          scroll: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
          controls: inside("#btnPlay, #btnQuick, .chips-tray .chip, #bankroll, #banner"),
          board: balls.length === 80 && balls.every(b => b.width >= 22 && b.height >= 20),
          apart: board.bottom <= pays.top + 1 || board.right <= pays.left + 1
        };
      });
      assert.ok(box.scroll, "no page scroll");
      assert.ok(box.controls, "every control is on screen");
      assert.ok(box.board, "every number has room");
      assert.ok(box.apart, "the board and the pay table never overlap");
      await page.screenshot({ path: path.join(artifacts, "fit-" + size.join("x") + ".png") });
    });
  });
}

// Every control within reach at every size, in both languages: with ten
// numbers marked and the largest bet, and after a game.
for (const lang of ["en", "tr"]) {
  test(lang + ": every control is within reach at every size, marking and after a game", async () => {
    await scene({ lang, draws: [BALLS], settings: { picks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], bet: 100 } }, async page => {
      const problems = await sweepReach(page, "marking");
      await resizeTo(page, 1280, 800);
      await play(page);
      problems.push(...await sweepReach(page, "after"));
      assert.deepEqual(problems, []);
    });
  });
}

test("installed, the machine draws offline", async () => {
  workerRevision++;
  await scene({ web: true, draws: [BALLS, BALLS], settings: { picks: [3] } }, async page => {
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, { timeout: 15000 }).catch(async () => {
      await page.reload();
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 });
    });
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    await play(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 5 + 15);
    await page.setOfflineMode(false);
  });
});
