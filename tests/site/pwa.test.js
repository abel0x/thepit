/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// The optional installed app: one service worker for the lobby and every
// table, and the registration script each page loads.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

/* ---------------- Registration (shared/js/pwa.js) ---------------- */

// Runs pwa.js as a page would. attributes are the <body> data attributes a
// table keeps up to date; the lobby has none.
function pwa(attributes, options = {}) {
  attributes = Object.assign({}, attributes);
  const listeners = {}, windowListeners = {};
  const registered = [];
  let observe, reloads = 0, protocol = options.protocol || "https:";
  vm.runInNewContext(read("shared/js/pwa.js"), {
    URL,
    location: { protocol, href: options.page || "https://table.test/one/games/roulette/index.html", reload() { reloads++; } },
    navigator: {
      serviceWorker: {
        controller: options.controlled === false ? null : {},
        addEventListener(name, callback) { listeners[name] = callback; },
        register(url) { registered.push(url); return Promise.resolve({ addEventListener() {}, installing: null, waiting: null }); }
      }
    },
    document: {
      currentScript: { src: options.script || "https://table.test/one/shared/js/pwa.js" },
      body: { getAttribute(name) { return name in attributes ? attributes[name] : null; } }
    },
    window: { addEventListener(name, callback) { windowListeners[name] = callback; } },
    MutationObserver: class { constructor(callback) { observe = callback; } observe() {} }
  });
  return {
    registered,
    load() { if (windowListeners.load) windowListeners.load(); },
    update() { listeners.controllerchange(); },
    set(next) { Object.assign(attributes, next); observe(); },
    get reloads() { return reloads; }
  };
}

const atTable = { "data-phase": "player", "data-busy": "false", "data-wager": "100" };

test("registration is limited to web protocols", () => {
  const source = read("shared/js/pwa.js");
  assert.match(source, /location\.protocol === "http:" \|\| location\.protocol === "https:"/);
  assert.match(source, /if \(!\("serviceWorker" in navigator\) \|\| !isWeb\) return;/);
  const app = pwa({}, { protocol: "file:" });
  app.load();
  assert.deepEqual(app.registered, []);
});

test("every page registers the one worker at the root of the pit", () => {
  const table = pwa({ "data-phase": "betting" });
  table.load();
  const lobby = pwa({}, { page: "https://table.test/one/index.html" });
  lobby.load();
  assert.deepEqual(table.registered, ["https://table.test/one/sw.js"]);
  assert.deepEqual(lobby.registered, ["https://table.test/one/sw.js"]);
});

test("a pending update reloads a table once, only after the round and wager clear", () => {
  const app = pwa(atTable);
  app.update();
  for (const phase of ["dealer", "payout", "clearing", "spinning", "settling", "betting"]) {
    app.set({ "data-phase": phase });
    assert.equal(app.reloads, 0, phase);
  }
  app.set({ "data-wager": "0" });
  assert.equal(app.reloads, 1);
  app.update(); app.set({ "data-wager": "0" });
  assert.equal(app.reloads, 1);
});

for (const phase of ["dealing", "insurance", "player", "dealer", "payout", "clearing", "spinning", "settling"]) {
  test("an update never interrupts a round during " + phase, () => {
    const app = pwa({ "data-phase": phase, "data-wager": "0" });
    app.update();
    assert.equal(app.reloads, 0);
  });
}

test("a staged bet or an account operation holds an otherwise idle reload", () => {
  const staged = pwa({ "data-phase": "betting", "data-wager": "25" });
  staged.update(); assert.equal(staged.reloads, 0);
  staged.set({ "data-wager": "0" }); assert.equal(staged.reloads, 1);

  const busy = pwa({ "data-phase": "betting", "data-wager": "0", "data-busy": "true" });
  busy.update(); assert.equal(busy.reloads, 0);
  busy.set({ "data-busy": "false" }); assert.equal(busy.reloads, 1);
});

test("the lobby has no table and takes an update at once", () => {
  const app = pwa({}, { page: "https://table.test/one/index.html" });
  app.update(); app.update();
  assert.equal(app.reloads, 1);
});

test("the first worker to take control is not an update", () => {
  const app = pwa({ "data-phase": "betting", "data-wager": "0" }, { controlled: false });
  app.update(); assert.equal(app.reloads, 0);
  app.update(); assert.equal(app.reloads, 1);
});

/* ---------------- The worker (sw.js) ---------------- */

function worker(options = {}) {
  const callbacks = {}, opened = [], removed = [];
  let activations = 0;
  const context = {
    URL, Request, Response,
    self: {
      location: { origin: "https://table.test", href: "https://table.test/one/sw.js" },
      clients: { claim: async () => {}, matchAll: async () => options.clients || [] },
      skipWaiting: async () => { activations++; },
      addEventListener(name, callback) { callbacks[name] = callback; }
    },
    caches: {
      keys: async () => options.keys || [],
      delete: async key => { removed.push(key); },
      open: async key => {
        opened.push(key);
        if (options.unavailable) throw new Error("storage denied");
        return {
          addAll: async list => { if (options.added) options.added.push(...list); },
          match: async request => options.cached && options.cached(typeof request === "string" ? request : request.url),
          put: async () => { if (options.full) throw new Error("QuotaExceededError"); }
        };
      },
      match: async () => { throw new Error("Unscoped cache access"); }
    },
    fetch: async () => {
      if (options.offline) throw new Error("offline");
      return new Response("network response", { status: options.status || 200 });
    }
  };
  vm.runInNewContext(read("sw.js"), context);
  return {
    opened, removed, cache: context.CACHE, prefix: context.CACHE_PREFIX,
    get activations() { return activations; },
    async install() { let done; callbacks.install({ waitUntil(value) { done = value; } }); await done; },
    async requestActivation(id, type = "PIT_ACTIVATE") {
      let done;
      callbacks.message({ data: { type }, source: { id }, waitUntil(value) { done = value; } });
      await done;
    },
    async fetch(url = "https://table.test/one/route", init = {}, mode = "cors") {
      let response;
      const request = { url, method: init.method || "GET", mode };
      callbacks.fetch({ request, respondWith(value) { response = value; } });
      return response;
    },
    async activate() { let done; callbacks.activate({ waitUntil(value) { done = value; } }); await done; }
  };
}

test("installing caches the whole pit: the lobby and every table", async () => {
  const added = [];
  await worker({ added }).install();
  ["./", "./index.html", "./games/blackjack/index.html", "./games/roulette/index.html", "./shared/js/pit.js"].forEach(asset => {
    assert.ok(added.includes(asset), asset);
  });
});

test("the worker leaves third-party and non-GET requests alone", async () => {
  const app = worker();
  assert.equal(await app.fetch("https://outside.test/asset"), undefined);
  assert.equal(await app.fetch("https://table.test/one/action", { method: "POST" }), undefined);
});

test("unavailable cache storage still permits a successful network response", async () => {
  const app = worker({ unavailable: true });
  assert.equal(await (await app.fetch()).text(), "network response");
});

test("a full cache never turns an HTTP 200 into a false offline error", async () => {
  const app = worker({ full: true });
  assert.equal((await app.fetch()).status, 200);
});

test("a server error is preserved rather than cached or disguised", async () => {
  const app = worker({ status: 404 });
  assert.equal((await app.fetch()).status, 404);
});

test("offline navigation without any cached shell returns an explicit 503", async () => {
  const app = worker({ offline: true });
  assert.equal((await app.fetch(undefined, {}, "navigate")).status, 503);
});

test("offline navigation lands in this installation's own lobby", async () => {
  const app = worker({ offline: true, cached: url => url === "https://table.test/one/index.html" ? new Response("the lobby") : undefined });
  assert.equal(await (await app.fetch("https://table.test/one/games/unknown/", {}, "navigate")).text(), "the lobby");
  assert.ok(app.opened.every(key => key === app.cache), "only its own cache is read");
});

test("cache cleanup retires older versions of this installation only", async () => {
  const app = worker();
  const old = app.prefix + "v0";
  const cleanup = worker({ keys: [old, app.cache, "pit-%2Ftwo%2F-v1", "t37-%2Fone%2F-v1", "unrelated-app"] });
  await cleanup.activate();
  assert.deepEqual(cleanup.removed, [old]);
});

test("installing a new worker never forces an older live page to upgrade", async () => {
  const app = worker({ clients: [{ id: "old", url: "https://table.test/one/index.html" }] });
  await app.install();
  assert.equal(app.activations, 0);
});

test("a single compatible idle page can activate a waiting worker", async () => {
  const app = worker({ clients: [{ id: "ready", url: "https://table.test/one/games/blackjack/index.html" }] });
  await app.requestActivation("ready");
  assert.equal(app.activations, 1);
});

test("an update requested by the lobby cannot interrupt a table in another tab", async () => {
  const app = worker({ clients: [
    { id: "lobby", url: "https://table.test/one/index.html" },
    { id: "table", url: "https://table.test/one/games/roulette/index.html" }
  ] });
  await app.requestActivation("lobby");
  assert.equal(app.activations, 0);
});

test("unrelated clients and unrelated messages cannot trigger activation", async () => {
  const app = worker({ clients: [{ id: "ready", url: "https://table.test/one/index.html" }] });
  await app.requestActivation("outsider");
  await app.requestActivation("ready", "TABLE37_ACTIVATE");
  assert.equal(app.activations, 0);
});
