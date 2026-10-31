/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* Service worker — caches the lobby and every table for full offline play.
   Only used when the pit is served over http(s); on file:// it is skipped. */
var CACHE_VERSION = "pit-v1";
var APP_ROOT = new URL("./", self.location.href || self.location.origin + "/");
var CACHE_PREFIX = "pit-" + encodeURIComponent(APP_ROOT.pathname) + "-";
var CACHE = CACHE_PREFIX + CACHE_VERSION.slice(4);
var ASSETS = [
  // The lobby and what every page shares
  "./",
  "./index.html",
  "./lobby/css/styles.css",
  "./lobby/js/i18n.js",
  "./lobby/js/lobby.js",
  "./shared/js/pit.js",
  "./shared/js/pwa.js",
  "./shared/fonts/thepit-sans-regular.woff2",
  "./shared/fonts/thepit-sans-semibold.woff2",
  "./manifest.json",
  "./icon.svg",
  "./apple-touch-icon.png",

  // Table 21 · Blackjack
  "./games/blackjack/",
  "./games/blackjack/index.html",
  "./games/blackjack/icon.svg",
  "./games/blackjack/css/styles.css",
  "./games/blackjack/js/i18n.js",
  "./games/blackjack/js/sound.js",
  "./games/blackjack/js/engine.js",
  "./games/blackjack/js/rules.js",
  "./games/blackjack/js/chip-stack.js",
  "./games/blackjack/js/strategy.js",
  "./games/blackjack/js/round.js",
  "./games/blackjack/js/game.js",
  "./games/blackjack/assets/audio/card-slide-1.ogg",
  "./games/blackjack/assets/audio/card-slide-2.ogg",
  "./games/blackjack/assets/audio/card-flip.ogg",
  "./games/blackjack/assets/audio/chip-click-1.ogg",
  "./games/blackjack/assets/audio/chip-click-2.ogg",
  "./games/blackjack/assets/audio/chip-stack.ogg",
  "./games/blackjack/assets/audio/chips-push.ogg",
  "./games/blackjack/assets/audio/shuffle.ogg",
  "./games/blackjack/assets/audio/card-slide-1.m4a",
  "./games/blackjack/assets/audio/card-slide-2.m4a",
  "./games/blackjack/assets/audio/card-flip.m4a",
  "./games/blackjack/assets/audio/chip-click-1.m4a",
  "./games/blackjack/assets/audio/chip-click-2.m4a",
  "./games/blackjack/assets/audio/chip-stack.m4a",
  "./games/blackjack/assets/audio/chips-push.m4a",
  "./games/blackjack/assets/audio/shuffle.m4a",

  // Table 37 · Roulette
  "./games/roulette/",
  "./games/roulette/index.html",
  "./games/roulette/icon.svg",
  "./games/roulette/css/styles.css",
  "./games/roulette/js/i18n.js",
  "./games/roulette/js/sound.js",
  "./games/roulette/js/engine.js",
  "./games/roulette/js/layout.js",
  "./games/roulette/js/spin.js",
  "./games/roulette/js/chips.js",
  "./games/roulette/js/store.js",
  "./games/roulette/js/wheel.js",
  "./games/roulette/js/game.js",
  "./games/roulette/assets/audio/chip-click-1.ogg",
  "./games/roulette/assets/audio/chip-click-2.ogg",
  "./games/roulette/assets/audio/chip-stack.ogg",
  "./games/roulette/assets/audio/chips-push.ogg",
  "./games/roulette/assets/audio/ball-clack.ogg",
  "./games/roulette/assets/audio/ball-bounce-1.ogg",
  "./games/roulette/assets/audio/ball-bounce-2.ogg",
  "./games/roulette/assets/audio/ball-drop.ogg",
  "./games/roulette/assets/audio/chip-click-1.m4a",
  "./games/roulette/assets/audio/chip-click-2.m4a",
  "./games/roulette/assets/audio/chip-stack.m4a",
  "./games/roulette/assets/audio/chips-push.m4a",
  "./games/roulette/assets/audio/ball-clack.m4a",
  "./games/roulette/assets/audio/ball-bounce-1.m4a",
  "./games/roulette/assets/audio/ball-bounce-2.m4a",
  "./games/roulette/assets/audio/ball-drop.m4a"
];

self.addEventListener("install", function (e) {
  // Never force an update onto an open page while a round is still in play.
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }));
});

self.addEventListener("message", function (e) {
  if (!e.data || e.data.type !== "PIT_ACTIVATE" || !e.source) return;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clients) {
    var pages = clients.filter(function (client) { return client.url.indexOf(APP_ROOT.href) === 0; });
    // Only the compatible page that declared itself idle can activate us. With
    // the pit open in several tabs, wait for them to close instead of
    // interrupting a round at another table.
    if (pages.length === 1 && pages[0].id === e.source.id) return self.skipWaiting();
  }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) {
      if (k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE) return caches.delete(k);
    }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  function cachedResponse(request) {
    return caches.open(CACHE).then(function (cache) {
      return cache.match(request);
    }).catch(function () { return undefined; });
  }
  function offlineResponse() {
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }

  e.respondWith(
    cachedResponse(e.request).then(function (cached) {
      return cached || fetch(e.request).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          return caches.open(CACHE).then(function (cache) {
            return cache.put(e.request, copy);
          }).catch(function () {
            // A full or unavailable cache must not discard a successful fetch.
          }).then(function () { return res; });
        }
        return res;
      }).catch(function () {
        // Navigations still land on the cached lobby when the device is offline.
        if (e.request.mode === "navigate") {
          return cachedResponse(new URL("index.html", APP_ROOT).href).then(function (shell) {
            return shell || offlineResponse();
          });
        }
        return offlineResponse();
      });
    })
  );
});
