/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   ThePit — the lobby
   Shows the shared play-money balance and the tables of the pit, what
   each table has taken and paid back, and holds the settings every page
   shares: the language, the cloth and the save on file.
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
    stats: $("statsModal"),
    restoreFile: $("restoreFile"),
    restoreConfirm: $("restoreConfirm"),
    toast: $("toast")
  };

  // How each table counts its rounds in its statistics.
  var ROUNDS = {
    blackjack: "hands", roulette: "spins", baccarat: "coups", threecard: "hands", slot: "spins", craps: "rolls",
    holdem: "hands", videopoker: "hands", sicbo: "rolls", keno: "games", bigsix: "spins", reddog: "hands", pegboard: "drops"
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

  /* ---------------- Your play ---------------- */
  function count(value) {
    value = Math.floor(Number(value));
    return isFinite(value) && value > 0 ? value : 0;
  }

  // Each table's rounds, what it took and what it paid back, read from its
  // own statistics; and the pit's total.
  function playLines() {
    var lines = Object.keys(Pit.TABLES).map(function (game) {
      var stats = Pit.readJSON(local, Pit.gameKey(game, "stats"), null) || {};
      return { game: game, rounds: count(stats[ROUNDS[game]]), wagered: count(stats.wagered), returned: count(stats.returned) };
    });
    var total = lines.reduce(function (sum, line) {
      return { game: null, rounds: sum.rounds + line.rounds, wagered: sum.wagered + line.wagered, returned: sum.returned + line.returned };
    }, { game: null, rounds: 0, wagered: 0, returned: 0 });
    return { lines: lines, total: total };
  }

  function signedMoney(n) {
    return (n < 0 ? "−" : n > 0 ? "+" : "") + money(Math.abs(n));
  }

  function returnText(line) {
    if (!line.wagered) return "–";
    return (line.returned / line.wagered * 100).toLocaleString(I18n.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
  }

  function playRow(line, header) {
    var tr = document.createElement("tr");
    if (line.game) tr.setAttribute("data-game", line.game);
    var name = document.createElement("th");
    name.scope = "row";
    name.textContent = header;
    tr.appendChild(name);
    var net = line.returned - line.wagered;
    [fmt(line.rounds), money(line.wagered), money(line.returned), signedMoney(net), returnText(line)].forEach(function (text, index) {
      var cell = document.createElement("td");
      cell.textContent = text;
      if (index === 3) cell.className = net > 0 ? "positive" : net < 0 ? "negative" : "";
      tr.appendChild(cell);
    });
    return tr;
  }

  function renderPlay() {
    var play = playLines();
    var rows = $("playRows"), total = $("playTotal");
    rows.textContent = "";
    total.textContent = "";
    play.lines.forEach(function (line) { rows.appendChild(playRow(line, Pit.TABLES[line.game])); });
    total.appendChild(playRow(play.total, t("statsAll")));
  }

  /* ---------------- The save on file ---------------- */
  function downloadBackup() {
    var now = Date.now();
    var save = Pit.exportSave(local, now);
    var blob = new Blob([JSON.stringify(save, null, 1)], { type: "application/json" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "thepit-save-" + new Date(now).toISOString().slice(0, 10) + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    toast(t("backupSaved"), "win");
  }

  // The save chosen from a file, waiting for the player to confirm.
  var pendingSave = null;

  function chooseRestore(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var save = Pit.readSave(reader.result);
      el.restoreFile.value = "";
      if (!save) { toast(t("backupInvalid"), "lose"); return; }
      pendingSave = save;
      var when = save.saved ? new Date(save.saved).toLocaleString(I18n.locale(), { dateStyle: "medium", timeStyle: "short" }) : "?";
      var balance = Pit.normalizeBankroll(save.data[Pit.KEYS.bankroll]);
      $("restoreQuestion").textContent = t("backupQuestion", { date: when, amount: money(balance) });
      el.restoreConfirm.hidden = false;
      $("btnRestore").focus();
    };
    reader.onerror = function () { toast(t("backupInvalid"), "lose"); };
    reader.readAsText(file);
  }

  function cancelRestore() {
    pendingSave = null;
    el.restoreConfirm.hidden = true;
  }

  // The save replaces everything under the account lock, so no table can be
  // in the middle of a round while it does; the page then starts afresh.
  function restore() {
    var save = pendingSave;
    if (!save) return;
    if (!account.shared) { toast(t("backupNeedsLocks"), "lose"); return; }
    account.run(function () {
      Pit.restoreSave(local, save);
      return true;
    }).then(function (outcome) {
      if (outcome && outcome.busy) { toast(t("accountBusy"), "lose"); return; }
      cancelRestore();
      global.location.reload();
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
    cancelRestore();
    if (dialogReturn && typeof dialogReturn.focus === "function") dialogReturn.focus();
    dialogReturn = null;
  }

  function openStats() {
    dialogReturn = document.activeElement;
    renderPlay();
    el.stats.hidden = false;
    el.stats.querySelector(".modal-head [data-close]").focus();
  }

  function closeStats() {
    if (el.stats.hidden) return;
    el.stats.hidden = true;
    if (dialogReturn && typeof dialogReturn.focus === "function") dialogReturn.focus();
    dialogReturn = null;
  }

  // Escape closes a dialog and Tab stays inside it.
  function trapDialog(modal, close) {
    modal.querySelectorAll("[data-close]").forEach(function (node) { node.addEventListener("click", close); });
    modal.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      var items = focusables(modal);
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
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
      if (!el.stats.hidden) renderPlay();
    });

    el.themePicker.addEventListener("click", function (event) {
      var button = event.target.closest("[data-set-theme]");
      if (button) chooseTheme(button.getAttribute("data-set-theme"));
    });
    radioKeys(el.themePicker, "[data-set-theme]", function (button) {
      chooseTheme(button.getAttribute("data-set-theme"));
    });

    el.settingsBtn.addEventListener("click", openSettings);
    trapDialog(el.settings, closeSettings);
    $("statsBtn").addEventListener("click", openStats);
    trapDialog(el.stats, closeStats);

    $("btnBackup").addEventListener("click", downloadBackup);
    el.restoreFile.addEventListener("change", function () { chooseRestore(el.restoreFile.files && el.restoreFile.files[0]); });
    $("btnRestore").addEventListener("click", restore);
    $("btnRestoreCancel").addEventListener("click", cancelRestore);

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
