/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Slot 5 — the machine
   The bet, the spin, the reels, the wins and the free spins. Every
   paid spin is drawn and saved, with its stake already taken and any
   free spins it brings, before the reels start, so a reload settles
   the very same spin instead of a new one.
   ========================================================= */
(function () {
  "use strict";

  var global = window;
  var Pit = global.Pit;
  var Engine = global.SlotEngine;
  var Store = global.SlotStore;
  var Chips = global.ChipArt;
  var Sound = global.Sound;
  if (!Pit || !Engine || !Store || !Chips || !Sound) {
    throw new Error("Machine modules must load before game.js");
  }

  // The bets a line can take, as the tray shows them.
  var TRAY = Chips.trayValues(document.getElementById("chipTray"));
  var MIN_SPIN = Engine.totalBet(TRAY[0]);
  var PACE = { fast: 0.55, normal: 1, cinematic: 1.45 };
  var SYMBOL_WORDS = {
    wild: "symWild", star: "symStar", seven: "symSeven", diamond: "symDiamond", bell: "symBell",
    horseshoe: "symHorseshoe", ace: "symAce", king: "symKing", queen: "symQueen", jack: "symJack"
  };
  // The fruit set dresses the four card letters as fruits. Only the faces
  // change: every symbol keeps its place on the strips and its pays, and the
  // seven stays the top symbol of the reels.
  var FRUITS = { ace: "watermelon", king: "grapes", queen: "lemon", jack: "cherry" };
  var FRUIT_WORDS = { watermelon: "symWatermelon", grapes: "symGrapes", lemon: "symLemon", cherry: "symCherry" };
  // The colour each line is drawn in when it wins.
  var LINE_COLORS = ["#f4d77a", "#6fb7ff", "#ff7a70", "#7be0a4", "#d49cff"];
  var reducedMotion = global.matchMedia ? global.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  var t = function (key, params) { return I18n.t(key, params); };
  function fmt(n) { return Number(n).toLocaleString(I18n.locale()); }
  function money(n) { return "$" + fmt(n); }
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
    // What the reels show: the stops of the last spin.
    stops: [0, 0, 0, 0, 0],
    banner: { key: "placeBet", params: null, sub: null, tone: "" },
    // The lines of the result on show, kept in words' terms for a language change.
    wins: [],
    feature: null
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
    tableMin: $("tableMin"),
    tableMax: $("tableMax"),
    tableRtp: $("tableRtp"),
    reels: $("reels"),
    strips: Array.prototype.slice.call(document.querySelectorAll(".reel-strip")),
    paylines: $("paylines"),
    featureBar: $("featureBar"),
    winList: $("winList"),
    chipTray: $("chipTray"),
    betStack: $("betStack"),
    totalBet: $("totalBet"),
    perLine: $("perLine"),
    winMeter: $("winMeter"),
    lastWin: $("lastWin"),
    toast: $("toast"),
    settings: $("settingsModal"),
    autoModal: $("autoModal"),
    autoLabel: $("autoLabel"),
    btn: {
      spin: $("btnSpin"), auto: $("btnAuto"), autoStart: $("btnAutoStart"),
      sound: $("soundToggle"), settings: $("settingsBtn"), resetStats: $("btnResetStats")
    }
  };

  /* ---------------- Timing ---------------- */
  // A pause, scaled by the chosen pace; nothing waits with reduced motion.
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

  // Parameters named amount are dollars, drawn in the language shown.
  function localize(params) {
    if (!params) return params;
    var out = {};
    Object.keys(params).forEach(function (key) {
      out[key] = key === "amount" ? money(params[key]) : key === "symbol" ? symbolName(params[key]) : params[key];
    });
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

  /* ---------------- The bet ---------------- */
  function lineBet() { return state.settings.lineBet; }
  function stake() { return Engine.totalBet(lineBet()); }
  function canSpin() { return state.phase === "betting" && !state.busy; }

  function selectChip(value) {
    if (TRAY.indexOf(value) === -1) return;
    state.settings.lineBet = value;
    saveSettings();
    el.chipTray.querySelectorAll(".chip").forEach(function (chip) {
      var on = Number(chip.getAttribute("data-value")) === value;
      chip.setAttribute("aria-checked", String(on));
      chip.tabIndex = on ? 0 : -1;
    });
    renderBet();
    updateControls();
  }

  /* ---------------- Rendering ---------------- */
  function renderBankroll() {
    el.bankroll.textContent = fmt(Math.max(0, state.bankroll));
    el.lastWin.textContent = fmt(state.lastWin);
  }

  function flashBalance() {
    el.balancePill.classList.remove("win-flash");
    void el.balancePill.offsetWidth;
    el.balancePill.classList.add("win-flash");
  }

  // The total bet as a stack of the pit's chips on the bet plate.
  function renderBet() {
    el.totalBet.textContent = fmt(stake());
    el.perLine.textContent = t("perLine", { amount: money(lineBet()) });
    el.betStack.textContent = "";
    el.betStack.appendChild(Chips.stack(document, stake(), "bet-chip"));
    body.setAttribute("data-wager", String(stake()));
  }

  function renderLimits() {
    el.tableMin.textContent = money(MIN_SPIN);
    el.tableMax.textContent = money(Engine.totalBet(TRAY[TRAY.length - 1]));
    el.tableRtp.textContent = (Engine.returnToPlayer().total * 100).toLocaleString(I18n.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
  }

  // The face a symbol shows in the chosen set, and its name.
  function faceOf(symbol) {
    return state.settings.symbolSet === "fruit" && FRUITS[symbol] ? FRUITS[symbol] : symbol;
  }

  function symbolName(symbol) {
    var face = faceOf(symbol);
    return t(face === symbol ? SYMBOL_WORDS[symbol] : FRUIT_WORDS[face]);
  }

  function symbolCell(symbol) {
    var cell = document.createElement("span");
    cell.className = "cell sym-" + symbol;
    cell.setAttribute("data-symbol", symbol);
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#sym-" + faceOf(symbol));
    svg.appendChild(use);
    cell.appendChild(svg);
    return cell;
  }

  // Lays the three symbols of each reel in its window, at rest.
  function showStops(stops) {
    var grid = Engine.windowAt(stops);
    el.strips.forEach(function (strip, reel) {
      strip.textContent = "";
      strip.style.transition = "none";
      strip.style.transform = "translateY(0)";
      grid[reel].forEach(function (symbol) { strip.appendChild(symbolCell(symbol)); });
    });
    labelReels(grid);
  }

  function labelReels(grid) {
    var columns = grid.map(function (column, reel) {
      return t("reelColumn", { reel: reel + 1, symbols: column.map(symbolName).join(", ") });
    });
    el.reels.setAttribute("aria-label", t("reelsLabel", { symbols: columns.join("; ") }));
  }

  function clearWins() {
    el.paylines.textContent = "";
    el.reels.querySelectorAll(".cell.win").forEach(function (cell) { cell.classList.remove("win"); });
    el.reels.classList.remove("has-win");
    state.wins = [];
    renderWinList();
  }

  function cellAt(reel, row) {
    return el.strips[reel].children[row];
  }

  // Marks every winning cell and draws each winning line across the reels.
  function showWins(result) {
    clearWins();
    result.lines.forEach(function (won, index) {
      won.cells.forEach(function (cell) { cellAt(cell[0], cell[1]).classList.add("win"); });
      var line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      line.setAttribute("points", Engine.LINES[won.line].map(function (row, reel) { return (reel + 0.5) + "," + (row + 0.5); }).join(" "));
      line.setAttribute("stroke", LINE_COLORS[index % LINE_COLORS.length]);
      line.setAttribute("vector-effect", "non-scaling-stroke");
      el.paylines.appendChild(line);
      state.wins.push({ key: "lineWinItem", params: { line: won.line + 1, count: won.count, symbol: won.symbol, amount: won.win } });
    });
    if (result.scatter.win) {
      result.scatter.cells.forEach(function (cell) { cellAt(cell[0], cell[1]).classList.add("win"); });
      state.wins.push({ key: "scatterWinItem", params: { count: result.scatter.count, amount: result.scatter.win } });
    }
    el.reels.classList.toggle("has-win", result.win > 0);
    renderWinList();
  }

  function renderWinList() {
    el.winList.textContent = "";
    state.wins.forEach(function (item) {
      var li = document.createElement("li");
      li.textContent = t(item.key, localize(item.params));
      el.winList.appendChild(li);
    });
  }

  function renderFeature() {
    var f = state.feature;
    el.featureBar.hidden = !f;
    body.toggleAttribute("data-feature", !!f);
    if (!f) return;
    el.featureBar.textContent = t("freeSpinLine", { n: f.n, total: f.total, multiplier: Engine.FREE_MULTIPLIER }) +
      " · " + t("featureWon", { amount: money(f.won) });
  }

  function renderStats() {
    var s = state.stats;
    var net = s.returned - s.wagered;
    $("stSpins").textContent = fmt(s.spins);
    $("stWinRate").textContent = s.spins ? Math.round(s.winningSpins / s.spins * 100) + "%" : "0%";
    $("stFeatures").textContent = fmt(s.features);
    $("stFreeSpins").textContent = fmt(s.freeSpinsWon);
    $("stWagered").textContent = money(s.wagered);
    $("stReturned").textContent = money(s.returned);
    var netNode = $("stNet");
    netNode.textContent = (net < 0 ? "−" : "") + money(Math.abs(net));
    netNode.classList.toggle("positive", net > 0);
    netNode.classList.toggle("negative", net < 0);
    $("stBiggest").textContent = money(s.biggestWin);
  }

  // The pays table in the settings, in dollars for the bet chosen now.
  function renderPays() {
    document.querySelectorAll("#paysTable tr[data-symbol]").forEach(function (row) {
      var symbol = row.getAttribute("data-symbol");
      row.querySelectorAll("td[data-pay]").forEach(function (cell) {
        var count = Number(cell.getAttribute("data-pay"));
        var amount = symbol === Engine.SCATTER ? Engine.SCATTER_PAYS[count] * stake() : Engine.PAYS[symbol][count] * lineBet();
        cell.textContent = money(amount);
      });
    });
  }

  // Twenty small maps, one for each line.
  function renderLineMaps() {
    var holder = $("lineMaps");
    holder.textContent = "";
    Engine.LINES.forEach(function (rows, index) {
      var map = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      map.setAttribute("viewBox", "0 0 5 3");
      map.setAttribute("class", "line-map");
      for (var reel = 0; reel < Engine.REELS; reel++) {
        for (var row = 0; row < Engine.ROWS; row++) {
          var dot = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          dot.setAttribute("x", reel + 0.12);
          dot.setAttribute("y", row + 0.12);
          dot.setAttribute("width", 0.76);
          dot.setAttribute("height", 0.76);
          dot.setAttribute("rx", 0.12);
          if (rows[reel] === row) dot.setAttribute("class", "on");
          map.appendChild(dot);
        }
      }
      var label = document.createElement("span");
      label.className = "line-map-item";
      label.appendChild(map);
      var number = document.createElement("b");
      number.textContent = String(index + 1);
      label.appendChild(number);
      holder.appendChild(label);
    });
  }

  function updateControls() {
    var ready = canSpin() && !auto;
    el.btn.spin.disabled = !ready;
    // While autoplay runs, its button stops it; otherwise it opens its dialog.
    el.btn.auto.disabled = !auto && !ready;
    el.btn.auto.setAttribute("aria-pressed", String(!!auto));
    el.autoLabel.textContent = auto ? t("autoStop", { left: auto.left }) : t("autoplay");
    el.autoLabel.setAttribute("data-i18n", auto ? "autoStop" : "autoplay");
    el.btn.spin.classList.toggle("ready", ready && state.bankroll >= stake());
    el.chipTray.querySelectorAll(".chip").forEach(function (chip) {
      chip.disabled = !ready;
      chip.classList.toggle("unaffordable", Engine.totalBet(Number(chip.getAttribute("data-value"))) > state.bankroll);
    });
    $("depositAmount").disabled = !ready;
    document.querySelectorAll("[data-deposit], #btnDeposit, #btnResetStats").forEach(function (node) { node.disabled = !ready; });
    body.setAttribute("data-busy", String(state.busy || state.phase !== "betting"));
  }

  function setPhase(phase) {
    state.phase = phase;
    body.setAttribute("data-phase", phase);
    updateControls();
  }

  /* ---------------- The reels ---------------- */
  function cellHeight() {
    var reel = el.strips[0].parentNode;
    return reel.getBoundingClientRect().height / Engine.ROWS;
  }

  // Turns the reels from the stops on show to the new ones. Each reel runs a
  // strip of random symbols past the window and lands on its stop, one reel
  // after another, the way the reels of a machine stop.
  function spinReels(stops, quick) {
    var from = Engine.windowAt(state.stops);
    var to = Engine.windowAt(stops);
    state.stops = stops;
    if (reducedMotion.matches) {
      showStops(stops);
      return Promise.resolve();
    }
    var height = cellHeight();
    var pace = PACE[state.settings.animationSpeed] || 1;
    return Promise.all(el.strips.map(function (strip, reel) {
      var filler = (quick ? 6 : 10) + reel * (quick ? 2 : 4);
      var strips = Engine.STRIPS[reel];
      strip.style.transition = "none";
      strip.textContent = "";
      to[reel].forEach(function (symbol) { strip.appendChild(symbolCell(symbol)); });
      for (var i = 0; i < filler; i++) strip.appendChild(symbolCell(strips[Engine.randomInt(strips.length)]));
      from[reel].forEach(function (symbol) { strip.appendChild(symbolCell(symbol)); });
      var travel = (filler + Engine.ROWS) * height;
      strip.style.transform = "translateY(" + (-travel) + "px)";
      void strip.offsetHeight;
      var duration = Math.round(((quick ? 520 : 760) + reel * (quick ? 150 : 240)) * pace);
      return new Promise(function (resolve) {
        var done = false;
        function land() {
          if (done) return;
          done = true;
          strip.removeEventListener("transitionend", land);
          // Only the three symbols in sight stay.
          while (strip.children.length > Engine.ROWS) strip.removeChild(strip.lastChild);
          strip.style.transition = "none";
          strip.style.transform = "translateY(0)";
          Sound.chip(reel % 2 ? 2 : 1);
          resolve();
        }
        strip.addEventListener("transitionend", land);
        setTimeout(land, duration + 200);
        strip.style.transition = "transform " + duration + "ms cubic-bezier(.2, .62, .28, 1.04)";
        strip.style.transform = "translateY(0)";
      });
    })).then(function () { labelReels(to); });
  }

  // Counts the win meter up to an amount.
  function countWin(amount, from) {
    from = from || 0;
    if (reducedMotion.matches || amount === from) {
      el.winMeter.textContent = fmt(amount);
      return Promise.resolve();
    }
    var duration = Math.min(1400, 300 + (amount - from) / Math.max(1, stake()) * 120) * (PACE[state.settings.animationSpeed] || 1);
    var started = performance.now();
    return new Promise(function (resolve) {
      function step(now) {
        var k = Math.min(1, (now - started) / duration);
        var eased = 1 - Math.pow(1 - k, 3);
        el.winMeter.textContent = fmt(Math.round(from + (amount - from) * eased));
        if (k < 1) global.requestAnimationFrame(step);
        else resolve();
      }
      global.requestAnimationFrame(step);
    });
  }

  /* ---------------- The spin ---------------- */
  // Credits the account, records the spin and closes the saved round.
  function commitSettlement(settlement) {
    var bankroll = Store.normalizeBankroll(account.read("bankroll", state.bankroll));
    bankroll = Math.min(Store.MAX_BANKROLL, bankroll + settlement.returned);
    var stats = Store.recordSpin(account.read("stats", state.stats), settlement);
    account.write("bankroll", bankroll);
    account.write("stats", stats);
    account.remove("round");
    state.bankroll = bankroll;
    state.stats = stats;
    state.lastWin = settlement.returned;
    renderStats();
  }

  function resultText(settlement) {
    return settlement.returned ? t("winLine", { amount: money(settlement.returned) }) : t("noWin");
  }

  // A spin left unfinished by a reload, a crash or a closed tab is settled
  // with the very stops it was drawn with. One that cannot be trusted is
  // voided and its stake returned.
  function recoverRound() {
    var raw = account.read("round", null);
    if (raw == null) return null;
    var round = Store.normalizeRound(raw);
    if (!round) {
      var bankroll = Store.normalizeBankroll(account.read("bankroll", Store.START_BANKROLL));
      var refund = raw && Engine.isLineBet(raw.lineBet) ? Engine.totalBet(raw.lineBet) : 0;
      state.bankroll = Math.min(Store.MAX_BANKROLL, bankroll + refund);
      account.write("bankroll", state.bankroll);
      account.remove("round");
      toast(t("roundVoided"), "lose");
      renderBankroll();
      return { voided: true };
    }
    var settlement = Engine.settle(round.spin, round.lineBet);
    commitSettlement(settlement);
    // The reels show where the spin, or its last free spin, came to rest.
    var last = settlement.free.length ? settlement.free[settlement.free.length - 1] : settlement.base;
    state.stops = last.stops;
    showStops(state.stops);
    renderBankroll();
    toast(t("roundRestored", { result: resultText(settlement) }), settlement.returned ? "win" : "");
    return { settlement: settlement };
  }

  // Spins once; the promise ends with the settlement, or null when the spin
  // could not be made.
  function spin() {
    if (!canSpin()) return Promise.resolve(null);
    state.settled = null;
    var bet = lineBet();
    var cost = Engine.totalBet(bet);
    Sound.unlock();
    state.busy = true;
    updateControls();
    return account.run(function () {
      recoverRound();
      var elsewhere = account.roundsElsewhere();
      if (elsewhere.length) return { elsewhere: elsewhere[0] };
      var bankroll = Store.normalizeBankroll(account.read("bankroll", Store.START_BANKROLL));
      if (cost > bankroll) {
        state.bankroll = bankroll;
        return { insufficient: true };
      }
      var round = { id: Store.newRoundId(), lineBet: bet, spin: Engine.play(), at: Date.now() };
      // The stops, any free spins and the stake are saved before the reels
      // turn, so a reload can neither spin again nor refund a losing spin.
      account.write("round", Store.roundSnapshot(round));
      account.write("bankroll", bankroll - cost);
      state.bankroll = bankroll - cost;
      return playRound(round);
    }, 900).then(function (outcome) {
      state.busy = false;
      if (outcome && outcome.busy) toast(t("accountBusy"), "lose");
      if (outcome && outcome.insufficient) toast(t("insufficientFunds"), "lose");
      if (outcome && outcome.elsewhere) toast(t("roundElsewhere", { table: Pit.TABLES[outcome.elsewhere] }), "lose");
      if (state.phase !== "betting") setPhase("betting");
      renderBankroll();
      updateControls();
      return state.settled;
    }, function (error) {
      state.busy = false;
      state.feature = null;
      renderFeature();
      setPhase("betting");
      toast(String(error && error.message || error), "lose");
      return null;
    });
  }

  /* ---------------- Autoplay ---------------- */
  // The spins left and the balance autoplay started from, while it runs.
  // It is never saved: a reload stops it.
  var auto = null;

  function openAuto() {
    if (auto) { stopAuto("autoStopped"); return; }
    if (!canSpin()) return;
    dialogReturn = document.activeElement;
    renderAutoChoices();
    el.autoModal.hidden = false;
    el.btn.autoStart.focus();
  }

  function closeAuto() {
    if (el.autoModal.hidden) return;
    el.autoModal.hidden = true;
    if (dialogReturn && typeof dialogReturn.focus === "function") dialogReturn.focus();
    dialogReturn = null;
  }

  function renderAutoChoices() {
    el.autoModal.querySelectorAll("[data-auto]").forEach(function (group) {
      var name = group.getAttribute("data-auto");
      group.querySelectorAll("[data-value]").forEach(function (button) {
        var on = Number(button.getAttribute("data-value")) === state.settings[name];
        button.classList.toggle("active", on);
        button.setAttribute("aria-checked", String(on));
        button.tabIndex = on ? 0 : -1;
      });
    });
    $("autoFeature").checked = state.settings.autoFeature;
  }

  // Why autoplay should stop after a spin, or null to go on.
  function autoStopReason(settled) {
    var cost = stake();
    if (!settled) return "autoStopped";
    if (state.settings.autoFeature && settled.free.length) return "autoStopFeature";
    if (state.settings.autoWin && settled.returned >= state.settings.autoWin * cost) return "autoStopWin";
    if (state.settings.autoLoss && auto.from - state.bankroll >= state.settings.autoLoss * cost) return "autoStopLoss";
    if (state.bankroll < cost) return "autoStopBalance";
    if (auto.left <= 0) return "autoDone";
    return null;
  }

  async function startAuto() {
    closeAuto();
    if (auto || !canSpin()) return;
    if (state.bankroll < stake()) { toast(t("insufficientFunds"), "lose"); return; }
    auto = { left: state.settings.autoSpins, from: state.bankroll, stop: null };
    updateControls();
    var reason = null;
    while (!reason) {
      auto.left--;
      updateControls();
      var settled = await spin();
      reason = auto.stop || autoStopReason(settled);
      if (!reason) await pause(450);
    }
    auto = null;
    updateControls();
    toast(t(reason), reason === "autoStopWin" || reason === "autoStopFeature" ? "win" : "");
  }

  // Stop asks autoplay to end once the spin in the air has landed.
  function stopAuto(reason) {
    if (auto) auto.stop = reason;
  }

  async function playRound(round) {
    var settlement = Engine.settle(round.spin, round.lineBet);
    setPhase("spinning");
    clearWins();
    renderBankroll();
    el.winMeter.textContent = "0";
    setBanner("goodLuck");
    Sound.shuffle();
    await spinReels(round.spin.stops, false);

    var base = settlement.base;
    showWins(base);
    if (base.win) {
      Sound.payout();
      setBanner("winLine", { amount: base.win }, null, "win");
      await countWin(base.win);
      await pause(700);
    } else if (!base.trigger) {
      setBanner("noWin");
    }

    if (settlement.free.length) {
      setPhase("feature");
      setBanner("featureStart", { count: base.scatter.count, spins: Engine.FREE_SPINS, multiplier: Engine.FREE_MULTIPLIER }, null, "win");
      Sound.win();
      await pause(1300);
      var won = 0;
      for (var i = 0; i < settlement.free.length; i++) {
        state.feature = { n: i + 1, total: settlement.free.length, won: won };
        renderFeature();
        clearWins();
        await spinReels(settlement.free[i].stops, true);
        var result = settlement.free[i];
        showWins(result);
        if (result.win) {
          Sound.payout();
          await countWin(base.win + won + result.win, base.win + won);
          won += result.win;
          state.feature.won = won;
          renderFeature();
          await pause(600);
        } else {
          await pause(260);
        }
      }
      setBanner("featureTotal", { amount: settlement.freeWin }, { key: "winLine", params: { amount: settlement.returned } }, "win");
      await pause(900);
      state.feature = null;
      renderFeature();
    }

    commitSettlement(settlement);
    state.settled = settlement;
    if (settlement.returned) {
      setBanner("winLine", { amount: settlement.returned }, settlement.free.length ? { key: "featureWon", params: { amount: settlement.freeWin } } : null, "win");
      Sound.chipsPush();
      flashBalance();
      if (settlement.returned >= settlement.stake * 10) Sound.win();
    } else {
      setBanner("noWin");
    }
    renderBankroll();
    setPhase("betting");
    restakeIfBroke();
  }

  function restakeIfBroke() {
    if (state.bankroll >= MIN_SPIN) return;
    account.run(function () {
      var bankroll = Store.normalizeBankroll(account.read("bankroll", 0));
      if (bankroll >= MIN_SPIN || account.read("round", null) != null) return;
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
      slider.setAttribute("aria-valuetext", value + "%");
      var out = $(slider.id + "Value");
      if (out) out.textContent = value + "%";
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

  // Dresses the reels, the pays table and the picker in the chosen set.
  function applySymbolSet() {
    var set = state.settings.symbolSet;
    body.setAttribute("data-symbol-set", set);
    document.querySelectorAll("[data-set-symbols]").forEach(function (button) {
      var on = button.getAttribute("data-set-symbols") === set;
      button.classList.toggle("active", on);
      button.setAttribute("aria-checked", String(on));
      button.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll("#paysTable tr[data-symbol]").forEach(function (row) {
      var symbol = row.getAttribute("data-symbol");
      row.querySelector("use").setAttribute("href", "#sym-" + faceOf(symbol));
      row.querySelector("th span").textContent = symbolName(symbol);
    });
    el.strips.forEach(function (strip) {
      strip.querySelectorAll(".cell use").forEach(function (use) {
        use.setAttribute("href", "#sym-" + faceOf(use.closest(".cell").getAttribute("data-symbol")));
      });
    });
    labelReels(Engine.windowAt(state.stops));
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
    if (!canSpin()) return;
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
    if (!canSpin()) return;
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
    renderPays();
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

    el.btn.spin.addEventListener("click", function () { spin(); });
    el.btn.auto.addEventListener("click", openAuto);
    el.btn.autoStart.addEventListener("click", startAuto);
    el.autoModal.querySelectorAll("[data-close]").forEach(function (node) { node.addEventListener("click", closeAuto); });
    el.autoModal.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { event.preventDefault(); closeAuto(); return; }
      if (event.key !== "Tab") return;
      var items = focusables(el.autoModal);
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    el.autoModal.querySelectorAll("[data-auto]").forEach(function (group) {
      group.addEventListener("click", function (event) {
        var button = event.target.closest("[data-value]");
        if (!button) return;
        state.settings[group.getAttribute("data-auto")] = Number(button.getAttribute("data-value"));
        saveSettings();
        renderAutoChoices();
      });
      radioKeys(group, "[data-value]", function (button) { button.click(); });
    });
    $("autoFeature").addEventListener("change", function (event) {
      state.settings.autoFeature = event.target.checked;
      saveSettings();
    });
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

    var symbolPicker = document.querySelector(".symbol-seg");
    symbolPicker.addEventListener("click", function (event) {
      var button = event.target.closest("[data-set-symbols]");
      if (!button || button.getAttribute("data-set-symbols") === state.settings.symbolSet) return;
      state.settings.symbolSet = button.getAttribute("data-set-symbols");
      saveSettings();
      applySymbolSet();
      renderWinList();
    });
    radioKeys(symbolPicker, "[data-set-symbols]", function (button) { button.click(); });

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
    if (!el.settings.hidden || !el.autoModal.hidden) return;
    var target = event.target;
    var typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    if (typing) return;
    var onControl = target && target.closest && target.closest("button, a, summary, [role='button']");
    var key = event.key;
    var lower = key.length === 1 ? key.toLowerCase() : key;
    // While autoplay runs, Space, Enter and A all stop it.
    if (auto && (key === " " || key === "Enter" || lower === "a")) { event.preventDefault(); stopAuto("autoStopped"); return; }
    if ((key === " " || key === "Enter") && !onControl) { event.preventDefault(); spin(); return; }
    if (lower === "a") { openAuto(); return; }
    if (lower >= "1" && lower <= "6" && canSpin()) { selectChip(TRAY[Number(lower) - 1]); return; }
    if (lower === "m") setSound(!soundEnabled);
  }

  /* ---------------- Start ---------------- */
  function translateAll() {
    I18n.apply(document);
    applyLanguageUI();
    applySoundUI();
    renderBanner();
    renderBet();
    renderLimits();
    renderWinList();
    renderFeature();
    renderPays();
    applySymbolSet();
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
    // The reels open on a random rest, as a machine left by its last player.
    state.stops = Engine.spinStops();
    showStops(state.stops);
    renderLineMaps();
    selectChip(state.settings.lineBet);
    translateAll();
    bindControls();
    if (!account.shared) toast(t("temporaryAccount"));
    updateControls();
    renderBankroll();

    // A spin left unfinished by a reload, crash or closed tab is settled now.
    if (account.read("round", null) != null) {
      state.busy = true;
      updateControls();
      account.run(recoverRound, 2500).then(function (outcome) {
        state.busy = false;
        if (outcome && outcome.busy) toast(t("accountBusy"), "lose");
        restakeIfBroke();
        renderBankroll();
        updateControls();
      }, function () { state.busy = false; updateControls(); });
    } else {
      restakeIfBroke();
    }
  }

  init();
})();
