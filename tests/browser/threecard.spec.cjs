/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// Real-browser suite for Table 3. Puppeteer is a development dependency only;
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
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "thepit-threecard-"));
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

const fileURL = () => pathToFileURL(path.join(root, "games/threecard/index.html")).href;

// Opens Table 3 in a fresh profile. options: web, width, height, motion,
// bankroll, lang, settings, player and dealer (the hands the next deals give,
// e.g. "KS KD 4C") and seed (more saved values).
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
      localStorage.setItem("pit.threecard.settings", JSON.stringify(Object.assign({ animationSpeed: "fast" }, config.settings)));
      localStorage.setItem("pit.threecard.sound", "false");
      Object.keys(config.seed || {}).forEach(key => localStorage.setItem(key, JSON.stringify(config.seed[key])));
      localStorage.setItem("spec.seeded", "true");
    }
    Object.defineProperty(window, "ThreeCardEngine", {
      configurable: true,
      set(api) {
        if (config.player && config.dealer) {
          // The deal alternates: player, dealer, player, dealer, player, dealer.
          const player = config.player.split(" "), dealer = config.dealer.split(" ");
          const order = [0, 1, 2].flatMap(i => [player[i], dealer[i]]).map(code => api.fromCode(code));
          api.newDeck = function () { return order.slice(); };
        }
        Object.defineProperty(window, "ThreeCardEngine", { value: api, writable: true, configurable: true });
      }
    });
  }, options);
  try {
    await page.goto(options.web ? server.origin + "/games/threecard/index.html" : fileURL(), { waitUntil: "load" });
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
    localStorage.getItem("pit.threecard.round") === null, { timeout: 20000 });
}

test("a hand plays straight from file://: Ante, Play and Pair Plus win against a qualifying dealer", async () => {
  await scene({ player: "KS KD 4C", dealer: "QS 8D 3C" }, async page => {
    await chip(page, 25); await bet(page, "ante", 2);
    await chip(page, 10); await bet(page, "pairPlus");
    assert.equal(await balance(page), "9,940");
    await dealToDecision(page);
    assert.equal(await stored(page, "pit.bankroll"), 9940, "the stake left the balance before the first card");
    assert.equal(await text(page, "#playerHand"), "Pair of Kings");
    assert.equal(await text(page, "#dealerHand"), "", "the dealer's cards stay face down");
    assert.equal(await page.$$eval("#dealerCards .card-inner.facedown", nodes => nodes.length), 3);
    assert.match(await text(page, "#bannerText"), /Pair of Kings: play or fold\?/);
    await page.click("#btnPlay");
    await settled(page);
    // Stake 50 + 10 + Play 50; returned Ante 100, Play 100, Pair Plus 20.
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 110 + 220);
    const stats = await stored(page, "pit.threecard.stats");
    assert.equal(stats.hands, 1);
    assert.equal(stats.played, 1);
    assert.equal(stats.pairPlusWins, 1);
    assert.deepEqual(await stored(page, "pit.threecard.lastBets"), { pairPlus: 10, ante: 50 });
  });
});

test("the 6-Card Bonus pays four of a kind on a folded hand", async () => {
  await scene({ player: "7S 7D 2C", dealer: "7C 7H 9D" }, async page => {
    await chip(page, 10); await bet(page, "ante");
    await page.keyboard.press("b");
    assert.equal(await balance(page), "9,980");
    await dealToDecision(page);
    await page.click("#btnFold");
    await settled(page);
    // Stake 10 + 10; the Ante is given up, the 6-Card Bonus returns 10 × 101.
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 20 + 1010);
    assert.match(await text(page, "#toast"), /6-Card Bonus, Four of a kind: \$1,010/);
    assert.equal((await stored(page, "pit.threecard.stats")).sixCardWins, 1);
  });
});

test("the dealer without Queen high pays the Ante and returns the Play bet", async () => {
  await scene({ player: "KS 9D 4C", dealer: "JS 8D 3C" }, async page => {
    await chip(page, 100); await bet(page, "ante");
    await dealToDecision(page);
    const lines = await watchBanner(page);
    await page.click("#btnPlay");
    await settled(page);
    assert.match(await lines(), /Dealer does not qualify with Jack high/);
    assert.equal(await stored(page, "pit.bankroll"), 10000 + 100);
    assert.equal((await stored(page, "pit.threecard.stats")).noQualify, 1);
  });
});

test("a losing straight still collects the Ante Bonus and the Pair Plus", async () => {
  await scene({ player: "4S 5D 6C", dealer: "9S 10D JC" }, async page => {
    await chip(page, 100); await bet(page, "ante");
    await chip(page, 10); await bet(page, "pairPlus");
    await dealToDecision(page);
    await page.click("#btnPlay");
    await page.waitForFunction(() => /Ante Bonus: \$100/.test(document.getElementById("toast").textContent));
    await settled(page);
    // Stake 210; returned Pair Plus 70 and Ante Bonus 100.
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 210 + 170);
  });
});

test("the low-flush pay table pays a flush 3 to 1, and only changes between hands", async () => {
  await scene({ player: "2H 7H JH", dealer: "QS 8D 3C" }, async page => {
    assert.deepEqual(await page.$$eval("[data-pay-flush]", nodes => nodes.map(n => n.textContent)), ["4 TO 1", "4 TO 1"]);
    await page.click("#settingsBtn");
    await page.click('.rule-profile[data-profile="lowFlush"]');
    assert.match(await text(page, "#toast"), /Low flush rules applied/);
    assert.equal(await page.$eval('.rule-profile[data-profile="lowFlush"]', node => node.getAttribute("aria-checked")), "true");
    assert.match(await text(page, "#houseEdges"), /7\.28% on Pair Plus/);
    assert.equal((await stored(page, "pit.threecard.settings")).payTable, "lowFlush");
    await page.keyboard.press("Escape");
    assert.deepEqual(await page.$$eval("[data-pay-flush]", nodes => nodes.map(n => n.textContent)), ["3 TO 1", "3 TO 1"]);

    await chip(page, 100); await bet(page, "ante");
    await chip(page, 10); await bet(page, "pairPlus");
    await dealToDecision(page);
    assert.equal((await stored(page, "pit.threecard.round")).payTable, "lowFlush", "the hand keeps the table it was dealt under");
    assert.equal(await page.$eval('.rule-profile[data-profile="standard"]', node => node.disabled), true, "no change while a hand is out");
    await page.click("#btnPlay");
    await settled(page);
    // Stake 210; returned Ante 200, Play 200 and Pair Plus 10 + 30.
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 210 + 440);
    assert.equal(await page.$eval('.rule-profile[data-profile="standard"]', node => node.disabled), false);
  });
});

test("folding gives up the Ante and the Pair Plus, and the strategy hint says so first", async () => {
  await scene({ player: "2S 5D 9C", dealer: "QS 8D 3C", settings: { coach: true } }, async page => {
    await chip(page, 25); await bet(page, "ante");
    await chip(page, 10); await bet(page, "pairPlus");
    await dealToDecision(page);
    assert.match(await text(page, "#bannerSub"), /Strategy: fold/);
    assert.equal(await page.$eval("#btnFold", node => node.classList.contains("coach-pick")), true);
    assert.equal(await page.$eval("#btnPlay", node => node.classList.contains("coach-pick")), false);
    const lines = await watchBanner(page);
    await page.click("#btnFold");
    await settled(page);
    assert.match(await lines(), /You fold\. Dealer had Queen high/);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 35);
    const stats = await stored(page, "pit.threecard.stats");
    assert.deepEqual([stats.hands, stats.played, stats.folded], [1, 0, 1]);
  });
});

test("a reload while the hand waits brings back the same cards for the decision", async () => {
  await scene({ player: "AS AD 7C", dealer: "KS 8D 3C" }, async page => {
    await chip(page, 100); await bet(page, "ante");
    await dealToDecision(page);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.phase === "deciding" && document.body.dataset.busy === "false");
    assert.match(await text(page, "#toast"), /still on the table/);
    assert.equal(await text(page, "#playerHand"), "Pair of Aces");
    assert.deepEqual(await page.$$eval("#playerCards .card", nodes => nodes.map(n => n.getAttribute("aria-label"))).then(l => l.length), 3);
    assert.equal(await stored(page, "pit.bankroll"), 9900, "the reload refunds nothing");
    await page.keyboard.press("p");
    await settled(page);
    assert.equal(await stored(page, "pit.bankroll"), 9900 - 100 + 400);
  });
});

test("a reload after the Play bet settles the decided hand", async () => {
  await scene({ player: "QS 6D 4C", dealer: "KS KD 3C", motion: true, settings: { animationSpeed: "cinematic" } }, async page => {
    await chip(page, 500); await bet(page, "ante");
    await dealToDecision(page);
    await page.click("#btnPlay");
    await page.waitForFunction(() => document.body.dataset.phase === "revealing");
    const round = await stored(page, "pit.threecard.round");
    assert.equal(round.decision, "play");
    assert.equal(round.stake, 1000);
    assert.equal(await stored(page, "pit.bankroll"), 9000, "the Play bet left the balance before the dealer's cards");
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => localStorage.getItem("pit.threecard.round") === null && document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 9000, "the dealer's pair of Kings won");
    assert.match(await text(page, "#toast"), /Dealer wins: Pair of Kings beats Queen high/);
  });
});

test("a hand needs an Ante and room for the Play bet", async () => {
  await scene({ bankroll: 80 }, async page => {
    await chip(page, 10); await bet(page, "pairPlus");
    assert.equal(await page.$eval("#btnDeal", node => node.disabled), true, "no Ante, no deal");
    // Away from the controls Space deals, and without an Ante it says why not.
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press(" ");
    assert.match(await text(page, "#toast"), /Place an Ante/);
    await chip(page, 25); await bet(page, "ante", 2);
    await page.click("#btnDeal");
    await page.waitForFunction(() => /Keep \$50 for the Play bet/.test(document.getElementById("toast").textContent));
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.threecard.round"), null);
    assert.equal(await stored(page, "pit.bankroll"), 80);
  });
});

test("bets stop at each table maximum; undo, clear, double and rebet work from the keyboard", async () => {
  await scene({ player: "9S 9D 2C", dealer: "4S 8D 3C" }, async page => {
    await chip(page, 1000); await bet(page, "pairPlus");
    assert.equal(await page.$eval('.spot[data-bet="pairPlus"] .bet-chip', node => node.dataset.amount), "500");
    assert.match(await text(page, "#toast"), /\$500/);
    await page.keyboard.press("c");
    const amounts = () => page.$$eval(".spot-stack .bet-chip", nodes => nodes.map(n => n.dataset.amount));
    assert.deepEqual(await amounts(), []);
    await page.keyboard.press("2");                 // the $25 chip
    await page.keyboard.press("a");
    await page.keyboard.press("s");
    await page.keyboard.press("d");
    assert.deepEqual(await amounts(), ["50", "50"]);
    await page.keyboard.press("z");
    assert.deepEqual(await amounts(), ["25", "25"]);
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.body.dataset.phase === "deciding" && document.body.dataset.busy === "false", { timeout: 15000 });
    await page.keyboard.press("Enter");             // Enter plays the hand
    await settled(page);
    // The dealer's 8 high does not qualify: Ante 50, Play 25, Pair Plus 50.
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 75 + 125);
    await page.keyboard.press("r");
    assert.deepEqual(await amounts(), ["25", "25"]);
  });
});

test("Turkish names the bets, the hands and the result", async () => {
  await scene({ player: "KS KD 4C", dealer: "QS 8D 3C", lang: "tr" }, async page => {
    assert.equal(await page.$eval("html", node => node.lang), "tr");
    assert.equal(await text(page, "#bannerText"), "Bahislerinizi yapın");
    assert.equal(await text(page, '.spot[data-bet="pairPlus"] .spot-pay'), "1'E 40'A KADAR");
    await bet(page, "ante");
    await dealToDecision(page);
    assert.equal(await text(page, "#playerHand"), "Papaz per");
    assert.equal(await text(page, "#btnFold"), "Çekil");
    const lines = await watchBanner(page);
    await page.click("#btnPlay");
    await settled(page);
    assert.match(await lines(), /Kazandınız: Papaz per, Kız yüksek elini yener/);
    assert.equal(await balance(page), "10.050", "Ante and Play of $25 each win even money");
  });
});

test("a round left open at another table holds the deal back", async () => {
  await scene({ seed: { "pit.blackjack.round": { v: 1, resume: "player" } } }, async page => {
    await bet(page, "ante");
    await page.click("#btnDeal");
    await page.waitForFunction(() => /Finish the round still open at Table 21 first/.test(document.getElementById("toast").textContent));
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 10000);
    assert.equal(await stored(page, "pit.threecard.round"), null);
  });
});

for (const size of [[320, 568], [360, 640], [390, 844], [768, 1024], [844, 390], [1280, 720], [1920, 1080]]) {
  test("the table fits " + size[0] + "×" + size[1] + " without scrolling", async () => {
    await scene({ width: size[0], height: size[1], player: "QH KH AH", dealer: "2S 5D 9C" }, async page => {
      await chip(page, 100); await bet(page, "ante");
      await chip(page, 10); await bet(page, "pairPlus");
      await dealToDecision(page);
      await new Promise(resolve => setTimeout(resolve, 300));
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
          controls: inside(".spot, #btnPlay, #btnFold, .chips-tray .chip, #bankroll, .bay-head, #playerHand"),
          cards: cards.length === 6 && inside(".bay-cards .card"),
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
// Play or Fold, with a full stack of chips on the Ante and a large total.
for (const lang of ["en", "tr"]) {
  test(lang + ": every control is within reach at every size, betting and deciding", async () => {
    await scene({ lang, player: "QH KH AH", dealer: "2S 5D 9C" }, async page => {
      for (const value of [10, 25, 100, 500, 1000]) { await chip(page, value); await bet(page, "ante"); }
      await chip(page, 500); await bet(page, "pairPlus");
      await chip(page, 100); await bet(page, "sixCard");
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
  await scene({ web: true, player: "KS KD 4C", dealer: "QS 8D 3C" }, async page => {
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, { timeout: 15000 }).catch(async () => {
      await page.reload();
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 });
    });
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    await bet(page, "ante");
    await dealToDecision(page);
    await page.click("#btnPlay");
    await settled(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 + 50, "a pair of Kings beats Queen high: Ante and Play pay even money");
    await page.setOfflineMode(false);
  });
});
