/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* Service worker — caches the lobby and every table for full offline play.
   Only used when the pit is served over http(s); on file:// it is skipped. */
var CACHE_VERSION = "pit-v42";
var APP_ROOT = new URL("./", self.location.href || self.location.origin + "/");
var CACHE_PREFIX = "pit-" + encodeURIComponent(APP_ROOT.pathname) + "-";
var CACHE = CACHE_PREFIX + CACHE_VERSION.slice(4);
var ASSETS = [
  // The lobby and what every page shares
  "./",
  "./index.html",
  "./lobby/css/styles.css",
  "./lobby/js/strings.js",
  "./lobby/js/lobby.js",
  "./shared/css/pit.css",
  "./shared/css/table.css",
  "./shared/css/cards.css",
  "./shared/css/chip-tables.css",
  "./shared/js/pit.js",
  "./shared/js/i18n.js",
  "./shared/js/pwa.js",
  "./shared/js/cards.js",
  "./shared/js/card-sound.js",
  "./shared/js/chips.js",
  "./shared/js/tally.js",
  "./shared/fonts/thepit-sans-regular.woff2",
  "./shared/fonts/thepit-sans-semibold.woff2",
  "./shared/audio/card-slide-1.ogg",
  "./shared/audio/card-slide-2.ogg",
  "./shared/audio/card-flip.ogg",
  "./shared/audio/chip-click-1.ogg",
  "./shared/audio/chip-click-2.ogg",
  "./shared/audio/chip-stack.ogg",
  "./shared/audio/chips-push.ogg",
  "./shared/audio/shuffle.ogg",
  "./shared/audio/card-slide-1.m4a",
  "./shared/audio/card-slide-2.m4a",
  "./shared/audio/card-flip.m4a",
  "./shared/audio/chip-click-1.m4a",
  "./shared/audio/chip-click-2.m4a",
  "./shared/audio/chip-stack.m4a",
  "./shared/audio/chips-push.m4a",
  "./shared/audio/shuffle.m4a",
  "./manifest.json",
  "./icon.svg",
  "./apple-touch-icon.png",

  // Table 21 · Blackjack
  "./games/blackjack/",
  "./games/blackjack/index.html",
  "./games/blackjack/icon.svg",
  "./games/blackjack/css/styles.css",
  "./games/blackjack/js/strings.js",
  "./games/blackjack/js/engine.js",
  "./games/blackjack/js/rules.js",
  "./games/blackjack/js/chip-stack.js",
  "./games/blackjack/js/strategy.js",
  "./games/blackjack/js/sidebets.js",
  "./games/blackjack/js/count.js",
  "./games/blackjack/js/round.js",
  "./games/blackjack/js/game.js",

  // Table 9 · Baccarat
  "./games/baccarat/",
  "./games/baccarat/index.html",
  "./games/baccarat/icon.svg",
  "./games/baccarat/css/styles.css",
  "./games/baccarat/js/strings.js",
  "./games/baccarat/js/engine.js",
  "./games/baccarat/js/store.js",
  "./games/baccarat/js/game.js",

  // Table 3 · Three Card Poker
  "./games/threecard/",
  "./games/threecard/index.html",
  "./games/threecard/icon.svg",
  "./games/threecard/css/styles.css",
  "./games/threecard/js/strings.js",
  "./games/threecard/js/engine.js",
  "./games/threecard/js/store.js",
  "./games/threecard/js/game.js",

  // Slot 5 · Slot machine
  "./games/slot/",
  "./games/slot/index.html",
  "./games/slot/icon.svg",
  "./games/slot/css/styles.css",
  "./games/slot/js/strings.js",
  "./games/slot/js/engine.js",
  "./games/slot/js/store.js",
  "./games/slot/js/game.js",

  // Table 7 · Craps
  "./games/craps/",
  "./games/craps/index.html",
  "./games/craps/icon.svg",
  "./games/craps/css/styles.css",
  "./games/craps/js/strings.js",
  "./games/craps/js/engine.js",
  "./games/craps/js/store.js",
  "./games/craps/js/game.js",

  // Table 2 · Casino Hold'em
  "./games/holdem/",
  "./games/holdem/index.html",
  "./games/holdem/icon.svg",
  "./games/holdem/css/styles.css",
  "./games/holdem/js/strings.js",
  "./games/holdem/js/engine.js",
  "./games/holdem/js/store.js",
  "./games/holdem/js/game.js",

  // Poker 11 · Video poker
  "./games/videopoker/",
  "./games/videopoker/index.html",
  "./games/videopoker/icon.svg",
  "./games/videopoker/css/styles.css",
  "./games/videopoker/js/strings.js",
  "./games/videopoker/js/engine.js",
  "./games/videopoker/js/store.js",
  "./games/videopoker/js/game.js",

  // Table 18 · Sic Bo
  "./games/sicbo/",
  "./games/sicbo/index.html",
  "./games/sicbo/icon.svg",
  "./games/sicbo/css/styles.css",
  "./games/sicbo/js/strings.js",
  "./games/sicbo/js/engine.js",
  "./games/sicbo/js/store.js",
  "./games/sicbo/js/game.js",

  // Keno 80 · Keno
  "./games/keno/",
  "./games/keno/index.html",
  "./games/keno/icon.svg",
  "./games/keno/css/styles.css",
  "./games/keno/js/strings.js",
  "./games/keno/js/engine.js",
  "./games/keno/js/store.js",
  "./games/keno/js/game.js",

  // Wheel 54 · Big Six
  "./games/bigsix/",
  "./games/bigsix/index.html",
  "./games/bigsix/icon.svg",
  "./games/bigsix/css/styles.css",
  "./games/bigsix/js/strings.js",
  "./games/bigsix/js/engine.js",
  "./games/bigsix/js/store.js",
  "./games/bigsix/js/game.js",

  // Table 13 · Red Dog
  "./games/reddog/",
  "./games/reddog/index.html",
  "./games/reddog/icon.svg",
  "./games/reddog/css/styles.css",
  "./games/reddog/js/strings.js",
  "./games/reddog/js/engine.js",
  "./games/reddog/js/store.js",
  "./games/reddog/js/game.js",

  // Drop 16 · Peg board
  "./games/pegboard/",
  "./games/pegboard/index.html",
  "./games/pegboard/icon.svg",
  "./games/pegboard/css/styles.css",
  "./games/pegboard/js/strings.js",
  "./games/pegboard/js/engine.js",
  "./games/pegboard/js/store.js",
  "./games/pegboard/js/game.js",

  // Table 4 · Fan-Tan
  "./games/fantan/",
  "./games/fantan/index.html",
  "./games/fantan/icon.svg",
  "./games/fantan/css/styles.css",
  "./games/fantan/js/strings.js",
  "./games/fantan/js/engine.js",
  "./games/fantan/js/store.js",
  "./games/fantan/js/game.js",

  // Table 37 · Roulette
  "./games/roulette/",
  "./games/roulette/index.html",
  "./games/roulette/icon.svg",
  "./games/roulette/css/styles.css",
  "./games/roulette/js/strings.js",
  "./games/roulette/js/sound.js",
  "./games/roulette/js/engine.js",
  "./games/roulette/js/layout.js",
  "./games/roulette/js/spin.js",
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
