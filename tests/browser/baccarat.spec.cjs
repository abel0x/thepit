/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// Real-browser suite for Table 9. Puppeteer is a development dependency only;
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
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "thepit-baccarat-"));
let browser, server, workerRevision = 0;

test.before(async () => {
  server = await startServer(root, () => "pit-v" + (800 + workerRevision));
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 20000, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  console.log("Browser: " + await browser.version());
  console.log("Screenshots: " + artifacts);
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

const fileURL = () => pathToFileURL(path.join(root, "games/baccarat/index.html")).href;

// Opens Table 9 in a fresh profile. options: web, width, height, motion,
// bankroll, lang, settings, cards (the coup's cards, dealt in order from a
// fresh shoe: Player, Banker, Player, Banker, then any third cards) and seed
// (more saved values).
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
      localStorage.setItem("pit.baccarat.settings", JSON.stringify(Object.assign({ animationSpeed: "fast" }, config.settings)));
      localStorage.setItem("pit.baccarat.sound", "false");
      Object.keys(config.seed || {}).forEach(key => localStorage.setItem(key, JSON.stringify(config.seed[key])));
      localStorage.setItem("spec.seeded", "true");
    }
    Object.defineProperty(window, "BaccaratEngine", {
      configurable: true,
      set(api) {
        if (config.cards) {
          const newShoe = api.newShoe;
          api.newShoe = function () {
            const shoe = newShoe.apply(api, arguments);
            return { cards: config.cards.map(code => api.fromCode(code)).concat(shoe.cards), burned: shoe.burned };
          };
        }
        Object.defineProperty(window, "BaccaratEngine", { value: api, writable: true, configurable: true });
      }
    });
  }, options);
  try {
    await page.goto(options.web ? server.origin + "/games/baccarat/index.html" : fileURL(), { waitUntil: "load" });
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
const balance = page => page.$eval("#bankroll", node => node.textContent);
async function chip(page, value) { await page.click('.chip[data-value="' + value + '"]'); }
async function bet(page, key, times) { for (let i = 0; i < (times || 1); i++) await page.click('.spot[data-bet="' + key + '"]'); }
async function dealAndSettle(page) {
  await page.click("#btnDeal");
  await page.waitForFunction(() => document.body.dataset.phase !== "betting");
  await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false", { timeout: 20000 });
}

test("a coup plays straight from file:// and the Banker pays 19 to 20", async () => {
  // Player 2 and 3 make 5; the Banker's 8 and K are a natural 8.
  await scene({ cards: ["2S", "8H", "3C", "KD"] }, async page => {
    await chip(page, 100);
    await bet(page, "banker");
    assert.equal(await balance(page), "9,900");
    await dealAndSettle(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 + 95);
    assert.equal(await stored(page, "pit.baccarat.round"), null);
    const roads = await stored(page, "pit.baccarat.roads");
    assert.deepEqual(roads.map(r => [r.winner, r.player, r.banker, r.natural]), [["banker", 5, 8, true]]);
    assert.equal(await page.$$eval("#beadPlate .bead", nodes => nodes.length), 1);
    assert.equal(await page.$$eval("#bigRoad .ring.banker", nodes => nodes.length), 1);
    assert.equal(await balance(page), "10,095");
    const shoe = await stored(page, "pit.baccarat.shoe");
    assert.ok(shoe.length > 300 && shoe.length < 416 - 4, "the shoe keeps its remaining cards");
  });
});

test("a tie pays 8 to 1, returns Player and Banker bets and pays both pairs", async () => {
  await scene({ cards: ["4S", "4H", "4D", "4C"] }, async page => {
    await chip(page, 100); await bet(page, "player");
    await chip(page, 25); await bet(page, "tie");
    await chip(page, 5); await bet(page, "bankerPair");
    await dealAndSettle(page);
    // Stake 130; returned 100 + 225 + 60.
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 130 + 385);
    const stats = await stored(page, "pit.baccarat.stats");
    assert.equal(stats.ties, 1);
    assert.equal(stats.naturals, 1);
    assert.deepEqual((await stored(page, "pit.baccarat.roads"))[0], { winner: "tie", player: 8, banker: 8, natural: true, playerPair: true, bankerPair: true });
    assert.equal(await page.$$eval("#beadPlate .bead.tie.pair-player.pair-banker", nodes => nodes.length), 1);
  });
});

test("third cards follow the tableau and lie sideways on the felt", async () => {
  // Player 2+K = 2 draws a 5; Banker 4+3 = 7 stands: Player 7, Banker 7.
  await scene({ cards: ["2S", "4H", "KC", "3D", "5S"], motion: true, settings: { animationSpeed: "fast" } }, async page => {
    await bet(page, "player");
    await page.click("#btnDeal");
    await page.waitForFunction(() => document.querySelectorAll("#playerCards .card").length === 3, { timeout: 15000 });
    assert.equal(await page.$eval("#playerCards .card:last-child", node => node.classList.contains("third")), true);
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false", { timeout: 20000 });
    assert.deepEqual((await stored(page, "pit.baccarat.roads"))[0], { winner: "tie", player: 7, banker: 7, natural: false, playerPair: false, bankerPair: false });
    assert.equal(await stored(page, "pit.bankroll"), 10000, "a tie returns the Player bet");
  });
});

test("without commission a Banker six pays one to two", async () => {
  // Player 2+3 = 5 draws a K; Banker 3+3 = 6 stands on it and wins with six.
  await scene({ cards: ["2S", "3H", "3C", "3D", "KS"], settings: { rules: "noCommission" } }, async page => {
    assert.equal(await page.$eval("#tableProfile", node => node.textContent), "NO COMMISSION");
    assert.match(await page.$eval("#bankerPay", node => node.textContent), /SIX 1 TO 2/);
    await chip(page, 100); await bet(page, "banker");
    await dealAndSettle(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 + 50);
  });
});

test("a reload during the deal settles the same coup with the same stake", async () => {
  await scene({ cards: ["2S", "8H", "3C", "KD"], motion: true, settings: { animationSpeed: "cinematic" } }, async page => {
    await chip(page, 500); await bet(page, "player");
    await page.click("#btnDeal");
    await page.waitForFunction(() => document.body.dataset.phase === "dealing");
    const round = await stored(page, "pit.baccarat.round");
    assert.deepEqual([round.player, round.banker], [["2S", "3C"], ["8H", "KD"]]);
    assert.equal(await stored(page, "pit.bankroll"), 9500, "the stake left the balance before the first card");
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => localStorage.getItem("pit.baccarat.round") === null && document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 9500, "the Player lost: the reload refunds nothing");
    assert.match(await page.$eval("#toast", node => node.textContent), /Banker wins, 8 to 5/);
    assert.deepEqual(await stored(page, "pit.baccarat.lastBets"), { player: 500 });
    assert.equal((await stored(page, "pit.baccarat.roads")).length, 1);
  });
});

test("bets stop at each table maximum and at the balance", async () => {
  await scene({ bankroll: 1200 }, async page => {
    await chip(page, 5000);
    await bet(page, "tie");
    assert.equal(await page.$eval('.spot[data-bet="tie"] .bet-chip', node => node.dataset.amount), "1000");
    assert.match(await page.$eval("#toast", node => node.textContent), /\$1,000/);
    await chip(page, 500);
    await bet(page, "banker");
    assert.match(await page.$eval("#toast", node => node.textContent), /balance/i);
    assert.equal(await page.$$eval('.spot[data-bet="banker"] .bet-chip', nodes => nodes.length), 0);
    assert.equal(await balance(page), "200");
  });
});

test("undo, clear, double and rebet are one action each, with the keyboard too", async () => {
  await scene({ cards: ["9S", "KH", "QC", "5D"] }, async page => {
    await page.keyboard.press("2");                 // the $25 chip
    await page.keyboard.press("p");
    await page.keyboard.press("t");
    await page.keyboard.press("d");                 // double both
    const amounts = () => page.$$eval(".spot-stack .bet-chip", nodes => nodes.map(n => n.dataset.amount));
    assert.deepEqual(await amounts(), ["50", "50"]);
    await page.keyboard.press("z");
    assert.deepEqual(await amounts(), ["25", "25"]);
    await page.keyboard.press("c");
    assert.deepEqual(await amounts(), []);
    await page.keyboard.press("z");
    assert.deepEqual(await amounts(), ["25", "25"]);
    await page.click('.spot[data-bet="tie"]', { button: "right" });
    assert.deepEqual(await amounts(), ["25"], "right-click takes a chip back");
    // Enter on a focused spot places a chip there; away from the controls it deals.
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && localStorage.getItem("pit.baccarat.round") === null && document.body.dataset.busy === "false", { timeout: 20000 });
    assert.equal(await stored(page, "pit.bankroll"), 10025, "Player natural 9 pays even money");
    await page.keyboard.press("r");
    assert.deepEqual(await amounts(), ["25"]);
  });
});

test("Turkish names the sides, the payouts and the result", async () => {
  await scene({ cards: ["2S", "8H", "3C", "KD"], lang: "tr" }, async page => {
    assert.equal(await page.$eval("html", node => node.lang), "tr");
    assert.equal(await page.$eval('.spot[data-bet="banker"] .spot-name', node => node.textContent), "Banko");
    assert.equal(await page.$eval('.spot[data-bet="tie"] .spot-pay', node => node.textContent), "1'E 8");
    assert.equal(await page.$eval("#bannerText", node => node.textContent), "Bahislerinizi yapın");
    await bet(page, "banker");
    await dealAndSettle(page);
    assert.equal(await balance(page), "10.023");
    assert.match(await page.$eval("#roadCounts", node => node.textContent), /Banko 1/);
  });
});

test("a round left open at another table holds the deal back", async () => {
  await scene({ seed: { "pit.blackjack.round": { v: 1, resume: "player" } } }, async page => {
    await bet(page, "player");
    await page.click("#btnDeal");
    await page.waitForFunction(() => /Finish the round still open at Table 21 first/.test(document.getElementById("toast").textContent));
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 10000);
    assert.equal(await stored(page, "pit.baccarat.round"), null);
  });
});

for (const size of [[320, 568], [360, 640], [390, 844], [768, 1024], [844, 390], [1280, 720], [1920, 1080]]) {
  test("the table fits " + size[0] + "×" + size[1] + " without scrolling", async () => {
    // Player 2+3 draws a 4; Banker 3+K draws a 5: six cards, both third cards sideways.
    const cards = ["2S", "3H", "3C", "KD", "4S", "5C"];
    await scene({ width: size[0], height: size[1], cards, motion: true, settings: { animationSpeed: "cinematic" } }, async page => {
      await bet(page, "player");
      await page.click("#btnDeal");
      await page.waitForFunction(() => document.querySelectorAll(".bay-cards .card").length === 6, { timeout: 15000 });
      await new Promise(resolve => setTimeout(resolve, 450));
      const box = await page.evaluate(() => {
        const inside = sel => [...document.querySelectorAll(sel)].every(node => {
          const r = node.getBoundingClientRect();
          return r.width > 0 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
        });
        const overlaps = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
        const cards = [...document.querySelectorAll(".bay-cards .card")].map(n => n.getBoundingClientRect());
        const spots = document.querySelector("#spots").getBoundingClientRect();
        return {
          scroll: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
          controls: inside(".spot, #btnDeal, .chips-tray .chip, #bankroll, .bay-head"),
          cards: inside(".bay-cards .card"),
          clear: cards.every(card => !overlaps(card, spots))
        };
      });
      assert.ok(box.scroll, "no page scroll");
      assert.ok(box.controls, "every control is on screen");
      assert.ok(box.cards, "every card is on screen");
      assert.ok(box.clear, "the cards stay clear of the betting spots");
      await page.screenshot({ path: path.join(artifacts, "fit-" + size.join("x") + ".png") });
    });
  });
}

test("installed, the table deals offline", async () => {
  workerRevision++;
  await scene({ web: true, cards: ["2S", "8H", "3C", "KD"] }, async page => {
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, { timeout: 15000 }).catch(async () => {
      await page.reload();
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 });
    });
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    await bet(page, "banker");
    await dealAndSettle(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 + 23, "$25 on the Banker wins $23 after commission");
    await page.setOfflineMode(false);
  });
});
