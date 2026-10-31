/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   ThePit — the lobby
   Shows the shared play-money balance and the tables of the pit, and
   holds the settings every page shares: the language and the cloth.
   Play money added here goes through the same account lock the tables
   use, so it can never collide with a round in play.
   ========================================================= */
(function () {
  "use strict";

  var global = window;
  var Pit = global.Pit;
  var I18n = global.I18n;
  if (!Pit || !I18n) throw new Error("Pit and I18n must load before lobby.js");

  var t = I18n.t;
  function $(id) { return document.getElementById(id); }
  function fmt(n) { return Number(n).toLocaleString(I18n.locale()); }
  function money(n) { return "$" + fmt(n); }

  function safeStorage(name) {
    try { return global[name]; } catch (e) { return null; }
  }

  var local = safeStorage("localStorage");
  var account = Pit.createAccount({
    local: local,
    session: safeStorage("sessionStorage"),
    locks: global.navigator.locks
  });

  var el = {
    bankroll: $("bankroll"),
    balancePill: $("balancePill"),
    settingsBtn: $("settingsBtn"),
    settings: $("settingsModal"),
    themePicker: document.querySelector(".theme-picker"),
    depositInput: $("depositAmount"),
    depositBtn: $("btnDeposit"),
    toast: $("toast")
  };

  /* ---------------- Balance ---------------- */
  function readBankroll() {
    return Pit.normalizeBankroll(account.read(Pit.KEYS.bankroll, Pit.START_BANKROLL));
  }

  function renderBankroll() {
    el.bankroll.textContent = fmt(readBankroll());
  }

  function flashBalance() {
    el.balancePill.classList.remove("win-flash");
    void el.balancePill.offsetWidth;
    el.balancePill.classList.add("win-flash");
  }

  // Marks every table whose last round was left unfinished: its stake is
  // still on that table, and the other tables wait until it is played out.
  function renderOpenRounds() {
    var open = account.roundsElsewhere(null);
    document.querySelectorAll(".table-card[data-game]").forEach(function (card) {
      card.classList.toggle("round-open", open.indexOf(card.getAttribute("data-game")) !== -1);
    });
  }

  function refresh() {
    renderBankroll();
    renderOpenRounds();
  }

  // Play money comes in whole dollars only.
  function wholeAmount(value) {
    var amount = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
    return Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
  }

  function deposit(amount) {
    amount = wholeAmount(amount);
    if (!amount) {
      toast(t("invalidDeposit"), "lose");
      return Promise.resolve(false);
    }
    return account.run(function () {
      var bankroll = readBankroll();
      var next = Math.min(Pit.MAX_BANKROLL, bankroll + amount);
      account.write(Pit.KEYS.bankroll, next);
      renderBankroll();
      flashBalance();
      if (next - bankroll < amount) toast(t("balanceLimit", { amount: money(Pit.MAX_BANKROLL) }), "lose");
      else toast(t("deposited", { amount: money(amount) }), "win");
      return true;
    }).then(function (outcome) {
      if (outcome && outcome.busy) toast(t("accountBusy"), "lose");
      return outcome === true;
    });
  }

  /* ---------------- Cloth & language ---------------- */
  function applyTheme(theme) {
    theme = Pit.normalizeTheme(theme);
    document.body.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", Pit.THEME_COLORS[theme]);
    document.querySelectorAll("[data-set-theme]").forEach(function (button) {
      var on = button.getAttribute("data-set-theme") === theme;
      button.classList.toggle("active", on);
      button.setAttribute("aria-checked", String(on));
      button.tabIndex = on ? 0 : -1;
    });
  }

  function chooseTheme(theme) {
    Pit.writeTheme(local, theme);
    applyTheme(theme);
  }

  function syncLanguageButtons() {
    document.querySelectorAll("[data-lang], [data-set-lang]").forEach(function (button) {
      var on = (button.getAttribute("data-lang") || button.getAttribute("data-set-lang")) === I18n.get();
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", String(on));
    });
  }

  /* ---------------- Toast ---------------- */
  var toastTimer = 0;
  function toast(message, kind) {
    clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.className = "toast" + (kind ? " " + kind : "");
    el.toast.hidden = false;
    global.requestAnimationFrame(function () { el.toast.classList.add("show"); });
    toastTimer = setTimeout(function () {
      el.toast.classList.remove("show");
      toastTimer = setTimeout(function () { el.toast.hidden = true; }, 320);
    }, 2600);
  }

  /* ---------------- Settings dialog ---------------- */
  var dialogReturn = null;

  // What Tab reaches inside a dialog, in order; radio groups keep one stop.
  function focusables(modal) {
    return Array.prototype.slice.call(modal.querySelectorAll("a[href], button, input, [tabindex]"))
      .filter(function (node) { return !node.disabled && node.tabIndex >= 0 && !node.closest("[hidden]"); });
  }

  function openSettings() {
    dialogReturn = document.activeElement;
    el.settings.hidden = false;
    el.settings.querySelector(".modal-head [data-close]").focus();
  }

  function closeSettings() {
    if (el.settings.hidden) return;
    el.settings.hidden = true;
    if (dialogReturn && typeof dialogReturn.focus === "function") dialogReturn.focus();
    dialogReturn = null;
  }

  function radioKeys(container, selector, onPick) {
    container.addEventListener("keydown", function (event) {
      var keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
      if (keys.indexOf(event.key) === -1) return;
      var items = Array.prototype.slice.call(container.querySelectorAll(selector));
      var index = items.indexOf(document.activeElement);
      if (index === -1) return;
      event.preventDefault();
      if (event.key === "Home") index = 0;
      else if (event.key === "End") index = items.length - 1;
      else index = (index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
      items[index].focus();
      onPick(items[index]);
    });
  }

  /* ---------------- Events ---------------- */
  function bindControls() {
    document.querySelectorAll("[data-lang], [data-set-lang]").forEach(function (button) {
      button.addEventListener("click", function () {
        I18n.setLanguage(button.getAttribute("data-lang") || button.getAttribute("data-set-lang"));
      });
    });
    I18n.onChange(function () {
      syncLanguageButtons();
      renderBankroll();
    });

    el.themePicker.addEventListener("click", function (event) {
      var button = event.target.closest("[data-set-theme]");
      if (button) chooseTheme(button.getAttribute("data-set-theme"));
    });
    radioKeys(el.themePicker, "[data-set-theme]", function (button) {
      chooseTheme(button.getAttribute("data-set-theme"));
    });

    el.settingsBtn.addEventListener("click", openSettings);
    el.settings.querySelectorAll("[data-close]").forEach(function (node) {
      node.addEventListener("click", closeSettings);
    });
    el.settings.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSettings();
        return;
      }
      if (event.key !== "Tab") return;
      var items = focusables(el.settings);
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });

    function commitDeposit() {
      deposit(el.depositInput.value).then(function (added) {
        if (added) el.depositInput.value = "";
        el.depositInput.focus();
      });
    }
    el.depositBtn.addEventListener("click", commitDeposit);
    el.depositInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") { event.preventDefault(); commitDeposit(); }
    });
    document.querySelectorAll("[data-deposit]").forEach(function (button) {
      button.addEventListener("click", function () {
        deposit(Number(button.getAttribute("data-deposit")));
      });
    });

    // Tables played in other tabs change the balance and the cloth.
    global.addEventListener("storage", function (event) {
      if (event.key === Pit.KEYS.theme) applyTheme(Pit.readTheme(local));
      if (event.key === null || Pit.isPitKey(event.key)) refresh();
    });
    // Coming back from a table, possibly from the back/forward cache.
    global.addEventListener("pageshow", refresh);
    global.addEventListener("focus", refresh);
  }

  function init() {
    applyTheme(Pit.readTheme(local));
    I18n.apply(document);
    syncLanguageButtons();
    refresh();
    bindControls();
    if (!account.shared) toast(t("temporaryAccount"));
  }

  init();
})();
