/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// Real-browser suite for Table 13. Puppeteer is a development dependency only;
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
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "thepit-reddog-"));
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

const fileURL = () => pathToFileURL(path.join(root, "games/reddog/index.html")).href;

// Opens Table 13 in a fresh profile. options: web, width, height, motion,
// bankroll, lang, settings, hands (the three cards each new shoe deals,
// e.g. ["4S 9D 7C"], in turn) and seed (more saved values).
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
      localStorage.setItem("pit.reddog.settings", JSON.stringify(Object.assign({ animationSpeed: "fast" }, config.settings)));
      localStorage.setItem("pit.reddog.sound", "false");
      Object.keys(config.seed || {}).forEach(key => localStorage.setItem(key, JSON.stringify(config.seed[key])));
      localStorage.setItem("spec.seeded", "true");
    }
    Object.defineProperty(window, "RedDogEngine", {
      configurable: true,
      set(api) {
        if (config.hands) {
          let next = 0;
          const shuffle = api.newShoe;
          api.newShoe = function () {
            const cards = config.hands[next++ % config.hands.length].split(" ").map(code => api.fromCode(code));
            // The table deals from the top of the shoe: its last card first.
            return shuffle.apply(api, arguments).concat(cards.reverse());
          };
        }
        Object.defineProperty(window, "RedDogEngine", { value: api, writable: true, configurable: true });
      }
    });
  }, options);
  try {
    await page.goto(options.web ? server.origin + "/games/reddog/index.html" : fileURL(), { waitUntil: "load" });
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
const classes = (page, selector) => page.$$eval(selector, nodes => nodes.map(node => node.className));
// Every line the banner shows from now on, and every phase the table goes
// through. With reduced motion a result stays only a moment, so the tests
// read these records once the hand settles.
async function watch(page) {
  await page.evaluate(() => {
    window.bannerLines = [];
    window.phases = [];
    const node = document.getElementById("bannerText");
    new MutationObserver(() => window.bannerLines.push(node.textContent)).observe(node, { childList: true, characterData: true, subtree: true });
    new MutationObserver(() => window.phases.push(document.body.dataset.phase)).observe(document.body, { attributes: true, attributeFilter: ["data-phase"] });
  });
  return {
    lines: () => page.evaluate(() => window.bannerLines.join("\n")),
    phases: () => page.evaluate(() => window.phases)
  };
}
async function chip(page, value) { await page.click('.chip[data-value="' + value + '"]'); }
async function ante(page, times) { for (let i = 0; i < (times || 1); i++) await page.click('.spot[data-bet="ante"]'); }
async function dealToDecision(page) {
  await page.click("#btnDeal");
  await page.waitForFunction(() => document.body.dataset.phase === "deciding" && document.body.dataset.busy === "false", { timeout: 15000 });
}
async function settled(page) {
  await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false" &&
    localStorage.getItem("pit.reddog.round") === null, { timeout: 20000 });
}
// The ranks lit on the ladder, by what they show.
const ladder = page => page.$$eval("#rankLadder li", nodes => {
  const pick = name => nodes.filter(node => node.classList.contains(name)).map(node => node.textContent);
  return { end: pick("end"), inside: pick("inside"), in: pick("hit-in"), out: pick("hit-out") };
});

test("a spread plays straight from file://: the Raise doubles the bet and the third card between pays both", async () => {
  await scene({ hands: ["4S 9D 7C"] }, async page => {
    await chip(page, 25); await ante(page, 2);
    assert.equal(await balance(page), "9,950");
    await dealToDecision(page);
    assert.equal(await stored(page, "pit.bankroll"), 9950, "the stake left the balance before the first card");
    assert.deepEqual((await stored(page, "pit.reddog.round")).cards, ["4S", "9D", "7C"], "all three cards are saved before the first is shown");
    assert.match(await text(page, "#bannerText"), /Spread of 4, pays 1 TO 1: raise or call\?/);
    assert.equal(await text(page, "#spreadCall"), "Spread 4 · 1 TO 1");
    assert.deepEqual(await ladder(page), { end: ["4", "9"], inside: ["5", "6", "7", "8"], in: [], out: [] });
    assert.deepEqual(await page.$$eval("#paytable tr.live", rows => rows.map(row => row.dataset.pay)), ["wide"]);
    assert.equal(await page.$$eval("#slotThird .card", nodes => nodes.length), 0, "the third card waits for the decision");
    await page.click("#btnRaise");
    await settled(page);
    // Ante 50 and Raise 50 each return 100.
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 100 + 200);
    const stats = await stored(page, "pit.reddog.stats");
    assert.deepEqual([stats.hands, stats.raised, stats.winningHands, stats.wagered, stats.returned], [1, 1, 1, 100, 200]);
    assert.deepEqual(await stored(page, "pit.reddog.lastBets"), { ante: 50 });
  });
});

test("a spread of one pays 5 to 1 on a call", async () => {
  await scene({ hands: ["10S QD JH"] }, async page => {
    await chip(page, 10); await ante(page);
    await dealToDecision(page);
    assert.deepEqual(await page.$$eval("#paytable tr.live", rows => rows.map(row => row.dataset.pay)), ["1"]);
    const seen = await watch(page);
    await page.click("#btnCall");
    await settled(page);
    assert.match(await seen.lines(), /Jack falls between: you win/);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 10 + 60);
    assert.equal((await stored(page, "pit.reddog.stats")).raised, 0);
  });
});

test("a third card of either rank is out and loses the Ante and the Raise", async () => {
  await scene({ hands: ["4S 9D 9H"], motion: true }, async page => {
    await chip(page, 10); await ante(page);
    await dealToDecision(page);
    const seen = await watch(page);
    await page.click("#btnRaise");
    await page.waitForFunction(() => document.querySelector("#rankLadder li.hit-out") !== null);
    assert.deepEqual((await ladder(page)).out, ["9"]);
    assert.match(await text(page, "#spreadCall"), /Spread 4/);
    await settled(page);
    assert.match(await seen.lines(), /Nine is out: the house wins/);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 20);
  });
});

test("two ranks in a row are a push without a third card, and the hand never waits", async () => {
  await scene({ hands: ["7S 8D 2C"] }, async page => {
    await chip(page, 100); await ante(page);
    const seen = await watch(page);
    await page.click("#btnDeal");
    await settled(page);
    assert.match(await seen.lines(), /Seven and Eight are in a row: a push/);
    assert.ok(!(await seen.phases()).includes("deciding"), "no decision to make");
    assert.equal(await stored(page, "pit.bankroll"), 10000);
    assert.equal((await stored(page, "pit.reddog.stats")).pushes, 1);
  });
});

test("a pair draws the third card without a raise: three of a kind pays 11 to 1, a miss is a push", async () => {
  await scene({ hands: ["QS QD QH", "5S 5D KH"] }, async page => {
    await chip(page, 10); await ante(page);
    let seen = await watch(page);
    await page.click("#btnDeal");
    await settled(page);
    assert.match(await seen.lines(), /A pair of Queens: the third card decides\nThree Queens: 11 to 1/);
    assert.ok(!(await seen.phases()).includes("deciding"));
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 10 + 120);
    await page.keyboard.press("r");
    seen = await watch(page);
    await page.click("#btnDeal");
    await settled(page);
    assert.match(await seen.lines(), /No three of a kind: a push/);
    assert.equal(await stored(page, "pit.bankroll"), 10110);
    const stats = await stored(page, "pit.reddog.stats");
    assert.deepEqual([stats.hands, stats.trips, stats.pushes, stats.raised], [2, 1, 1, 0]);
  });
});

test("the strategy hint raises a spread of 7 or more and calls anything less", async () => {
  await scene({ hands: ["2S 10D 5C", "4S 9D 7C"], settings: { coach: true } }, async page => {
    await chip(page, 10); await ante(page);
    await dealToDecision(page);
    assert.match(await text(page, "#bannerSub"), /Strategy: raise/);
    assert.deepEqual(await classes(page, "#btnRaise.coach-pick, #btnCall.coach-pick"), ["deal-btn raise-btn coach-pick"]);
    await page.click("#btnRaise");
    await settled(page);
    await page.keyboard.press("r");
    await dealToDecision(page);
    assert.match(await text(page, "#bannerSub"), /Strategy: call, raise only on a spread of 7 or more/);
    assert.equal(await page.$eval("#btnCall", node => node.classList.contains("coach-pick")), true);
    await page.keyboard.press("c");
    await settled(page);
    // Raised 10 + 10 on the spread of 7, called 10 on the spread of 4: both win even money.
    assert.equal(await stored(page, "pit.bankroll"), 10000 + 20 + 10);
  });
});

test("a reload while the hand waits brings back the same cards for the decision", async () => {
  await scene({ hands: ["4S 9D 7C"] }, async page => {
    await chip(page, 100); await ante(page);
    await dealToDecision(page);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.phase === "deciding" && document.body.dataset.busy === "false");
    assert.match(await text(page, "#toast"), /still on the table/);
    assert.deepEqual(await page.$$eval(".slot", nodes => nodes.map(node => node.getAttribute("aria-label"))),
      ["First card: Four of spades", "Third card: none yet", "Second card: Nine of diamonds"]);
    assert.equal(await stored(page, "pit.bankroll"), 9900, "the reload refunds nothing");
    await page.keyboard.press("r");
    await settled(page);
    assert.equal(await stored(page, "pit.bankroll"), 9900 - 100 + 400);
  });
});

test("a reload after the Raise settles the hand with the third card it was dealt", async () => {
  await scene({ hands: ["2S AD 8H"], motion: true, settings: { animationSpeed: "cinematic" } }, async page => {
    await chip(page, 500); await ante(page);
    await dealToDecision(page);
    await page.click("#btnRaise");
    await page.waitForFunction(() => document.body.dataset.phase === "revealing");
    const round = await stored(page, "pit.reddog.round");
    assert.equal(round.decision, "raise");
    assert.equal(round.stake, 1000);
    assert.equal(await stored(page, "pit.bankroll"), 9000, "the Raise left the balance before the third card");
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => localStorage.getItem("pit.reddog.round") === null && document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 9000 + 2000, "the eight fell between: even money on both bets");
    assert.match(await text(page, "#toast"), /Your unfinished hand was settled: Eight falls between: you win/);
  });
});

test("the Raise needs room in the balance, and the Ante can still be called", async () => {
  await scene({ bankroll: 10, hands: ["4S 9D 7C"] }, async page => {
    await chip(page, 10); await ante(page);
    await dealToDecision(page);
    assert.equal(await page.$eval("#btnRaise", node => node.disabled), true);
    assert.equal(await page.$eval('.spot[data-bet="raise"]', node => node.disabled), true);
    await page.keyboard.press("r");
    assert.equal((await stored(page, "pit.reddog.round")).decision, null, "R does nothing without the money");
    await page.click("#btnCall");
    await settled(page);
    assert.equal(await stored(page, "pit.bankroll"), 20);
  });
});

test("the Ante stops at the table maximum; undo, clear, double and rebet work from the keyboard", async () => {
  await scene({ hands: ["7S 8D 2C"] }, async page => {
    await chip(page, 5000); await ante(page);
    assert.equal(await page.$eval('.spot[data-bet="ante"] .bet-chip', node => node.dataset.amount), "2500");
    assert.match(await text(page, "#toast"), /\$2,500/);
    await page.keyboard.press("c");
    const amounts = () => page.$$eval(".spot-stack .bet-chip", nodes => nodes.map(n => n.dataset.amount));
    assert.deepEqual(await amounts(), []);
    await page.keyboard.press("2");                 // the $25 chip
    await page.keyboard.press("a");
    await page.keyboard.press("d");
    assert.deepEqual(await amounts(), ["50"]);
    await page.keyboard.press("z");
    assert.deepEqual(await amounts(), ["25"]);
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press("Enter");
    await settled(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000, "a push");
    await page.keyboard.press("r");
    assert.deepEqual(await amounts(), ["25"]);
  });
});

test("Turkish names the spread, the ranks and the result", async () => {
  await scene({ hands: ["10S QD JH"], lang: "tr" }, async page => {
    assert.equal(await page.$eval("html", node => node.lang), "tr");
    assert.equal(await text(page, "#bannerText"), "Ante'nizi koyun");
    assert.equal(await text(page, '.spot[data-bet="ante"] .spot-pay'), "ARALIĞA GÖRE ÖDER");
    assert.equal(await text(page, '.spot[data-bet="raise"] .spot-name'), "Artırma");
    await chip(page, 25); await ante(page, 2);
    await dealToDecision(page);
    assert.equal(await text(page, "#bannerText"), "Aralık 1, 1'E 5 öder: artırıyor musunuz, devam mı?");
    assert.equal(await text(page, "#spreadCall"), "Aralık 1 · 1'E 5");
    assert.deepEqual([await text(page, "#btnCall"), await text(page, "#btnRaise")], ["Devam", "Artır"]);
    const seen = await watch(page);
    await page.click("#btnCall");
    await settled(page);
    assert.match(await seen.lines(), /Vale arada: kazandınız/);
    assert.equal(await balance(page), "10.250", "an Ante of $50 wins 5 to 1");
  });
});

test("a round left open at another table holds the deal back", async () => {
  await scene({ seed: { "pit.blackjack.round": { v: 1, resume: "player" } } }, async page => {
    await ante(page);
    await page.click("#btnDeal");
    await page.waitForFunction(() => /Finish the round still open at Table 21 first/.test(document.getElementById("toast").textContent));
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 10000);
    assert.equal(await stored(page, "pit.reddog.round"), null);
  });
});

// Layouts. From desktops to the smallest phones, upright and on their side,
// in both languages: nothing scrolls, nothing leaves the felt or the screen,
// the parts of the felt never overlap, and a full stack of five chips stays
// inside its spot and clear of the spot's print, while betting and while
// the hand waits for the decision.
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
    const key = [".table-felt", ".controls", ".lane", ".spots"].map(selector => {
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
  const parts = [".felt-head", ".lane", ".reading", ".spots", ".paytable"].map(selector => ({ selector, node: document.querySelector(selector) }))
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
  document.querySelectorAll(".lane .card, .slot, .rank-ladder li, .spot, .controls button, #bankroll, #settingsBtn").forEach(node => {
    if (!shown(node)) return;
    const r = rect(node);
    if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push((node.id || node.className.split(" ")[0]) + " leaves the screen");
  });
  document.querySelectorAll(".spot").forEach(spot => {
    const box = rect(spot), print = rect(spot.querySelector(".spot-pay"));
    spot.querySelectorAll(".spot-stack .bet-chip").forEach(stack => {
      const r = rect(stack);
      if (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1) out.push(spot.dataset.bet + " chips leave the spot");
      if (overlap(r, print)) out.push(spot.dataset.bet + " chips cover the print");
    });
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
    for (const problem of await page.evaluate(layoutProblems)) found.push(width + "x" + height + " " + moment + ": " + problem);
  }
  return found;
}

for (const lang of ["en", "tr"]) {
  test(lang + ": the table fits every size, betting and deciding, with a full stack of chips", async () => {
    await scene({ lang, hands: ["2S 10D 5C"] }, async page => {
      // Five different chips make the tallest stack the Ante can hold: $1,635.
      for (const value of [10, 25, 100, 500, 1000]) { await chip(page, value); await ante(page); }
      const problems = await sweepLayouts(page, "betting");
      await resizeTo(page, 1280, 800);
      await dealToDecision(page);
      problems.push(...await sweepLayouts(page, "deciding"));
      await page.screenshot({ path: path.join(artifacts, lang + "-320x568-deciding.png") });
      assert.deepEqual(problems, []);
    });
  });
}

test("installed, the table deals offline", async () => {
  workerRevision++;
  await scene({ web: true, hands: ["4S 9D 7C"] }, async page => {
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, { timeout: 15000 }).catch(async () => {
      await page.reload();
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 });
    });
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    await chip(page, 25); await ante(page);
    await dealToDecision(page);
    await page.click("#btnCall");
    await settled(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 + 25, "the seven fell between: even money");
    await page.setOfflineMode(false);
  });
});
