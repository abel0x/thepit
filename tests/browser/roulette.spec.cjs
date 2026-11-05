/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// Real-browser suite. Puppeteer is a development dependency only; the game never loads it.
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
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "thepit-roulette-"));
let browser, server, baseURL, workerRevision = 0;

test.before(async () => {
  server = await startServer(root, () => "pit-v" + (900 + workerRevision));
  baseURL = server.origin + "/games/roulette/index.html";
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 20000, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  console.log("Browser: " + await browser.version());
  console.log("Screenshots: " + artifacts);
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

// Opens Table 37 in a fresh profile. options: width, height, touch, motion,
// results (forced spin results, in order), bankroll, settings, lang, url.
async function scene(options, run) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [], remote = [];
  page.setDefaultTimeout(8000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith(new URL(baseURL).origin + "/")) remote.push(request.url());
  });
  await page.setViewport({ width: options.width || 1280, height: options.height || 800, isMobile: !!options.touch, hasTouch: !!options.touch });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: options.motion ? "no-preference" : "reduce" }]);
  await page.evaluateOnNewDocument(config => {
    if (!["file:", "http:", "https:"].includes(location.protocol)) return;
    if (!sessionStorage.getItem("spec.initialized")) {
      localStorage.clear();
      localStorage.setItem("pit.bankroll", JSON.stringify(config.bankroll == null ? 10000 : config.bankroll));
      localStorage.setItem("pit.roulette.settings", JSON.stringify(Object.assign({ animationSpeed: "fast" }, config.settings)));
      localStorage.setItem("pit.lang", config.lang || "en");
      localStorage.setItem("pit.roulette.sound", "false");
      if (config.history) localStorage.setItem("pit.roulette.history", JSON.stringify(config.history));
      sessionStorage.setItem("spec.initialized", "true");
    }
    Object.defineProperty(window, "RouletteEngine", {
      configurable: true,
      set(api) {
        const queue = (config.results || []).slice();
        const draw = api.spin;
        api.spin = function () { return queue.length ? queue.shift() : draw.apply(api, arguments); };
        Object.defineProperty(window, "RouletteEngine", { value: api, writable: true, configurable: true });
      }
    });
  }, options);
  try {
    await page.goto(options.url || baseURL);
    await page.waitForFunction(() => document.getElementById("board").style.width !== "");
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

// Screen position of the spot where a bet's chip sits.
function anchor(page, key) {
  return page.evaluate(key => {
    const board = document.getElementById("board");
    const rect = board.getBoundingClientRect();
    const vertical = document.body.dataset.layout === "narrow";
    const model = BoardLayout.createBoard(vertical ? "vertical" : "horizontal");
    const spanX = model.bounds.x1 - model.bounds.x0, spanY = model.bounds.y1 - model.bounds.y0;
    const scale = vertical ? { sx: rect.height / spanX, sy: rect.width / spanY } : { sx: rect.width / spanX, sy: rect.height / spanY };
    const a = model.anchor(key);
    const v = model.toView(a.x, a.y, scale);
    return { x: rect.left + v.x, y: rect.top + v.y };
  }, key);
}

async function bet(page, key, touch) {
  const p = await anchor(page, key);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

function layoutBets(page) {
  return page.evaluate(() => {
    const out = {};
    document.querySelectorAll("#boardChips .bet-chip").forEach(node => { out[node.dataset.key] = Number(node.dataset.amount); });
    return out;
  });
}

async function chip(page, value) {
  await page.click('.chip[data-value="' + value + '"]');
}

async function spinAndSettle(page) {
  await page.click("#btnSpin");
  await page.waitForFunction(() => document.body.dataset.phase !== "betting");
  await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false", { timeout: 20000 });
}

function stored(page, key) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
}

test("a round plays straight from file:// and pays 35 to 1", async () => {
  await scene({ url: pathToFileURL(path.join(root, "games/roulette/index.html")).href, results: [17] }, async page => {
    await bet(page, "straight:17");
    assert.equal(await page.$eval("#totalBet", node => node.textContent), "25");
    assert.equal(await page.$eval("#bankroll", node => node.textContent), "9,975");
    await spinAndSettle(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 25 + 25 * 36);
    assert.equal(await stored(page, "pit.roulette.round"), null);
    assert.deepEqual(await stored(page, "pit.roulette.history"), [17]);
    assert.equal(await page.$eval("#bankroll", node => node.textContent), "10,875");
    assert.match(await page.$eval("#bannerText", node => node.textContent), /\$900/);
  });
});

for (const layout of [{ name: "horizontal", width: 1280, height: 800 }, { name: "vertical", width: 390, height: 844, touch: true }]) {
  test("every one of the 157 bets can be placed on the " + layout.name + " layout", async () => {
    await scene(Object.assign({ bankroll: 100000 }, layout), async page => {
      await chip(page, 5);
      const keys = await page.evaluate(() => RouletteEngine.BET_LIST.map(b => b.key));
      assert.equal(keys.length, 157);
      for (const key of keys) await bet(page, key, layout.touch);
      const placed = await layoutBets(page);
      assert.deepEqual(Object.keys(placed).sort(), keys.slice().sort());
      assert.ok(Object.values(placed).every(amount => amount === 5));
      assert.equal(await page.$eval("#totalBet", node => node.textContent), "785");
      await page.screenshot({ path: path.join(artifacts, "all-bets-" + layout.name + ".png") });
    });
  });
}

test("a reload during the spin settles the same, already drawn result", async () => {
  await scene({ motion: true, results: [32], settings: { animationSpeed: "cinematic" } }, async page => {
    await chip(page, 100);
    await bet(page, "red");
    await bet(page, "straight:5");
    await page.click("#btnSpin");
    await page.waitForFunction(() => document.body.dataset.phase === "spinning");
    const round = await stored(page, "pit.roulette.round");
    assert.equal(round.result, 32);
    assert.equal(await stored(page, "pit.bankroll"), 9800, "the stake left the balance before the ball was launched");
    await page.reload();
    await page.waitForFunction(() => localStorage.getItem("pit.roulette.round") === null);
    assert.equal(await stored(page, "pit.bankroll"), 9800 + 200);
    assert.deepEqual(await stored(page, "pit.roulette.history"), [32]);
    assert.deepEqual(await stored(page, "pit.roulette.lastBets"), { red: 100, "straight:5": 100 });
    assert.match(await page.$eval("#toast", node => node.textContent), /32/);
  });
});

test("undo, clear, double and rebet work as one action each", async () => {
  await scene({ results: [1] }, async page => {
    await bet(page, "straight:1");
    await bet(page, "split:1-2");
    await page.click("#btnDouble");
    assert.deepEqual(await layoutBets(page), { "straight:1": 50, "split:1-2": 50 });
    await page.click("#btnUndo");
    assert.deepEqual(await layoutBets(page), { "straight:1": 25, "split:1-2": 25 });
    await page.click("#btnClear");
    assert.deepEqual(await layoutBets(page), {});
    await page.click("#btnUndo");
    assert.deepEqual(await layoutBets(page), { "straight:1": 25, "split:1-2": 25 });
    await page.keyboard.press("c");
    await page.keyboard.press("z");
    assert.deepEqual(await layoutBets(page), { "straight:1": 25, "split:1-2": 25 });
    await spinAndSettle(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 50 + 25 * 36 + 25 * 18);
    assert.equal(await page.$eval("#btnRebet", node => node.disabled), false);
    await page.click("#btnRebet");
    assert.deepEqual(await layoutBets(page), { "straight:1": 25, "split:1-2": 25 });
    assert.equal(await page.$eval("#btnRebet", node => node.disabled), true);
  });
});

test("bets stop at the table maximum and the balance", async () => {
  await scene({ bankroll: 9000 }, async page => {
    await chip(page, 1000);
    for (let i = 0; i < 4; i++) await bet(page, "straight:7");
    assert.deepEqual(await layoutBets(page), { "straight:7": 2500 });
    assert.match(await page.$eval("#toast", node => node.textContent), /\$2,500/);
    await chip(page, 5000);
    await bet(page, "red");
    await bet(page, "black");
    assert.deepEqual(await layoutBets(page), { "straight:7": 2500, red: 5000 });
    assert.match(await page.$eval("#toast", node => node.textContent), /balance/i);
    assert.equal(await page.$eval("#bankroll", node => node.textContent), "1,500");
  });
});

test("right-click and Delete take chips back off the layout", async () => {
  await scene({}, async page => {
    await bet(page, "corner:1-2-4-5");
    await bet(page, "corner:1-2-4-5");
    const p = await anchor(page, "corner:1-2-4-5");
    await page.mouse.click(p.x, p.y, { button: "right" });
    assert.deepEqual(await layoutBets(page), { "corner:1-2-4-5": 25 });
  });
});

test("racetrack call bets place the croupier's chips on the layout", async () => {
  await scene({ settings: { neighbours: 2 } }, async page => {
    await chip(page, 5);
    await page.click('.track-section[data-section="voisins"]');
    assert.deepEqual(await layoutBets(page), {
      "trio:0-2-3": 10, "split:4-7": 5, "split:12-15": 5, "split:18-21": 5, "split:19-22": 5, "corner:25-26-28-29": 10, "split:32-35": 5
    });
    await page.click("#btnClear");
    await page.click('.track-cell[data-number="0"]');
    assert.deepEqual(await layoutBets(page), { "straight:3": 5, "straight:26": 5, "straight:0": 5, "straight:32": 5, "straight:15": 5 });
  });
});

test("the French table returns half of even-money bets on zero", async () => {
  await scene({ results: [0, 0], settings: { profile: "french" } }, async page => {
    assert.equal(await page.$eval("body", node => node.dataset.profile), "french");
    assert.match(await page.$eval("#boardSvg", node => node.textContent), /MANQUE/);
    await chip(page, 100);
    await bet(page, "red");
    await bet(page, "dozen:1");
    await spinAndSettle(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 200 + 50);
    await page.click("#settingsBtn");
    await page.click('.rule-profile[data-profile="european"]');
    await page.keyboard.press("Escape");
    await page.click("#btnRebet");
    await spinAndSettle(page);
    assert.equal(await stored(page, "pit.bankroll"), 9850 - 200);
  });
});

test("arrow keys walk every kind of bet and Enter places a chip", async () => {
  await scene({}, async page => {
    await page.focus("#board");
    const keys = new Set();
    for (const step of ["ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft"]) {
      await page.keyboard.press(step);
      keys.add(await page.$eval("#boardFocus", node => node.textContent));
    }
    for (const step of ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown"]) {
      await page.keyboard.press(step);
      keys.add(await page.$eval("#boardFocus", node => node.textContent));
    }
    const text = [...keys].join("\n");
    assert.match(text, /Straight up/);
    assert.match(text, /Split/);
    assert.match(text, /Dozen|1 to 18|Even|Red/);
    await page.keyboard.press("Enter");
    const placed = await layoutBets(page);
    assert.equal(Object.keys(placed).length, 1);
    await page.keyboard.press("Delete");
    assert.deepEqual(await layoutBets(page), {});
  });
});

test("Turkish translates the table, the cloth and the results", async () => {
  await scene({ results: [7] }, async page => {
    await page.click('.lang-btn[data-lang="tr"]');
    assert.equal(await page.$eval("html", node => node.lang), "tr");
    assert.equal(await page.$eval("#bannerText", node => node.textContent), "Bahislerinizi yapın");
    assert.match(await page.$eval("#boardSvg", node => node.textContent), /KIRMIZI|SİYAH|ÇİFT/);
    await bet(page, "straight:7");
    await spinAndSettle(page);
    assert.match(await page.$eval("#bannerText", node => node.textContent), /kazandınız|Bahislerinizi/);
    assert.equal(await page.$eval("#bankroll", node => node.textContent), "10.875");
  });
});

for (const size of [[320, 568], [360, 640], [390, 844], [768, 1024], [844, 390], [1280, 720], [1920, 1080]]) {
  test("the table fits " + size[0] + "×" + size[1] + " without scrolling", async () => {
    await scene({ width: size[0], height: size[1], touch: size[0] < 900 }, async page => {
      const box = await page.evaluate(() => {
        const rects = ["#board", "#btnSpin", "#wheel", "#chipTray", "#bankroll"].map(sel => document.querySelector(sel).getBoundingClientRect());
        return {
          scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight,
          w: innerWidth, h: innerHeight,
          inside: rects.every(r => r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.width > 0)
        };
      });
      assert.ok(box.scrollW <= box.w && box.scrollH <= box.h, JSON.stringify(box));
      assert.ok(box.inside, "every control is on screen");
      await page.screenshot({ path: path.join(artifacts, "fit-" + size.join("x") + ".png") });
    });
  });
}

test("on phones the wheel comes forward for the spin and goes back after", async () => {
  await scene({ width: 390, height: 844, touch: true, motion: true, results: [26] }, async page => {
    await bet(page, "straight:26", true);
    await page.click("#btnSpin");
    await page.waitForFunction(() => document.body.dataset.wheel === "expanded");
    // Wait for the move to finish, then measure the transform.
    await page.waitForFunction(() => {
      const target = Number(getComputedStyle(document.getElementById("tableFelt")).getPropertyValue("--wheel-scale"));
      const current = new DOMMatrix(getComputedStyle(document.getElementById("wheelWell")).transform).a;
      return target > 2 && Math.abs(current - target) < 0.01;
    }, { timeout: 3000 });
    const box = await page.$eval("#wheelWell", node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; });
    assert.ok(box.width > 300 && box.left >= 0 && box.right <= 390, "the wheel fills the width of the phone: " + JSON.stringify(box));
    await page.waitForFunction(() => document.body.dataset.wheel !== "expanded" && document.body.dataset.phase === "betting", { timeout: 20000 });
    assert.equal(await stored(page, "pit.bankroll"), 10000 + 25 * 35);
  });
});

test("two tabs share one balance and never spin it at once", async () => {
  await scene({ motion: true, results: [3], settings: { animationSpeed: "fast" } }, async (page, context) => {
    const other = await context.newPage();
    await other.goto(baseURL);
    await other.waitForFunction(() => document.getElementById("board").style.width !== "");
    await page.bringToFront();
    await bet(page, "straight:3");
    await page.click("#btnSpin");
    await page.waitForFunction(() => document.body.dataset.phase === "spinning");
    await other.bringToFront();
    await bet(other, "black");
    await other.click("#btnSpin");
    await other.waitForFunction(() => /another table or tab/i.test(document.getElementById("toast").textContent));
    await page.bringToFront();
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false", { timeout: 20000 });
    await other.bringToFront();
    await other.waitForFunction(() => document.getElementById("bankroll").textContent === "10,850");
    await other.close();
  });
});

// Every control within reach at every size, in both languages: while the bets
// go down, with a full stack of chips and a large total, and after a spin.
for (const lang of ["en", "tr"]) {
  test(lang + ": every control is within reach at every size, betting and after a spin", async () => {
    await scene({ lang, results: [17] }, async page => {
      for (const value of [5, 25, 100, 500, 1000]) { await chip(page, value); await bet(page, "red"); }
      await chip(page, 25); await bet(page, "straight:17");
      const problems = await sweepReach(page, "betting");
      await resizeTo(page, 1280, 800);
      await spinAndSettle(page);
      problems.push(...await sweepReach(page, "after"));
      assert.deepEqual(problems, []);
    });
  });
}

test("installed, the table loads offline", async () => {
  workerRevision++;
  await scene({}, async page => {
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, { timeout: 15000 }).catch(async () => {
      await page.reload();
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 });
    });
    await page.setOfflineMode(true);
    await page.reload();
    await page.waitForFunction(() => document.getElementById("board").style.width !== "");
    assert.equal(await page.$eval("#bannerText", node => node.textContent), "Place your bets");
    await page.setOfflineMode(false);
  });
});
