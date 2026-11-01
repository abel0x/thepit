/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// Real-browser suite for Poker 11. Puppeteer is a development dependency
// only; the machine never loads it.
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
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "thepit-videopoker-"));
let browser, server, workerRevision = 0;

test.before(async () => {
  server = await startServer(root, () => "pit-v" + (900 + workerRevision));
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 20000, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  console.log("Browser: " + await browser.version());
  console.log("Screenshots: " + artifacts);
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

const fileURL = () => pathToFileURL(path.join(root, "games/videopoker/index.html")).href;

// Opens Poker 11 in a fresh profile. options: web, width, height, motion,
// bankroll, lang, settings, deck (the ten cards every deal takes, the hand
// then its draw, e.g. "JS JD 3C 7S 9D JH 2C 4D 5H 6S") and seed (more saved
// values).
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
      localStorage.setItem("pit.videopoker.settings", JSON.stringify(Object.assign({ animationSpeed: "fast" }, config.settings)));
      localStorage.setItem("pit.videopoker.sound", "false");
      Object.keys(config.seed || {}).forEach(key => localStorage.setItem(key, JSON.stringify(config.seed[key])));
      localStorage.setItem("spec.seeded", "true");
    }
    Object.defineProperty(window, "VideoPokerEngine", {
      configurable: true,
      set(api) {
        if (config.deck) {
          const top = config.deck.split(" ").map(code => api.fromCode(code));
          const rest = api.buildDeck().filter(c => !top.some(t => t.id === c.id));
          api.newDeck = function () { return top.concat(rest); };
        }
        Object.defineProperty(window, "VideoPokerEngine", { value: api, writable: true, configurable: true });
      }
    });
  }, options);
  try {
    await page.goto(options.web ? server.origin + "/games/videopoker/index.html" : fileURL(), { waitUntil: "load" });
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
const text = (page, selector) => page.$eval(selector, node => node.textContent.trim());
const cardLabels = page => page.$$eval(".slot-card .card", nodes => nodes.map(n => n.getAttribute("aria-label")));
async function chip(page, value) { await page.click('.chip[data-value="' + value + '"]'); }
async function hold(page, positions) { for (const p of positions) await page.click('.hold-btn[data-hold="' + p + '"]'); }
async function dealToHold(page) {
  await page.click("#btnDeal");
  await page.waitForFunction(() => document.body.dataset.phase === "holding" && document.body.dataset.busy === "false", { timeout: 15000 });
}
async function settled(page) {
  await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false" &&
    localStorage.getItem("pit.videopoker.round") === null, { timeout: 20000 });
}

test("a hand plays straight from file://: hold a pair of Jacks and draw the third", async () => {
  await scene({ deck: "JS JD 3C 7S 9D JH 2C 4D 5H 6S" }, async page => {
    assert.equal(await text(page, "#totalBet"), "25", "five coins of $5 to start");
    assert.equal(await page.$eval('#payTable tr[data-category="royalFlush"] td.active', node => node.textContent), "4,000");
    await dealToHold(page);
    assert.equal(await stored(page, "pit.bankroll"), 9975, "the stake left the balance before the first card");
    const round = await stored(page, "pit.videopoker.round");
    assert.deepEqual(round.hand, ["JS", "JD", "3C", "7S", "9D"]);
    assert.deepEqual(round.draws, ["JH", "2C", "4D", "5H", "6S"], "the draw is chosen with the deal");
    assert.equal(round.held, null);
    assert.equal(await text(page, "#dealLabel"), "Draw");
    await hold(page, [0]);
    await page.click('.hand-slot[data-pos="1"] .slot-card');   // a tap on the card holds it too
    assert.deepEqual(await page.$$eval(".hold-btn", nodes => nodes.map(n => n.getAttribute("aria-pressed"))), ["true", "true", "false", "false", "false"]);
    assert.equal(await text(page, '.hold-btn[data-hold="0"]'), "Held");
    await page.click("#btnDeal");
    await settled(page);
    assert.deepEqual((await cardLabels(page)).slice(0, 3), ["Jack of spades", "Jack of diamonds", "Jack of hearts"]);
    assert.equal(await text(page, "#bannerText"), "Three of a kind: you win $75");
    assert.equal(await page.$eval('#payTable tr[data-category="trips"]', node => node.classList.contains("won")), true);
    assert.equal(await stored(page, "pit.bankroll"), 9975 + 75);
    assert.equal(await text(page, "#winMeter"), "75");
    const stats = await stored(page, "pit.videopoker.stats");
    assert.deepEqual([stats.hands, stats.winningHands, stats.bestHand], [1, 1, 3]);
  });
});

test("the strategy hint breaks a flush for four to a royal, and the royal flush pays 4,000 coins", async () => {
  await scene({ deck: "AS KS QS JS 9S 10S 2C 4D 5H 6S", settings: { coach: true, denomination: 1 } }, async page => {
    await dealToHold(page);
    await page.waitForFunction(() => document.querySelectorAll(".hand-slot.coach-pick").length > 0);
    assert.deepEqual(await page.$$eval(".hand-slot", nodes => nodes.map(n => n.classList.contains("coach-pick"))), [true, true, true, true, false]);
    assert.equal(await text(page, "#bannerSub"), "Strategy: hold the marked cards");
    await page.keyboard.press("1"); await page.keyboard.press("2"); await page.keyboard.press("3"); await page.keyboard.press("4");
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press("Enter");
    await settled(page);
    assert.equal(await text(page, "#bannerText"), "Royal flush: you win $4,000");
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 5 + 4000);
    assert.equal((await stored(page, "pit.videopoker.stats")).royalFlushes, 1);
  });
});

test("bet one counts the coins round, and bet max deals at once", async () => {
  await scene({ deck: "2C 4D 7H 9S 3H 5S 6D 8C 10H QS" }, async page => {
    await chip(page, 25);
    await page.keyboard.press("b");
    assert.equal(await text(page, "#coinsLine"), "1 × $25");
    await page.click("#btnBetOne");
    assert.equal(await text(page, "#totalBet"), "50");
    assert.equal(await page.$eval('#payTable thead [data-coins].active', node => node.textContent), "2");
    assert.equal(await page.$eval('#payTable tr[data-category="royalFlush"] td.active', node => node.textContent), "500");
    assert.deepEqual((await stored(page, "pit.videopoker.settings")).coins, 2, "the machine keeps its last bet");
    await page.click("#btnBetMax");
    await page.waitForFunction(() => document.body.dataset.phase === "holding" && document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 125);
    assert.equal(await page.$eval('.chip[data-value="100"]', node => node.disabled), true, "the bet is fixed while the hand is out");
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press(" ");                   // draw five new cards
    await settled(page);
    assert.equal(await text(page, "#bannerText"), "No paying hand", "five new cards that make nothing");
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 125);
  });
});

test("a reload while the hand waits brings back the same cards for the hold", async () => {
  await scene({ deck: "AS AD 7C 2H 9S AH 3D 4C 5C 6C" }, async page => {
    await dealToHold(page);
    await hold(page, [0]);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.phase === "holding" && document.body.dataset.busy === "false");
    assert.match(await text(page, "#toast"), /still on the machine/);
    assert.deepEqual((await cardLabels(page)).slice(0, 2), ["Ace of spades", "Ace of diamonds"]);
    assert.equal(await stored(page, "pit.bankroll"), 9975, "the reload refunds nothing");
    await page.keyboard.press("1");
    await page.keyboard.press("2");
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press("Enter");
    await settled(page);
    assert.equal(await stored(page, "pit.bankroll"), 9975 + 75, "the third ace waits in the draw");
  });
});

test("a reload after the draw settles the held hand with its very cards", async () => {
  await scene({ deck: "KS KD 7C 2H 9S KH 3D 4C 5C 6C", motion: true, settings: { animationSpeed: "cinematic" } }, async page => {
    await dealToHold(page);
    await hold(page, [0, 1]);
    await page.click("#btnDeal");
    await page.waitForFunction(() => document.body.dataset.phase === "drawing");
    const round = await stored(page, "pit.videopoker.round");
    assert.deepEqual(round.held, [true, true, false, false, false], "the hold is saved before the new cards are turned");
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => localStorage.getItem("pit.videopoker.round") === null && document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 9975 + 75);
    assert.match(await text(page, "#toast"), /Three of a kind: you win \$75/);
  });
});

test("the 8/5 pay table pays a full house 8 and only changes between hands", async () => {
  await scene({ deck: "7S 7D 7C 2H 2S 3D 4C 5C 6C 8C", settings: { denomination: 1 } }, async page => {
    await page.click("#settingsBtn");
    await page.click('.rule-profile[data-profile="eightFive"]');
    assert.match(await text(page, "#toast"), /8\/5 rules applied/);
    await page.keyboard.press("Escape");
    assert.equal(await text(page, "#tableRtp"), "97.30%");
    assert.equal(await page.$eval('#payTable tr[data-category="fullHouse"] td.active', node => node.textContent), "40");
    await dealToHold(page);
    assert.equal((await stored(page, "pit.videopoker.round")).payTable, "eightFive");
    assert.equal(await page.$eval('.rule-profile[data-profile="nineSix"]', node => node.disabled), true);
    await hold(page, [0, 1, 2, 3, 4]);
    await page.click("#btnDeal");
    await settled(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 5 + 40);
  });
});

test("a hand needs the balance for its bet", async () => {
  await scene({ bankroll: 20 }, async page => {
    assert.equal(await text(page, "#totalBet"), "25");
    await page.click("#btnDeal");
    await page.waitForFunction(() => /Not enough balance for this bet/.test(document.getElementById("toast").textContent));
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.videopoker.round"), null);
    await chip(page, 1);
    await dealToHold(page);
    assert.equal(await stored(page, "pit.bankroll"), 15);
  });
});

test("Turkish names the buttons, the pay table and the result", async () => {
  await scene({ deck: "QS QD 3C 7S 9D 2H 4C 5D 6H 8S", lang: "tr" }, async page => {
    assert.equal(await page.$eval("html", node => node.lang), "tr");
    assert.equal(await text(page, "#bannerText"), "Bir jeton değeri seçin ve dağıtın");
    assert.equal(await text(page, '#payTable tr[data-category="fullHouse"] th'), "Ful");
    await dealToHold(page);
    assert.equal(await text(page, "#dealLabel"), "Çek");
    await hold(page, [0, 1]);
    assert.equal(await text(page, '.hold-btn[data-hold="0"]'), "Tutuldu");
    await page.click("#btnDeal");
    await settled(page);
    assert.equal(await text(page, "#bannerText"), "Kız per: $25 kazandınız");
    assert.equal(await balance(page), "10.000", "Jacks or better gives the bet back");
  });
});

test("a round left open at another table holds the deal back", async () => {
  await scene({ seed: { "pit.blackjack.round": { v: 1, resume: "player" } } }, async page => {
    await page.click("#btnDeal");
    await page.waitForFunction(() => /Finish the round still open at Table 21 first/.test(document.getElementById("toast").textContent));
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 10000);
    assert.equal(await stored(page, "pit.videopoker.round"), null);
  });
});

for (const size of [[320, 568], [360, 640], [390, 844], [768, 1024], [844, 390], [1280, 720], [1920, 1080]]) {
  test("the machine fits " + size[0] + "×" + size[1] + " without scrolling", async () => {
    await scene({ width: size[0], height: size[1], deck: "QH KH AH 2S 5D 9C 3D 4C 5C 6C" }, async page => {
      await dealToHold(page);
      await hold(page, [0]);
      await new Promise(resolve => setTimeout(resolve, 300));
      const box = await page.evaluate(() => {
        const inside = sel => [...document.querySelectorAll(sel)].every(node => {
          const r = node.getBoundingClientRect();
          return r.width > 0 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
        });
        const overlaps = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
        const cards = [...document.querySelectorAll(".slot-card .card")].map(n => n.getBoundingClientRect());
        const table = document.querySelector("#payTable").getBoundingClientRect();
        return {
          scroll: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
          controls: inside(".hold-btn, #btnDeal, #btnBetOne, #btnBetMax, .chips-tray .chip, #bankroll, #payTable, #bannerText"),
          cards: cards.length === 5 && inside(".slot-card .card"),
          clear: cards.every(card => !overlaps(card, table))
        };
      });
      assert.ok(box.scroll, "no page scroll");
      assert.ok(box.controls, "every control is on screen");
      assert.ok(box.cards, "every card is on screen");
      assert.ok(box.clear, "the cards stay clear of the pay table");
      await page.screenshot({ path: path.join(artifacts, "fit-" + size.join("x") + ".png") });
    });
  });
}

test("installed, the machine deals offline", async () => {
  workerRevision++;
  await scene({ web: true, deck: "JS JD 3C 7S 9D JH 2C 4D 5H 6S" }, async page => {
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, { timeout: 15000 }).catch(async () => {
      await page.reload();
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 });
    });
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    await dealToHold(page);
    await hold(page, [0, 1]);
    await page.click("#btnDeal");
    await settled(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 25 + 75, "the third Jack comes with the draw");
    await page.setOfflineMode(false);
  });
});
