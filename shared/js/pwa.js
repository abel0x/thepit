/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* PWA bootstrap shared by the lobby and every table. The pit itself also
   works directly from file://, where this script does nothing. */
(function () {
  "use strict";

  var isWeb = location.protocol === "http:" || location.protocol === "https:";
  if (!("serviceWorker" in navigator) || !isWeb) return;

  // One worker at the root of the site serves every page. This script lives in
  // shared/js/, so the root is two folders up from its own address.
  var script = document.currentScript;
  var workerURL = new URL("../../sw.js", script && script.src ? script.src : location.href).href;

  var hadController = !!navigator.serviceWorker.controller;
  var reloading = false;
  var updatePending = false;
  var registration = null;

  // Tables mark their state on <body>; the lobby has no table and is always idle.
  function isIdle() {
    var body = document.body;
    if (!body) return false;
    var phase = body.getAttribute("data-phase");
    return (phase === null || phase === "betting") &&
      body.getAttribute("data-busy") !== "true" && !(Number(body.getAttribute("data-wager")) > 0);
  }

  function reloadWhenSafe() {
    if (reloading || !isIdle()) return;
    if (updatePending) {
      reloading = true;
      location.reload();
    } else if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: "PIT_ACTIVATE" });
    }
  }
  window.addEventListener("focus", reloadWhenSafe);

  // When an older cached version is already controlling the page, move to the
  // newly installed shell only after the current round and its animations finish.
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (!hadController) { hadController = true; return; }
    if (reloading) return;
    updatePending = true;
    reloadWhenSafe();
  });

  if (typeof MutationObserver === "function" && document.body) {
    new MutationObserver(reloadWhenSafe).observe(document.body, {
      attributes: true, attributeFilter: ["data-phase", "data-busy", "data-wager"]
    });
  }

  window.addEventListener("load", function () {
    navigator.serviceWorker.register(workerURL).then(function (value) {
      registration = value;
      function watchInstalling() {
        if (registration.installing) registration.installing.addEventListener("statechange", reloadWhenSafe);
      }
      registration.addEventListener("updatefound", watchInstalling);
      watchInstalling();
      reloadWhenSafe();
    }).catch(function () {
      // file:// remains the zero-setup offline fallback; a failed optional PWA
      // registration must never prevent the pit from running.
    });
  });
})();
