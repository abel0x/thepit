/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Keno 80 — the machine
   The ticket, the draw and the pays. The ticket, the bet and all
   twenty balls are saved before the first ball is shown, so a reload
   settles the very same game.
   ========================================================= */
(function () {
  "use strict";

  var global = window;
  var Pit = global.Pit;
  var Engine = global.KenoEngine;
  var Store = global.KenoStore;
  var Chips = global.ChipArt;
  var Sound = global.Sound;
  if (!Pit || !Engine || !Store || !Chips || !Sound) {
    throw new Error("Machine modules must load before game.js");
  }

  // The bets a game can take, as the tray shows them.
  var TRAY = Chips.trayValues(document.getElementById("chipTray"));
  var PACE = { fast: 0.5, normal: 1, cinematic: 1.5 };
  var reducedMotion = global.matchMedia ? global.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  var t = function (key, params) { return I18n.t(key, params); };
  function fmt(n) { return Number(n).toLocaleString(I18n.locale()); }
  function money(n) { return "$" + fmt(n); }
  function percent(fraction) {
    return I18n.percent(fraction, 2);
  }
  function $(id) { return document.getElementById(id); }

  function safeStorage(name) {
    try { return global[name]; } catch (e) { return null; }
  }

  /* ---------------- Saved state ---------------- */
  var account = Store.createAccount({
    local: safeStorage("localStorage"),
    session: safeStorage("sessionStorage"),
    locks: navigator.locks
  });

  var state = {
    bankroll: Store.START_BANKROLL,
    stats: Store.normalizeStats(null),
    settings: Store.normalizeSettings(Store.readJSON(safeStorage("localStorage"), Store.KEYS.settings, null)),
    phase: "betting",
    busy: false,
    lastWin: 0,
    // The balls of the last game shown on the board, and the result once paid.
    shown: [],
    result: null,
    banner: { key: "markNumbers", params: null, sub: null, tone: "" }
  };

  function readAccountState() {
    var snap = account.snapshot();
    state.bankroll = snap.bankroll;
    state.stats = snap.stats;
  }

  function saveSettings() {
    Store.writeJSON(safeStorage("localStorage"), Store.KEYS.settings, state.settings);
  }

  /* ---------------- DOM ---------------- */
  var body = document.body;
  var el = {
    bankroll: $("bankroll"),
    balancePill: $("balancePill"),
    banner: $("banner"),
    bannerText: $("bannerText"),
    bannerSub: $("bannerSub"),
    board: $("board"),
    drawnCount: $("drawnCount"),
    caughtCount: $("caughtCount"),
    spotCount: $("spotCount"),
    tableMin: $("tableMin"),
    tableMax: $("tableMax"),
    tableRtp: $("tableRtp"),
    paytableTitle: $("paytableTitle"),
    payRows: $("payRows"),
    paytableHint: $("paytableHint"),
    chipTray: $("chipTray"),
    betAmount: $("betAmount"),
    racesLine: $("racesLine"),
    racesPicker: $("racesPicker"),
    lastWin: $("lastWin"),
    toast: $("toast"),
    settings: $("settingsModal"),
    btn: {
      quick: $("btnQuick"), clear: $("btnClear"), play: $("btnPlay"),
      sound: $("soundToggle"), settings: $("settingsBtn"), resetStats: $("btnResetStats")
    }
  };

  function cellFor(number) { return el.board.children[number - 1]; }

  /* ---------------- Timing ---------------- */
  function pause(ms) {
    var scaled = reducedMotion.matches ? 0 : Math.round(ms * (PACE[state.settings.animationSpeed] || 1));
    return new Promise(function (resolve) { setTimeout(resolve, scaled); });
  }

  /* ---------------- Toast and banner ---------------- */
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

  // The banner remembers its words, not its text, so it follows a language change.
  function setBanner(key, params, sub, tone) {
    state.banner = { key: key, params: params || null, sub: sub || null, tone: tone || "" };
    renderBanner();
  }

  function localize(params) {
    if (!params) return params;
    var out = {};
    Object.keys(params).forEach(function (key) { out[key] = key === "amount" ? money(params[key]) : params[key]; });
    return out;
  }

  function renderBanner() {
    var b = state.banner;
    el.bannerText.textContent = t(b.key, localize(b.params));
    el.bannerText.removeAttribute("data-i18n");
    el.bannerSub.textContent = b.sub ? t(b.sub.key, localize(b.sub.params)) : "";
    el.banner.classList.toggle("flash-win", b.tone === "win");
    el.banner.classList.toggle("flash-lose", b.tone === "lose");
  }

  // What the banner says between games, from the ticket as it stands.
  function idleBanner() {
    var count = picks().length;
    if (!count) setBanner("markNumbers");
    else setBanner(count === 1 ? "readyLineOne" : "readyLine", { count: count, amount: stake() });
  }

  /* ---------------- The ticket ---------------- */
  function picks() { return state.settings.picks; }
  function bet() { return state.settings.bet; }
  function races() { return state.settings.races; }
  // What the next game costs: the bet on every draw it plays.
  function stake() { return bet() * races(); }
  function canPlay() { return state.phase === "betting" && !state.busy; }

  // A new mark wipes the last draw from the board.
  function clearShown() {
    if (!state.shown.length) return;
    state.shown = [];
    state.result = null;
    renderBoard();
  }

  function toggle(number) {
    if (!canPlay() || !Engine.isNumber(number)) return;
    var list = picks().slice();
    var at = list.indexOf(number);
    if (at === -1) {
      if (list.length >= Engine.MAX_SPOTS) { toast(t("tooManyMarks"), "lose"); return; }
      list.push(number);
      list.sort(function (a, b) { return a - b; });
    } else {
      list.splice(at, 1);
    }
    Sound.unlock();
    Sound.chip(1);
    setPicks(list);
  }

  function setPicks(list) {
    state.settings.picks = list;
    saveSettings();
    clearShown();
    renderTicket();
    idleBanner();
  }

  function quickPick() {
    if (!canPlay()) return;
    Sound.unlock();
    Sound.chipStack(2);
    setPicks(Engine.quickPick(picks().length || Engine.MAX_SPOTS));
  }

  function clearTicket() {
    if (!canPlay() || (!picks().length && !state.shown.length)) return;
    Sound.chipsPush();
    setPicks([]);
  }

  function selectChip(value) {
    if (TRAY.indexOf(value) === -1) return;
    if (value !== bet()) {
      state.settings.bet = value;
      saveSettings();
    }
    el.chipTray.querySelectorAll(".chip").forEach(function (chip) {
      var on = Number(chip.getAttribute("data-value")) === value;
      chip.setAttribute("aria-checked", String(on));
      chip.tabIndex = on ? 0 : -1;
    });
    renderTicket();
    if (state.phase === "betting" && !state.shown.length) idleBanner();
  }

  /* ---------------- Rendering ---------------- */
  function buildBoard() {
    el.board.textContent = "";
    for (var n = 1; n <= Engine.NUMBERS; n++) {
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "ball-cell";
      cell.setAttribute("data-number", String(n));
      cell.textContent = String(n);
      el.board.appendChild(cell);
    }
  }

  // Marks, drawn balls and catches on the board.
  function renderBoard() {
    var marked = picks();
    var drawn = state.shown;
    for (var n = 1; n <= Engine.NUMBERS; n++) {
      var cell = cellFor(n);
      var isMarked = marked.indexOf(n) !== -1;
      var isDrawn = drawn.indexOf(n) !== -1;
      cell.classList.toggle("marked", isMarked);
      cell.classList.toggle("drawn", isDrawn && !isMarked);
      cell.classList.toggle("caught", isDrawn && isMarked);
      cell.setAttribute("aria-pressed", String(isMarked));
      var key = isMarked && isDrawn ? "numberCaught" : isMarked ? "numberMarked" : isDrawn ? "numberDrawn" : "numberLabel";
      cell.setAttribute("aria-label", t(key, { number: n }));
    }
    var caught = drawn.filter(function (ball) { return marked.indexOf(ball) !== -1; }).length;
    el.drawnCount.textContent = String(drawn.length);
    el.caughtCount.textContent = String(caught);
    el.spotCount.textContent = String(marked.length);
    renderPayTable(caught);
  }

  // The pay table for the number of marks, in dollars for the bet chosen;
  // `caught` lights its row while a game is shown.
  function renderPayTable(caught) {
    var spots = picks().length;
    el.payRows.textContent = "";
    el.paytableHint.hidden = spots > 0;
    body.toggleAttribute("data-empty-ticket", !spots);
    if (!spots) {
      el.paytableTitle.textContent = t("paysColumn");
      el.tableRtp.textContent = "—";
      return;
    }
    el.paytableTitle.textContent = spots === 1 ? t("paytableTitleOne") : t("paytableTitle", { count: spots });
    el.tableRtp.textContent = percent(Engine.returnFor(spots));
    for (var hits = spots; hits >= 0; hits--) {
      var times = Engine.payFor(spots, hits);
      if (!times) continue;
      var row = document.createElement("tr");
      row.setAttribute("data-hits", String(hits));
      if (state.shown.length === Engine.DRAWN && hits === caught) row.className = "won";
      var catchCell = document.createElement("th");
      catchCell.scope = "row";
      catchCell.textContent = String(hits);
      var payCell = document.createElement("td");
      var dollars = document.createElement("b");
      dollars.textContent = money(times * bet());
      var ratio = document.createElement("small");
      ratio.textContent = t("payFor", { n: fmt(times) });
      payCell.appendChild(dollars);
      payCell.appendChild(ratio);
      row.appendChild(catchCell);
      row.appendChild(payCell);
      el.payRows.appendChild(row);
    }
  }

  function renderTicket() {
    el.betAmount.textContent = fmt(stake());
    el.racesLine.textContent = races() > 1 ? t("racesLine", { bet: money(bet()), races: races() }) : "";
    el.racesPicker.querySelectorAll("[data-races]").forEach(function (button) {
      var on = Number(button.getAttribute("data-races")) === races();
      button.classList.toggle("active", on);
      button.setAttribute("aria-checked", String(on));
      button.tabIndex = on ? 0 : -1;
    });
    renderBoard();
    renderBankroll();
    updateControls();
  }

  // Every count of marks, its exact return and its top pay, in the settings.
  function renderReturns() {
    var rows = $("returnRows");
    rows.textContent = "";
    for (var spots = Engine.MIN_SPOTS; spots <= Engine.MAX_SPOTS; spots++) {
      var row = document.createElement("tr");
      [String(spots), percent(Engine.returnFor(spots)), t("payFor", { n: fmt(Engine.payFor(spots, spots)) })].forEach(function (text, index) {
        var cell = document.createElement(index ? "td" : "th");
        if (!index) cell.scope = "row";
        cell.textContent = text;
        row.appendChild(cell);
      });
      rows.appendChild(row);
    }
  }

  function renderBankroll() {
    el.bankroll.textContent = fmt(state.bankroll);
    el.lastWin.textContent = fmt(state.lastWin);
  }

  function flashBalance() {
    el.balancePill.classList.remove("win-flash");
    void el.balancePill.offsetWidth;
    el.balancePill.classList.add("win-flash");
  }

  function renderLimits() {
    el.tableMin.textContent = money(TRAY[0]);
    el.tableMax.textContent = money(TRAY[TRAY.length - 1]);
  }

  function renderStats() {
    var s = state.stats;
    var net = s.returned - s.wagered;
    $("stGames").textContent = fmt(s.games);
    $("stWinRate").textContent = I18n.percent(s.games ? s.winningGames / s.games : 0);
    $("stBestCatch").textContent = fmt(s.bestCatch);
    $("stWagered").textContent = money(s.wagered);
    $("stReturned").textContent = money(s.returned);
    var netNode = $("stNet");
    netNode.textContent = (net < 0 ? "−" : "") + money(Math.abs(net));
    netNode.classList.toggle("positive", net > 0);
    netNode.classList.toggle("negative", net < 0);
    $("stBiggest").textContent = money(s.biggestWin);
  }

  function updateControls() {
    var ready = canPlay();
    var marked = picks().length > 0;
    el.btn.quick.disabled = !ready;
    el.btn.clear.disabled = !ready || (!marked && !state.shown.length);
    el.btn.play.disabled = !ready || !marked;
    el.btn.play.classList.toggle("ready", ready && marked);
    el.chipTray.querySelectorAll(".chip").forEach(function (chip) {
      chip.disabled = !ready;
      chip.classList.toggle("unaffordable", Number(chip.getAttribute("data-value")) * races() > state.bankroll);
    });
    el.racesPicker.querySelectorAll("[data-races]").forEach(function (button) { button.disabled = !ready; });
    el.board.querySelectorAll(".ball-cell").forEach(function (cell) { cell.disabled = !ready; });
    $("depositAmount").disabled = !ready;
    document.querySelectorAll("[data-deposit], #btnDeposit, #btnResetStats").forEach(function (node) { node.disabled = !ready; });
    body.setAttribute("data-busy", String(state.busy || state.phase !== "betting"));
  }

  function setPhase(phase) {
    state.phase = phase;
    body.setAttribute("data-phase", phase);
    updateControls();
  }

  /* ---------------- A game ---------------- */
  // Credits the account with every draw of the ticket, records each one as
  // a game and closes the round.
  function commitGame(played) {
    var bankroll = Store.normalizeBankroll(account.read("bankroll", state.bankroll));
    bankroll = Math.min(Store.MAX_BANKROLL, bankroll + played.returned);
    var stats = played.games.reduce(function (next, result) { return Store.recordGame(next, result); }, account.read("stats", state.stats));
    account.write("bankroll", bankroll);
    account.write("stats", stats);
    account.remove("round");
    state.bankroll = bankroll;
    state.stats = stats;
    state.lastWin = played.returned;
    renderStats();
  }

  function resultText(played) {
    if (played.games.length > 1) {
      return t("racesResult", { races: played.games.length }) + ". " + (played.returned ? t("winLine", { amount: money(played.returned) }) : t("noWin"));
    }
    var result = played.games[0];
    var caught = t("caughtLine", { hits: result.hits, spots: result.spots });
    return caught + ". " + (result.returned ? t("winLine", { amount: money(result.returned) }) : t("noWin"));
  }

  function showResultBanner(result) {
    setBanner("caughtLine", { hits: result.hits, spots: result.spots },
      result.returned ? { key: "winLine", params: { amount: result.returned } } : { key: "noWin" },
      result.net > 0 ? "win" : result.returned ? "" : "lose");
  }

  // A game left unfinished by a reload, a crash or a closed tab is settled
  // with the very balls it drew, and the board shows them. A game that cannot
  // be trusted is voided and its stake returned.
  function recoverRound() {
    var raw = account.read("round", null);
    if (raw == null) return null;
    var round = Store.normalizeRound(raw);
    if (!round) {
      var bankroll = Store.normalizeBankroll(account.read("bankroll", Store.START_BANKROLL));
      var refund = raw && Engine.isBet(raw.bet) ? raw.bet * (Array.isArray(raw.races) && Engine.isRaces(raw.races.length) ? raw.races.length : 1) : 0;
      state.bankroll = Math.min(Store.MAX_BANKROLL, bankroll + refund);
      account.write("bankroll", state.bankroll);
      account.remove("round");
      toast(t("roundVoided"), "lose");
      return { voided: true };
    }
    var played = Engine.settleRaces(round.picks, round.races, round.bet);
    commitGame(played);
    state.settings.picks = round.picks.slice().sort(function (a, b) { return a - b; });
    state.settings.bet = round.bet;
    state.settings.races = round.races.length;
    saveSettings();
    state.shown = round.races[round.races.length - 1].slice();
    state.result = played.games[played.games.length - 1];
    toast(t("roundRestored", { result: resultText(played) }), played.returned ? "win" : "");
    return { result: played };
  }

  function play() {
    if (!canPlay()) return;
    var ticket = picks().slice();
    var cost = stake();
    var count = races();
    if (!Engine.isPicks(ticket)) { toast(t("markFirst"), "lose"); return; }
    Sound.unlock();
    state.busy = true;
    updateControls();
    account.run(function () {
      recoverRound();
      var elsewhere = account.roundsElsewhere();
      if (elsewhere.length) return { elsewhere: elsewhere[0] };
      var bankroll = Store.normalizeBankroll(account.read("bankroll", Store.START_BANKROLL));
      if (cost > bankroll) {
        state.bankroll = bankroll;
        return { insufficient: true };
      }
      var draws = [];
      for (var i = 0; i < count; i++) draws.push(Engine.draw());
      var round = { id: Store.newRoundId(), picks: ticket, bet: bet(), races: draws, at: Date.now() };
      // The ticket, the bet and every ball of every draw are saved before
      // the first ball is shown, so a reload can neither draw again nor
      // refund a loss.
      account.write("round", Store.roundSnapshot(round));
      account.write("bankroll", bankroll - cost);
      state.bankroll = bankroll - cost;
      return playGame(round);
    }, 900).then(function (outcome) {
      state.busy = false;
      if (outcome && outcome.busy) toast(t("accountBusy"), "lose");
      if (outcome && outcome.insufficient) toast(t("insufficientFunds"), "lose");
      if (outcome && outcome.elsewhere) toast(t("roundElsewhere", { table: Pit.TABLES[outcome.elsewhere] }), "lose");
      if (state.phase !== "betting") setPhase("betting");
      renderBankroll();
      updateControls();
    }, function (error) {
      state.busy = false;
      setPhase("betting");
      toast(String(error && error.message || error), "lose");
    });
  }

  // The twenty balls of each draw come out one by one; a caught mark rings.
  // With several draws, each is shown and paid in turn, and the lot is
  // credited together at the end.
  async function playGame(round) {
    setPhase("drawing");
    var played = Engine.settleRaces(round.picks, round.races, round.bet);
    var multi = round.races.length > 1;
    var won = 0;
    for (var race = 0; race < round.races.length; race++) {
      var balls = round.races[race];
      state.shown = [];
      state.result = null;
      renderBoard();
      renderBankroll();
      setBanner(multi ? "raceDrawing" : "drawing", multi ? { n: race + 1, races: round.races.length } : null);
      for (var i = 0; i < balls.length; i++) {
        var ball = balls[i];
        state.shown.push(ball);
        renderBoard();
        if (!reducedMotion.matches) {
          var cell = cellFor(ball);
          cell.classList.remove("pop");
          void cell.offsetWidth;
          cell.classList.add("pop");
        }
        if (round.picks.indexOf(ball) !== -1) Sound.flip();
        else Sound.card();
        await pause(multi ? 60 : 120);
      }
      state.result = played.games[race];
      renderBoard();
      if (multi) {
        won += state.result.returned;
        setBanner("raceResult", { n: race + 1, races: round.races.length, hits: state.result.hits, spots: state.result.spots },
          { key: "racesWon", params: { amount: won } }, state.result.returned ? "win" : "");
        if (state.result.returned) Sound.payout();
        await pause(race === round.races.length - 1 ? 300 : 700);
      }
    }
    commitGame(played);
    renderBoard();
    if (multi) {
      setBanner("racesResult", { races: round.races.length },
        played.returned ? { key: "winLine", params: { amount: played.returned } } : { key: "noWin" },
        played.net > 0 ? "win" : played.returned ? "" : "lose");
    } else {
      showResultBanner(played.games[0]);
    }
    if (played.returned) {
      Sound.payout();
      if (played.net > 0) Sound.win();
      flashBalance();
    } else {
      Sound.lose();
    }
    renderBankroll();
    await pause(300);
    setPhase("betting");
    restakeIfBroke();
  }

  function restakeIfBroke() {
    if (state.bankroll >= TRAY[0]) return;
    account.run(function () {
      var bankroll = Store.normalizeBankroll(account.read("bankroll", 0));
      if (bankroll >= TRAY[0] || account.read("round", null) != null) return;
      account.write("bankroll", Store.START_BANKROLL);
      state.bankroll = Store.START_BANKROLL;
      renderBankroll();
      updateControls();
      toast(I18n.pick("restake", { amount: money(Store.START_BANKROLL) }));
    });
  }

  /* ---------------- Settings ---------------- */
  var soundEnabled = Store.readJSON(safeStorage("localStorage"), Store.KEYS.sound, true) !== false;

  function applySoundUI() {
    var label = soundEnabled ? t("muteSound") : t("unmuteSound");
    el.btn.sound.setAttribute("aria-pressed", String(soundEnabled));
    el.btn.sound.setAttribute("aria-label", label);
    el.btn.sound.title = label;
    el.btn.sound.setAttribute("data-i18n-title", soundEnabled ? "muteSound" : "unmuteSound");
    el.btn.sound.setAttribute("data-i18n-aria-label", soundEnabled ? "muteSound" : "unmuteSound");
    $("setSound").checked = soundEnabled;
    $("soundMixer").classList.toggle("muted", !soundEnabled);
    var volumes = Sound.getVolumes();
    document.querySelectorAll("[data-sound-level]").forEach(function (slider) {
      var value = Math.round(volumes[slider.getAttribute("data-sound-level")] * 100);
      slider.value = String(value);
      slider.style.setProperty("--fill", value + "%");
      slider.setAttribute("aria-valuetext", I18n.percent(value / 100));
      var out = $(slider.id + "Value");
      if (out) out.textContent = I18n.percent(value / 100);
    });
  }

  function setSound(on) {
    soundEnabled = !!on;
    Sound.setEnabled(soundEnabled);
    Store.writeJSON(safeStorage("localStorage"), Store.KEYS.sound, soundEnabled);
    if (soundEnabled) Sound.unlock();
    applySoundUI();
  }

  function applyTheme(theme) {
    theme = Pit.normalizeTheme(theme);
    body.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", Pit.THEME_COLORS[theme]);
    document.querySelectorAll("[data-set-theme]").forEach(function (button) {
      var on = button.getAttribute("data-set-theme") === theme;
      button.classList.toggle("active", on);
      button.setAttribute("aria-checked", String(on));
      button.tabIndex = on ? 0 : -1;
    });
  }

  function applyAnimationSpeed() {
    body.setAttribute("data-animation-speed", state.settings.animationSpeed);
    document.querySelectorAll("[data-set-animation]").forEach(function (button) {
      var on = button.getAttribute("data-set-animation") === state.settings.animationSpeed;
      button.classList.toggle("active", on);
      button.setAttribute("aria-checked", String(on));
      button.tabIndex = on ? 0 : -1;
    });
  }

  function applyLanguageUI() {
    document.querySelectorAll("[data-lang], [data-set-lang]").forEach(function (button) {
      var on = (button.getAttribute("data-lang") || button.getAttribute("data-set-lang")) === I18n.get();
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", String(on));
    });
  }

  function deposit(amount) {
    amount = Number(amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) { toast(t("invalidDeposit"), "lose"); return; }
    if (!canPlay()) return;
    account.run(function () {
      var bankroll = Store.normalizeBankroll(account.read("bankroll", state.bankroll));
      var next = Math.min(Store.MAX_BANKROLL, bankroll + amount);
      account.write("bankroll", next);
      state.bankroll = next;
      renderBankroll();
      updateControls();
      flashBalance();
      Sound.chipStack(3);
      if (next - bankroll < amount) toast(t("balanceLimit", { amount: money(Store.MAX_BANKROLL) }), "lose");
      else toast(t("deposited", { amount: money(amount) }), "win");
    }).then(function (result) {
      if (result && result.busy) toast(t("accountBusy"), "lose");
    });
  }

  function resetStats() {
    if (!canPlay()) return;
    account.run(function () {
      state.stats = Store.normalizeStats(null);
      account.write("stats", state.stats);
      renderStats();
    });
  }

  /* ---------------- Dialogs ---------------- */
  var dialogReturn = null;

  function focusables(modal) {
    return Array.prototype.slice.call(modal.querySelectorAll("a[href], button, input, summary, [tabindex]"))
      .filter(function (node) { return !node.disabled && node.tabIndex >= 0 && !node.closest("[hidden]"); });
  }

  function openSettings() {
    dialogReturn = document.activeElement;
    renderStats();
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
      var items = Array.prototype.slice.call(container.querySelectorAll(selector)).filter(function (b) { return !b.disabled; });
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
    el.chipTray.addEventListener("click", function (event) {
      var chip = event.target.closest(".chip");
      if (!chip || chip.disabled) return;
      Sound.unlock();
      selectChip(Number(chip.getAttribute("data-value")));
      Sound.chip(0);
    });
    radioKeys(el.chipTray, ".chip", function (chip) { selectChip(Number(chip.getAttribute("data-value"))); });
    el.racesPicker.addEventListener("click", function (event) {
      var button = event.target.closest("[data-races]");
      if (!button || button.disabled || !canPlay()) return;
      state.settings.races = Number(button.getAttribute("data-races"));
      saveSettings();
      Sound.chip(0);
      renderTicket();
      if (!state.shown.length) idleBanner();
    });
    radioKeys(el.racesPicker, "[data-races]", function (button) { button.click(); });

    el.board.addEventListener("click", function (event) {
      var cell = event.target.closest(".ball-cell");
      if (cell) toggle(Number(cell.getAttribute("data-number")));
    });

    el.btn.quick.addEventListener("click", quickPick);
    el.btn.clear.addEventListener("click", clearTicket);
    el.btn.play.addEventListener("click", play);
    el.btn.sound.addEventListener("click", function () { setSound(!soundEnabled); });
    $("setSound").addEventListener("change", function (event) { setSound(event.target.checked); });
    document.querySelectorAll("[data-sound-level]").forEach(function (slider) {
      slider.addEventListener("input", function () {
        Sound.setVolume(slider.getAttribute("data-sound-level"), Number(slider.value) / 100);
        Store.writeJSON(safeStorage("localStorage"), Store.KEYS.audio, Sound.getVolumes());
        applySoundUI();
      });
    });

    el.btn.settings.addEventListener("click", openSettings);
    el.settings.querySelectorAll("[data-close]").forEach(function (node) { node.addEventListener("click", closeSettings); });
    el.settings.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { event.preventDefault(); closeSettings(); return; }
      if (event.key !== "Tab") return;
      var items = focusables(el.settings);
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });

    document.querySelectorAll("[data-lang], [data-set-lang]").forEach(function (button) {
      button.addEventListener("click", function () {
        I18n.setLanguage(button.getAttribute("data-lang") || button.getAttribute("data-set-lang"));
      });
    });
    I18n.onChange(translateAll);

    var themePicker = document.querySelector(".theme-picker");
    themePicker.addEventListener("click", function (event) {
      var button = event.target.closest("[data-set-theme]");
      if (!button) return;
      Pit.writeTheme(safeStorage("localStorage"), button.getAttribute("data-set-theme"));
      applyTheme(button.getAttribute("data-set-theme"));
    });
    radioKeys(themePicker, "[data-set-theme]", function (button) { button.click(); });

    var speedPicker = document.querySelector(".animation-seg");
    speedPicker.addEventListener("click", function (event) {
      var button = event.target.closest("[data-set-animation]");
      if (!button) return;
      state.settings.animationSpeed = button.getAttribute("data-set-animation");
      saveSettings();
      applyAnimationSpeed();
    });
    radioKeys(speedPicker, "[data-set-animation]", function (button) { button.click(); });

    var depositInput = $("depositAmount");
    $("btnDeposit").addEventListener("click", function () {
      deposit(depositInput.value);
      depositInput.value = "";
    });
    depositInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") { event.preventDefault(); deposit(depositInput.value); depositInput.value = ""; }
    });
    document.querySelectorAll("[data-deposit]").forEach(function (button) {
      button.addEventListener("click", function () { deposit(Number(button.getAttribute("data-deposit"))); });
    });
    el.btn.resetStats.addEventListener("click", resetStats);

    document.addEventListener("keydown", onGlobalKey);
    global.addEventListener("pointerdown", function unlock() {
      Sound.unlock();
      global.removeEventListener("pointerdown", unlock);
    });
    global.addEventListener("storage", function (event) {
      if (event.key === Pit.KEYS.theme) applyTheme(Pit.readTheme(safeStorage("localStorage")));
      if (Pit.isPitKey(event.key) && state.phase === "betting" && !state.busy && !account.isHeld()) {
        readAccountState();
        renderBankroll();
        renderStats();
        updateControls();
      }
    });
  }

  function onGlobalKey(event) {
    if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey || event.repeat || event.isComposing) return;
    if (!el.settings.hidden) return;
    var target = event.target;
    var typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    if (typing) return;
    var onControl = target && target.closest && target.closest("button, a, summary, [role='button']");
    var key = event.key;
    if ((key === " " || key === "Enter") && !onControl) { event.preventDefault(); play(); return; }
    var lower = key.length === 1 ? key.toLowerCase() : key;
    if (lower >= "1" && lower <= "6") { if (canPlay()) selectChip(TRAY[Number(lower) - 1]); return; }
    switch (lower) {
      case "q": quickPick(); break;
      case "c": clearTicket(); break;
      case "d": cycleRaces(); break;
      case "m": setSound(!soundEnabled); break;
    }
  }

  // D steps through the counts of draws: 1, 5, 10, 20 and round again.
  function cycleRaces() {
    if (!canPlay()) return;
    var next = Engine.RACES[(Engine.RACES.indexOf(races()) + 1) % Engine.RACES.length];
    el.racesPicker.querySelector('[data-races="' + next + '"]').click();
  }

  /* ---------------- Start ---------------- */
  function translateAll() {
    I18n.apply(document);
    applyLanguageUI();
    applySoundUI();
    renderLimits();
    renderReturns();
    renderBanner();
    renderTicket();
    renderStats();
  }

  function init() {
    readAccountState();
    applyTheme(Pit.readTheme(safeStorage("localStorage")));
    applyAnimationSpeed();
    var volumes = Store.readJSON(safeStorage("localStorage"), Store.KEYS.audio, null);
    if (volumes) Sound.setVolumes(volumes);
    Sound.setEnabled(soundEnabled);
    Chips.decorateTray(el.chipTray);
    buildBoard();
    selectChip(bet());
    idleBanner();
    translateAll();
    bindControls();
    if (!account.shared) toast(t("temporaryAccount"));
    updateControls();

    // A game left unfinished by a reload, crash or closed tab is settled now.
    if (account.read("round", null) != null) {
      state.busy = true;
      updateControls();
      account.run(recoverRound, 2500).then(function (outcome) {
        state.busy = false;
        if (outcome && outcome.busy) toast(t("accountBusy"), "lose");
        if (outcome && outcome.result) showResultBanner(outcome.result);
        selectChip(bet());
        renderTicket();
        restakeIfBroke();
      }, function () { state.busy = false; updateControls(); });
    } else {
      restakeIfBroke();
    }
  }

  init();
})();
