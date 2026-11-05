/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// Real-browser suite for Table 2. Puppeteer is a development dependency only;
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
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "thepit-holdem-"));
let browser, server, workerRevision = 0;

test.before(async () => {
  server = await startServer(root, () => "pit-v" + (1200 + workerRevision));
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 20000, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  console.log("Browser: " + await browser.version());
  console.log("Screenshots: " + artifacts);
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

const fileURL = () => pathToFileURL(path.join(root, "games/holdem/index.html")).href;

// Opens Table 2 in a fresh profile. options: web, width, height, motion,
// bankroll, lang, settings, player, dealer and board (the cards the next deals
// give, e.g. "AS AD") and seed (more saved values).
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
      localStorage.setItem("pit.holdem.settings", JSON.stringify(Object.assign({ animationSpeed: "fast" }, config.settings)));
      localStorage.setItem("pit.holdem.sound", "false");
      Object.keys(config.seed || {}).forEach(key => localStorage.setItem(key, JSON.stringify(config.seed[key])));
      localStorage.setItem("spec.seeded", "true");
    }
    Object.defineProperty(window, "HoldemEngine", {
      configurable: true,
      set(api) {
        if (config.player && config.dealer && config.board) {
          // The deal: player, dealer, player, dealer, then the five of the board.
          const player = config.player.split(" "), dealer = config.dealer.split(" ");
          const order = [player[0], dealer[0], player[1], dealer[1]].concat(config.board.split(" ")).map(code => api.fromCode(code));
          api.newDeck = function () { return order.slice(); };
        }
        Object.defineProperty(window, "HoldemEngine", { value: api, writable: true, configurable: true });
      }
    });
  }, options);
  try {
    await page.goto(options.web ? server.origin + "/games/holdem/index.html" : fileURL(), { waitUntil: "load" });
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
// Every line the banner shows from now on. With reduced motion a result
// stays only a moment, so the tests read this record once the hand settles.
async function watchBanner(page) {
  await page.evaluate(() => {
    window.bannerLines = [];
    const node = document.getElementById("bannerText");
    new MutationObserver(() => window.bannerLines.push(node.textContent)).observe(node, { childList: true, characterData: true, subtree: true });
  });
  return () => page.evaluate(() => window.bannerLines.join("\n"));
}
async function chip(page, value) { await page.click('.chip[data-value="' + value + '"]'); }
async function bet(page, key, times) { for (let i = 0; i < (times || 1); i++) await page.click('.spot[data-bet="' + key + '"]'); }
async function dealToDecision(page) {
  await page.click("#btnDeal");
  await page.waitForFunction(() => document.body.dataset.phase === "deciding" && document.body.dataset.busy === "false", { timeout: 15000 });
}
async function settled(page) {
  await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false" &&
    localStorage.getItem("pit.holdem.round") === null, { timeout: 20000 });
}


test("a hand plays straight from file://: the Ante pays by the hand and the Call even money", async () => {
  await scene({ player: "AH KH", dealer: "4C 4D", board: "2H 7H 9H JS QC" }, async page => {
    await chip(page, 25); await bet(page, "ante");
    await chip(page, 5); await bet(page, "aaBonus");
    await dealToDecision(page);
    assert.equal(await stored(page, "pit.bankroll"), 9970, "the stake left the balance before the first card");
    assert.equal(await page.$$eval("#boardCards .card", nodes => nodes.length), 3, "the flop is turned");
    assert.equal(await text(page, "#playerHand"), "Flush, Ace high", "the flop already makes the flush");
    assert.equal(await page.$$eval("#dealerCards .card-inner.facedown", nodes => nodes.length), 2);
    assert.match(await text(page, "#bannerText"), /Flush, Ace high: call or fold\?/);
    const lines = await watchBanner(page);
    await page.click("#btnCall");
    await settled(page);
    assert.match(await lines(), /You win: Flush, Ace high beats Pair of Fours/);
    // Stake 25 + 5 + Call 50. The flush wins the Ante at 2 to 1 and the Call at
    // 1 to 1, and, made on the flop, the AA Bonus at 20 to 1.
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 80 + 75 + 100 + 105);
    assert.equal(await page.$$eval("#boardCards .card", nodes => nodes.length), 0, "the cards are collected");
    const stats = await stored(page, "pit.holdem.stats");
    assert.deepEqual([stats.hands, stats.called, stats.aaWins], [1, 1, 1]);
  });
});

test("folding gives up the Ante but the AA Bonus is paid on the flop", async () => {
  await scene({ player: "AS AD", dealer: "KC KH", board: "7S 2H 9C 4D 8H" }, async page => {
    await chip(page, 25); await bet(page, "ante");
    await chip(page, 5); await bet(page, "aaBonus");
    await dealToDecision(page);
    assert.equal(await text(page, "#playerHand"), "Pair of Aces");
    await page.click("#btnFold");
    await page.waitForFunction(() => /AA Bonus: \$40/.test(document.getElementById("toast").textContent));
    await settled(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 30 + 40);
    assert.equal((await stored(page, "pit.holdem.stats")).folded, 1);
  });
});

test("a reload while the hand waits brings back the same cards and the flop", async () => {
  await scene({ player: "QS QD", dealer: "3C 2H", board: "QC 7H 5S KD 9D" }, async page => {
    await chip(page, 100); await bet(page, "ante");
    await dealToDecision(page);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.phase === "deciding" && document.body.dataset.busy === "false");
    assert.match(await text(page, "#toast"), /still on the table/);
    assert.equal(await text(page, "#playerHand"), "Three Queens");
    assert.equal(await page.$$eval("#boardCards .card", nodes => nodes.length), 3);
    assert.equal(await stored(page, "pit.bankroll"), 9900);
    await page.keyboard.press("l");
    await settled(page);
    // The dealer's 3 high does not qualify: the Ante pays 1 to 1, the Call comes back.
    assert.equal(await stored(page, "pit.bankroll"), 9900 - 200 + 200 + 200);
  });
});

test("a reload after the Call settles the decided hand", async () => {
  await scene({ player: "2S 3D", dealer: "QC QD", board: "9S 5H 4C JD 8H", motion: true, settings: { animationSpeed: "cinematic" } }, async page => {
    await chip(page, 500); await bet(page, "ante");
    await dealToDecision(page);
    await page.click("#btnCall");
    await page.waitForFunction(() => document.body.dataset.phase === "revealing");
    const round = await stored(page, "pit.holdem.round");
    assert.equal(round.decision, "call");
    assert.equal(round.stake, 1500);
    assert.equal(await stored(page, "pit.bankroll"), 8500, "the Call left the balance before the turn");
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => localStorage.getItem("pit.holdem.round") === null && document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 8500);
    assert.match(await text(page, "#toast"), /Dealer wins: Pair of Queens beats Jack high/);
  });
});

test("a hand needs an Ante and room for a Call of twice the Ante", async () => {
  await scene({ bankroll: 60 }, async page => {
    await chip(page, 5); await bet(page, "aaBonus");
    assert.equal(await page.$eval("#btnDeal", node => node.disabled), true, "no Ante, no deal");
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press(" ");
    assert.match(await text(page, "#toast"), /Place an Ante/);
    await chip(page, 25); await bet(page, "ante");
    await page.click("#btnDeal");
    await page.waitForFunction(() => /Keep \$50 for the Call/.test(document.getElementById("toast").textContent));
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.holdem.round"), null);
    assert.equal(await stored(page, "pit.bankroll"), 60);
  });
});

test("Turkish names the bets, the hands and the result", async () => {
  await scene({ player: "KS KD", dealer: "QC 7D", board: "2S 9H 4C 8D 3H", lang: "tr" }, async page => {
    assert.equal(await page.$eval("html", node => node.lang), "tr");
    assert.equal(await text(page, '.spot[data-bet="ante"] .spot-pay'), "1'E 1 VE ÜSTÜ");
    await bet(page, "ante");
    await dealToDecision(page);
    assert.equal(await text(page, "#playerHand"), "Papaz per");
    assert.equal(await text(page, "#btnFold"), "Çekil");
    const lines = await watchBanner(page);
    await page.click("#btnCall");
    await settled(page);
    assert.match(await lines(), /Krupiye Kız yüksek ile oyuna giremedi/);
  });
});

test("a round left open at another table holds the deal back", async () => {
  await scene({ seed: { "pit.blackjack.round": { v: 1, resume: "player" } } }, async page => {
    await bet(page, "ante");
    await page.click("#btnDeal");
    await page.waitForFunction(() => /Finish the round still open at Table 21 first/.test(document.getElementById("toast").textContent));
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 10000);
    assert.equal(await stored(page, "pit.holdem.round"), null);
  });
});

for (const size of [[320, 568], [360, 640], [390, 844], [768, 1024], [844, 390], [1280, 720], [1920, 1080]]) {
  test("the table fits " + size[0] + "×" + size[1] + " without scrolling", async () => {
    await scene({ width: size[0], height: size[1], player: "AS AD", dealer: "KC KH", board: "7S 2H 9C 4D 8H" }, async page => {
      await chip(page, 100); await bet(page, "ante");
      await chip(page, 5); await bet(page, "aaBonus");
      await dealToDecision(page);
      await new Promise(resolve => setTimeout(resolve, 300));
      const box = await page.evaluate(() => {
        const inside = sel => [...document.querySelectorAll(sel)].every(node => {
          const r = node.getBoundingClientRect();
          return r.width > 0 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
        });
        const overlaps = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
        const cards = [...document.querySelectorAll(".bay-cards .card, #boardCards .card")].map(n => n.getBoundingClientRect());
        const spots = document.querySelector("#spots").getBoundingClientRect();
        return {
          scroll: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
          controls: inside(".spot, #btnCall, #btnFold, .chips-tray .chip, #bankroll, .bay-head, #playerHand"),
          cards: cards.length === 7 && inside(".bay-cards .card, #boardCards .card"),
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

// Every control within reach at every size, in both languages: while the bets
// go down, when Deal is the button that matters, and while the hand waits for
// Call or Fold, with a full stack of chips on the Ante and a large total.
for (const lang of ["en", "tr"]) {
  test(lang + ": every control is within reach at every size, betting and deciding", async () => {
    await scene({ lang, player: "AS AD", dealer: "KC KH", board: "7S 2H 9C 4D 8H" }, async page => {
      for (const value of [5, 25, 100, 500]) { await chip(page, value); await bet(page, "ante"); }
      await chip(page, 500); await bet(page, "aaBonus");
      const problems = await sweepReach(page, "betting");
      await resizeTo(page, 1280, 800);
      await dealToDecision(page);
      problems.push(...await sweepReach(page, "deciding"));
      assert.deepEqual(problems, []);
    });
  });
}

test("installed, the table deals offline", async () => {
  workerRevision++;
  await scene({ web: true, player: "AH KH", dealer: "4C 4D", board: "2H 7H 9H JS QC" }, async page => {
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, { timeout: 15000 }).catch(async () => {
      await page.reload();
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 });
    });
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    await bet(page, "ante");
    await dealToDecision(page);
    await page.click("#btnCall");
    await settled(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 + 50 + 50, "the flush pays 2 to 1 on the Ante and the Call even money");
    await page.setOfflineMode(false);
  });
});
