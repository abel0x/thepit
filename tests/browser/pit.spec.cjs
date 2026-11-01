/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// Real-browser suite for the pit as a whole: the lobby, the shared wallet and
// the way the tables live together. Puppeteer is a development dependency
// only; the pit never loads it.
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
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "thepit-lobby-"));
let browser, server, workerRevision = 0;

test.before(async () => {
  server = await startServer(root, () => "pit-v" + (700 + workerRevision));
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 20000, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  console.log("Browser: " + await browser.version());
  console.log("Screenshots: " + artifacts);
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

function fileURL(page) { return pathToFileURL(path.join(root, page)).href; }

// Opens a page of the pit in a fresh profile. options: web (serve over http
// instead of file://), page, width, height, bankroll, lang, theme, results
// (forced roulette numbers) and draw (forced blackjack cards, in deal order).
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
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.evaluateOnNewDocument(config => {
    if (!["file:", "http:", "https:"].includes(location.protocol)) return;
    // Seed once per scene. Every scene starts from an empty profile, and this
    // marker lives in localStorage because a sessionStorage flag does not
    // reliably follow file:// navigations from page to page.
    if (!localStorage.getItem("spec.seeded")) {
      localStorage.setItem("pit.bankroll", JSON.stringify(config.bankroll == null ? 10000 : config.bankroll));
      localStorage.setItem("pit.lang", config.lang || "en");
      if (config.theme) localStorage.setItem("pit.theme", JSON.stringify(config.theme));
      localStorage.setItem("pit.blackjack.settings", JSON.stringify({ ruleProfile: "atlanticCity", animationSpeed: "fast" }));
      localStorage.setItem("pit.roulette.settings", JSON.stringify({ animationSpeed: "fast" }));
      localStorage.setItem("pit.blackjack.sound", "false");
      localStorage.setItem("pit.roulette.sound", "false");
      localStorage.setItem("spec.seeded", "true");
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
    Object.defineProperty(window, "BlackjackEngine", {
      configurable: true,
      set(api) {
        if (config.draw) {
          // The shoe deals from its end, so the forced cards go there in reverse.
          api.shuffle = function (shoe) {
            const selected = config.draw.map(rank => shoe.splice(shoe.findIndex(card => card.rank === rank), 1)[0]);
            return shoe.concat(selected.reverse());
          };
        }
        Object.defineProperty(window, "BlackjackEngine", { value: api, writable: true, configurable: true });
      }
    });
  }, options);
  try {
    await page.goto(options.web ? server.origin + "/" + (options.page || "index.html") : fileURL(options.page || "index.html"), { waitUntil: "load" });
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

async function follow(page, selector) {
  await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click(selector)]);
}
const enterTable = (page, id) => follow(page, '.table-card-link[href="games/' + id + '/index.html"]');
const backToLobby = page => follow(page, ".lobby-link");
const balance = page => page.$eval("#bankroll", node => node.textContent);
const stored = (page, key) => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);

async function rouletteReady(page) {
  await page.waitForFunction(() => document.getElementById("board").style.width !== "");
}
async function spinAndSettle(page) {
  await page.click("#btnSpin");
  await page.waitForFunction(() => document.body.dataset.phase !== "betting");
  await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false", { timeout: 20000 });
}
// Places one chip on a bet of the roulette layout.
async function rouletteBet(page, key) {
  const point = await page.evaluate(key => {
    const board = document.getElementById("board");
    const rect = board.getBoundingClientRect();
    const model = BoardLayout.createBoard("horizontal");
    const scale = { sx: rect.width / (model.bounds.x1 - model.bounds.x0), sy: rect.height / (model.bounds.y1 - model.bounds.y0) };
    const anchor = model.anchor(key);
    const view = model.toView(anchor.x, anchor.y, scale);
    return { x: rect.left + view.x, y: rect.top + view.y };
  }, key);
  await page.mouse.click(point.x, point.y);
}
async function toast(page, pattern) {
  await page.waitForFunction(source => new RegExp(source, "i").test(document.getElementById("toast").textContent), {}, pattern.source);
}

test("from file:// the lobby leads to every table and each back to the lobby", async () => {
  await scene({}, async page => {
    assert.equal(await page.title(), "ThePit");
    assert.equal(await balance(page), "10,000");
    await enterTable(page, "blackjack");
    assert.equal(await page.title(), "Table 21 · ThePit");
    await page.waitForFunction(() => document.body.dataset.phase === "betting");
    assert.equal(await balance(page), "10,000");
    await backToLobby(page);
    assert.equal(await page.title(), "ThePit");
    await enterTable(page, "roulette");
    assert.equal(await page.title(), "Table 37 · ThePit");
    await rouletteReady(page);
    await backToLobby(page);
    await enterTable(page, "baccarat");
    assert.equal(await page.title(), "Table 9 · ThePit");
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false");
    assert.equal(await balance(page), "10,000");
    await backToLobby(page);
    await enterTable(page, "threecard");
    assert.equal(await page.title(), "Table 3 · ThePit");
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false");
    assert.equal(await balance(page), "10,000");
    await backToLobby(page);
    await enterTable(page, "slot");
    assert.equal(await page.title(), "Slot 5 · ThePit");
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false");
    assert.equal(await balance(page), "10,000");
    await backToLobby(page);
    await enterTable(page, "craps");
    assert.equal(await page.title(), "Table 7 · ThePit");
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false");
    assert.equal(await balance(page), "10,000");
    await backToLobby(page);
    await enterTable(page, "holdem");
    assert.equal(await page.title(), "Table 2 · ThePit");
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false");
    assert.equal(await balance(page), "10,000");
    await backToLobby(page);
    await enterTable(page, "videopoker");
    assert.equal(await page.title(), "Poker 11 · ThePit");
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false");
    assert.equal(await balance(page), "10,000");
    await backToLobby(page);
    await enterTable(page, "sicbo");
    assert.equal(await page.title(), "Table 18 · ThePit");
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false");
    assert.equal(await balance(page), "10,000");
    await backToLobby(page);
    await enterTable(page, "keno");
    assert.equal(await page.title(), "Keno 80 · ThePit");
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false");
    assert.equal(await balance(page), "10,000");
    await backToLobby(page);
    await enterTable(page, "bigsix");
    assert.equal(await page.title(), "Wheel 54 · ThePit");
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false");
    assert.equal(await balance(page), "10,000");
    await backToLobby(page);
    assert.match(page.url(), /\/index\.html$/);
  });
});

test("chips won at one table are on the balance in the lobby and at the other table", async () => {
  await scene({ results: [17] }, async page => {
    await enterTable(page, "roulette");
    await rouletteReady(page);
    await rouletteBet(page, "straight:17");
    await spinAndSettle(page);
    assert.equal(await stored(page, "pit.bankroll"), 10000 - 25 + 25 * 36);
    await backToLobby(page);
    assert.equal(await balance(page), "10,875");
    await enterTable(page, "blackjack");
    await page.waitForFunction(() => document.getElementById("bankroll").textContent === "10,875");
  });
});

test("play money added in the lobby waits for the shared lock and reaches an open table", async () => {
  await scene({}, async (page, context) => {
    const table = await context.newPage();
    await table.goto(fileURL("games/roulette/index.html"), { waitUntil: "load" });
    await rouletteReady(table);
    // The table keeps the wallet busy, as it does while a spin is in play,
    // until the test lets it go.
    await table.evaluate(() => {
      window.held = navigator.locks.request("pit.account", () => new Promise(resolve => { window.releaseWallet = resolve; }));
    });
    await table.waitForFunction(() => typeof window.releaseWallet === "function");
    await page.bringToFront();
    await page.click("#settingsBtn");
    await page.click('[data-deposit="5000"]');
    await toast(page, /still in play at another table or tab/);
    assert.equal(await stored(page, "pit.bankroll"), 10000);
    await table.evaluate(() => { window.releaseWallet(); return window.held; });
    await page.click('[data-deposit="5000"]');
    await toast(page, /Added \$5,000/);
    assert.equal(await stored(page, "pit.bankroll"), 15000);
    assert.equal(await balance(page), "15,000");
    await table.waitForFunction(() => document.getElementById("bankroll").textContent === "15,000");
    // Fractions and blanks are refused rather than rounded.
    await page.type("#depositAmount", "1.5");
    await page.click("#btnDeposit");
    await toast(page, /whole-number/);
    assert.equal(await stored(page, "pit.bankroll"), 15000);
    await table.close();
  });
});

test("a hand left open at Table 21 holds back every other table until it is played out", async () => {
  // You 10 and 9; the dealer 7, 8 and then a 10 to bust.
  await scene({ draw: ["10", "7", "9", "8", "10"], results: [5] }, async page => {
    await enterTable(page, "blackjack");
    await page.click('.chip[data-value="100"]');
    await page.click("#btnDeal");
    await page.waitForFunction(() => document.body.dataset.phase === "player");
    await backToLobby(page);

    assert.ok(await stored(page, "pit.blackjack.round"), "the hand was saved before leaving");
    assert.equal(await page.$eval('.table-card[data-game="blackjack"]', node => node.classList.contains("round-open")), true);
    assert.equal(await page.$eval('.table-card[data-game="roulette"]', node => node.classList.contains("round-open")), false);
    assert.equal(await page.$eval('.table-card[data-game="blackjack"] .table-card-status', node => getComputedStyle(node).display !== "none"), true);
    assert.equal(await balance(page), "10,000", "the stake is still on Table 21, not lost");

    await enterTable(page, "roulette");
    await rouletteReady(page);
    // The table left mid-hand let go of the wallet's lock as it closed; on a
    // slow machine that can take a moment, and until then the wallet is busy.
    await page.waitForFunction(async () => (await navigator.locks.query()).held.length === 0);
    await rouletteBet(page, "straight:5");
    await page.click("#btnSpin");
    await toast(page, /Finish the round still open at Table 21 first/);
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && document.body.dataset.busy === "false");
    assert.equal(await stored(page, "pit.bankroll"), 10000);
    assert.equal(await stored(page, "pit.roulette.round"), null);

    await backToLobby(page);
    await enterTable(page, "blackjack");
    await page.waitForFunction(() => document.body.dataset.phase === "player");
    assert.equal(await page.$$eval("#playerHands .card", nodes => nodes.length), 2, "the same hand is back on the felt");
    await page.click("#btnStand");
    await page.waitForFunction(() => document.body.dataset.phase === "betting" && localStorage.getItem("pit.blackjack.round") === null, { timeout: 15000 });
    assert.equal(await stored(page, "pit.bankroll"), 10100, "the dealer busts and the $100 hand is paid");

    await backToLobby(page);
    assert.equal(await page.$eval('.table-card[data-game="blackjack"]', node => node.classList.contains("round-open")), false);
    await enterTable(page, "roulette");
    await rouletteReady(page);
    await rouletteBet(page, "straight:5");
    await spinAndSettle(page);
    assert.equal(await stored(page, "pit.bankroll"), 10100 - 25 + 25 * 36);
  });
});

test("the cloth and the language chosen anywhere dress the whole pit", async () => {
  await scene({}, async page => {
    await page.click("#settingsBtn");
    await page.click('.theme-option[data-set-theme="midnight"]');
    await page.click('[data-set-lang="tr"]');
    assert.equal(await page.$eval("body", node => node.dataset.theme), "midnight");
    assert.equal(await page.$eval(".floor-intro h2", node => node.textContent), "Masanızı seçin");
    assert.equal(await page.$eval('meta[name="theme-color"]', node => node.content), "#102c49");
    await page.keyboard.press("Escape");

    await enterTable(page, "blackjack");
    assert.equal(await page.$eval("body", node => node.dataset.theme), "midnight");
    assert.equal(await page.$eval("html", node => node.lang), "tr");
    assert.equal(await page.$eval(".lobby-link", node => node.getAttribute("aria-label")), "Lobiye dön");
    await backToLobby(page);

    await enterTable(page, "roulette");
    await rouletteReady(page);
    assert.equal(await page.$eval("body", node => node.dataset.theme), "midnight");
    assert.equal(await page.$eval("html", node => node.lang), "tr");
    await page.click("#settingsBtn");
    await page.click('.theme-option[data-set-theme="bordeaux"]');
    await page.keyboard.press("Escape");
    await backToLobby(page);
    assert.equal(await page.$eval("body", node => node.dataset.theme), "bordeaux");
    assert.equal(await page.$eval('.theme-option[data-set-theme="bordeaux"]', node => node.getAttribute("aria-checked")), "true");
  });
});

test("the lobby's settings keep focus inside and give it back on Escape", async () => {
  await scene({}, async page => {
    await page.focus("#settingsBtn");
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement.matches("#settingsModal .modal-head [data-close]")), true);
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => !!document.activeElement.closest("#settingsModal")), true, "focus stays in the dialog");
    }
    await page.keyboard.press("Escape");
    assert.equal(await page.$eval("#settingsModal", node => node.hidden), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), "settingsBtn");
    // Arrow keys move through the cloths like a radio group.
    await page.click("#settingsBtn");
    await page.focus('.theme-option[data-set-theme="emerald"]');
    await page.keyboard.press("ArrowRight");
    assert.equal(await stored(page, "pit.theme"), "midnight");
    assert.equal(await page.evaluate(() => document.activeElement.dataset.setTheme), "midnight");
  });
});

for (const size of [[320, 568], [360, 640], [390, 844], [768, 1024], [844, 390], [1280, 720], [1920, 1080]]) {
  test("the lobby fits " + size[0] + "×" + size[1] + " without sideways scrolling", async () => {
    await scene({ width: size[0], height: size[1] }, async page => {
      const box = await page.evaluate(() => {
        const cards = [...document.querySelectorAll(".table-card")].map(node => node.getBoundingClientRect());
        const actions = document.querySelector(".topbar-actions").getBoundingClientRect();
        const brand = document.querySelector(".brand").getBoundingClientRect();
        return {
          scrollW: document.documentElement.scrollWidth, w: innerWidth,
          cards: cards.every(r => r.left >= 0 && r.right <= innerWidth + 1 && r.width > 200),
          topbar: brand.right <= actions.left + 1
        };
      });
      assert.ok(box.scrollW <= box.w, JSON.stringify(box));
      assert.ok(box.cards, "every table card is fully on screen");
      assert.ok(box.topbar, "the brand never runs under the balance");
      await page.screenshot({ path: path.join(artifacts, "lobby-" + size.join("x") + ".png"), fullPage: true });
    });
  });
}

test("installed, the whole pit opens offline: the lobby and both tables", async () => {
  workerRevision++;
  await scene({ web: true }, async page => {
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, { timeout: 15000 }).catch(async () => {
      await page.reload();
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 });
    });
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: "load" });
    assert.equal(await balance(page), "10,000");
    await enterTable(page, "blackjack");
    await page.waitForFunction(() => document.body.dataset.phase === "betting");
    assert.equal(await page.evaluate(() => document.fonts.check('16px "ThePit Sans"')), true, "the shared font came from the cache");
    await backToLobby(page);
    await enterTable(page, "roulette");
    await rouletteReady(page);
    await page.setOfflineMode(false);
  });
});
