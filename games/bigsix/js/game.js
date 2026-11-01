/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Wheel 54 — the table
   Chips on the layout, the spin of the wheel and what it pays. Chips
   are only chips until the wheel is spun; then the bets, the stake
   and the segment it stops on are saved before the wheel turns, so a
   reload settles the very same spin.
   ========================================================= */
(function () {
  "use strict";

  var global = window;
  var Pit = global.Pit;
  var Engine = global.BigSixEngine;
  var Store = global.BigSixStore;
  var Chips = global.ChipArt;
  var Sound = global.Sound;
  if (!Pit || !Engine || !Store || !Chips || !Sound) {
    throw new Error("Table modules must load before game.js");
  }

  // The chips this table offers, as its tray shows them; the smallest is the table minimum.
  var TRAY = Chips.trayValues(document.getElementById("chipTray"));
  var MIN_CHIP = TRAY[0];
  var PACE = { fast: 0.55, normal: 1, cinematic: 1.45 };
  var STEP = 360 / Engine.SEGMENTS.length;
  var SVG = "http://www.w3.org/2000/svg";
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
    history: [],
    // Chips on the layout for the next spin; they leave the balance with the spin.
    bets: {},
    actions: [],
    lastBets: {},
    chip: 25,
    phase: "betting",
    busy: false,
    lastWin: 0,
    banner: { key: "placeBets", params: null, sub: null, tone: "" },
    // The wheel's turn so far, in degrees; every spin turns it further on.
    rotation: 0
  };

  function readAccountState() {
    var snap = account.snapshot();
    state.bankroll = snap.bankroll;
    state.stats = snap.stats;
    state.history = snap.table.history;
    state.lastBets = snap.lastBets;
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
    wheel: $("wheel"),
    rotor: $("wheelRotor"),
    history: $("history"),
    tableMin: $("tableMin"),
    tableMax: $("tableMax"),
    layout: $("layout"),
    chipTray: $("chipTray"),
    layoutTotal: $("layoutTotal"),
    lastWin: $("lastWin"),
    toast: $("toast"),
    settings: $("settingsModal"),
    btn: {
      undo: $("btnUndo"), clear: $("btnClear"), rebet: $("btnRebet"), spin: $("btnSpin"),
      sound: $("soundToggle"), settings: $("settingsBtn"), resetStats: $("btnResetStats")
    }
  };

  function spotFor(key) { return el.layout.querySelector('[data-bet="' + key + '"]'); }
  function holderFor(key) { return el.layout.querySelector('[data-stack="' + key + '"]'); }

  /* ---------------- Timing ---------------- */
  function pause(ms) {
    var scaled = reducedMotion.matches ? 0 : Math.round(ms * (PACE[state.settings.animationSpeed] || 1));
    return new Promise(function (resolve) { setTimeout(resolve, scaled); });
  }

  /* ---------------- Words ---------------- */
  function betName(key) { return t(key + "Name"); }

  function payWords(value) { return t("payTo", { n: value }); }

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

  // Parameters named amount are dollars and symbol names a bet, both drawn
  // in the language shown.
  function localize(params) {
    if (!params) return params;
    var out = {};
    Object.keys(params).forEach(function (key) {
      out[key] = key === "amount" ? money(params[key]) : key === "symbol" ? betName(params[key]) : params[key];
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

  /* ---------------- Bets ---------------- */
  function staked() { return Engine.totalStake(state.bets); }
  function available() { return state.bankroll - staked(); }
  function canBet() { return state.phase === "betting" && !state.busy; }

  function applyAction(changes) {
    if (!changes.length) return;
    changes.forEach(function (change) {
      if (change.after > 0) state.bets[change.key] = change.after;
      else delete state.bets[change.key];
    });
    state.actions.push(changes);
    renderBets(changes.map(function (change) { return change.key; }));
    updateControls();
  }

  function addChip(key) {
    if (!canBet()) return;
    var refusal = Engine.canAdd(key, state.bets);
    if (refusal === "limit") { toast(t("tableLimit", { amount: money(Engine.maxBet(key)) }), "lose"); return; }
    if (refusal) return;
    var room = Engine.maxBet(key) - (state.bets[key] || 0);
    var amount = Math.min(state.chip, room);
    if (amount > available()) { toast(t("insufficientFunds"), "lose"); return; }
    Sound.unlock();
    var current = state.bets[key] || 0;
    applyAction([{ key: key, before: current, after: current + amount }]);
    Sound.chip(Object.keys(state.bets).length);
    if (amount < state.chip) toast(t("tableLimit", { amount: money(Engine.maxBet(key)) }), "lose");
  }

  function removeChip(key) {
    if (!canBet() || !state.bets[key]) return;
    var current = state.bets[key];
    applyAction([{ key: key, before: current, after: current - Math.min(current, state.chip) }]);
    Sound.chip(1);
  }

  function undo() {
    if (!canBet() || !state.actions.length) return;
    var changes = state.actions.pop();
    changes.forEach(function (change) {
      if (change.before > 0) state.bets[change.key] = change.before;
      else delete state.bets[change.key];
    });
    renderBets(changes.map(function (change) { return change.key; }));
    updateControls();
    Sound.chip(2);
  }

  function clearBets() {
    if (!canBet() || !staked()) return;
    applyAction(Object.keys(state.bets).map(function (key) { return { key: key, before: state.bets[key], after: 0 }; }));
    Sound.chipsPush();
  }

  // Puts down again the bets of the last spin.
  function rebet() {
    if (!canBet() || staked()) return;
    var bets = Engine.normalizeBets(state.lastBets);
    var changes = Object.keys(bets).map(function (key) {
      return { key: key, before: 0, after: Math.min(bets[key], Engine.maxBet(key)) };
    });
    if (!changes.length) return;
    if (changes.reduce(function (sum, c) { return sum + c.after; }, 0) > available()) { toast(t("rebetUnavailable"), "lose"); return; }
    applyAction(changes);
    Sound.chipStack(3);
  }

  function selectChip(value) {
    if (TRAY.indexOf(value) === -1) return;
    state.chip = value;
    el.chipTray.querySelectorAll(".chip").forEach(function (chip) {
      var on = Number(chip.getAttribute("data-value")) === value;
      chip.setAttribute("aria-checked", String(on));
      chip.tabIndex = on ? 0 : -1;
    });
  }

  /* ---------------- Rendering ---------------- */
  function renderBankroll() {
    el.bankroll.textContent = fmt(Math.max(0, available()));
    el.layoutTotal.textContent = fmt(staked());
    el.lastWin.textContent = fmt(state.lastWin);
    body.setAttribute("data-wager", String(staked()));
  }

  function flashBalance() {
    el.balancePill.classList.remove("win-flash");
    void el.balancePill.offsetWidth;
    el.balancePill.classList.add("win-flash");
  }

  // Draws the stacks on every bet; freshly placed stacks drop in.
  function renderBets(changedKeys) {
    Engine.BETS.forEach(function (key) {
      var holder = holderFor(key);
      holder.textContent = "";
      if (state.bets[key]) {
        var placed = changedKeys && changedKeys.indexOf(key) !== -1;
        holder.appendChild(Chips.stack(document, state.bets[key], "bet-chip" + (placed ? " placed" : "")));
      }
    });
    el.layout.querySelectorAll("[data-bet]").forEach(function (spot) {
      var key = spot.getAttribute("data-bet");
      var pays = payWords(Engine.PAYS[key]).toLowerCase();
      spot.setAttribute("aria-label", t("spotLabel", { name: betName(key), pays: pays, amount: money(state.bets[key] || 0) }));
    });
    renderBankroll();
  }

  // The odds and the share of the wheel printed on each spot, in the language shown.
  function renderPays() {
    el.layout.querySelectorAll(".spot-pay[data-pay]").forEach(function (node) {
      node.textContent = payWords(node.getAttribute("data-pay"));
    });
    el.layout.querySelectorAll(".spot-count[data-count]").forEach(function (node) {
      node.textContent = t("spotCount", { count: Engine.countOf(node.getAttribute("data-count")) });
    });
  }

  /* ---------------- The wheel ---------------- */
  // The words each segment shows; the Joker and the logo show their names.
  var FACES = { one: "$1", two: "$2", five: "$5", ten: "$10", twenty: "$20", joker: "JOKER", logo: "THE PIT" };

  function point(radius, degrees) {
    var a = (degrees - 90) * Math.PI / 180;
    return (radius * Math.cos(a)).toFixed(2) + " " + (radius * Math.sin(a)).toFixed(2);
  }

  // Fifty-four wedges clockwise from the top, each with its symbol written
  // along the radius.
  function buildWheel() {
    el.rotor.textContent = "";
    var rim = document.createElementNS(SVG, "circle");
    rim.setAttribute("class", "wheel-rim");
    rim.setAttribute("r", "97");
    el.rotor.appendChild(rim);
    Engine.SEGMENTS.forEach(function (symbol, index) {
      var from = (index - 0.5) * STEP, to = (index + 0.5) * STEP;
      var wedge = document.createElementNS(SVG, "path");
      wedge.setAttribute("class", "wedge wedge-" + symbol);
      wedge.setAttribute("data-segment", String(index));
      wedge.setAttribute("d", "M " + point(26, from) + " L " + point(92, from) + " A 92 92 0 0 1 " + point(92, to) + " L " + point(26, to) + " A 26 26 0 0 0 " + point(26, from) + " Z");
      el.rotor.appendChild(wedge);
      var label = document.createElementNS(SVG, "text");
      label.setAttribute("class", "wedge-label label-" + symbol);
      label.setAttribute("transform", "rotate(" + (index * STEP) + ") translate(0 -68) rotate(-90)");
      label.textContent = FACES[symbol];
      el.rotor.appendChild(label);
    });
    var studs = document.createElementNS(SVG, "g");
    studs.setAttribute("class", "wheel-studs");
    Engine.SEGMENTS.forEach(function (symbol, index) {
      var stud = document.createElementNS(SVG, "circle");
      var at = point(94.5, (index + 0.5) * STEP).split(" ");
      stud.setAttribute("cx", at[0]);
      stud.setAttribute("cy", at[1]);
      stud.setAttribute("r", "1.3");
      studs.appendChild(stud);
    });
    el.rotor.appendChild(studs);
  }

  function setRotation(degrees, seconds) {
    el.rotor.style.transition = seconds ? "transform " + seconds + "s cubic-bezier(.12, .7, .16, 1)" : "none";
    el.rotor.style.transform = "rotate(" + degrees + "deg)";
  }

  // The turn that brings a segment under the pointer, at least `turns` full
  // turns further on than the wheel stands now.
  function rotationFor(segment, turns) {
    var target = (360 - segment * STEP) % 360;
    var base = state.rotation - (((state.rotation % 360) + 360) % 360);
    var next = base + target + 360 * turns;
    while (next < state.rotation + 360 * turns) next += 360;
    return next;
  }

  function showSegment(segment) {
    state.rotation = rotationFor(segment, 0);
    setRotation(state.rotation, 0);
    el.wheel.setAttribute("aria-label", t("wheelLabel", { symbol: betName(Engine.symbolAt(segment)) }));
    el.rotor.querySelectorAll(".wedge.landed").forEach(function (node) { node.classList.remove("landed"); });
  }

  function renderHistory() {
    el.history.textContent = "";
    state.history.slice(-12).reverse().forEach(function (segment, index) {
      var symbol = Engine.symbolAt(segment);
      var li = document.createElement("li");
      li.className = "symbol-" + symbol + (index === 0 ? " latest" : "");
      li.textContent = symbol === "joker" ? "J" : symbol === "logo" ? "P" : String(Engine.PAYS[symbol]);
      li.title = betName(symbol);
      el.history.appendChild(li);
    });
  }

  function renderLimits() {
    el.tableMin.textContent = money(MIN_CHIP);
    el.tableMax.textContent = money(Engine.LIMITS.one);
  }

  function renderStats() {
    var s = state.stats;
    var net = s.returned - s.wagered;
    $("stSpins").textContent = fmt(s.spins);
    $("stWinRate").textContent = (s.spins ? Math.round(s.winningSpins / s.spins * 100) : 0) + "%";
    $("stJackpots").textContent = fmt(s.jackpots);
    $("stWagered").textContent = money(s.wagered);
    $("stReturned").textContent = money(s.returned);
    var netNode = $("stNet");
    netNode.textContent = (net < 0 ? "−" : "") + money(Math.abs(net));
    netNode.classList.toggle("positive", net > 0);
    netNode.classList.toggle("negative", net < 0);
    $("stBiggest").textContent = money(s.biggestWin);
  }

  function updateControls() {
    var betting = canBet();
    var hasBets = staked() > 0;
    el.btn.undo.disabled = !betting || !state.actions.length;
    el.btn.clear.disabled = !betting || !hasBets;
    el.btn.rebet.disabled = !betting || hasBets || !Object.keys(state.lastBets).length;
    el.btn.spin.disabled = !betting || !hasBets;
    el.btn.spin.classList.toggle("ready", betting && hasBets);
    var avail = available();
    el.chipTray.querySelectorAll(".chip").forEach(function (chip) {
      chip.disabled = !betting;
      chip.classList.toggle("unaffordable", Number(chip.getAttribute("data-value")) > avail);
    });
    el.layout.querySelectorAll("[data-bet]").forEach(function (spot) { spot.disabled = !betting; });
    $("depositAmount").disabled = !betting;
    document.querySelectorAll("[data-deposit], #btnDeposit, #btnResetStats").forEach(function (node) { node.disabled = !betting; });
    body.setAttribute("data-busy", String(state.busy || state.phase !== "betting"));
  }

  function setPhase(phase) {
    state.phase = phase;
    body.setAttribute("data-phase", phase);
    updateControls();
  }

  /* ---------------- The spin ---------------- */
  // Credits the account, records the spin and closes the round.
  function commitSpin(result) {
    var bankroll = Store.normalizeBankroll(account.read("bankroll", state.bankroll));
    bankroll = Math.min(Store.MAX_BANKROLL, bankroll + result.returned);
    var stats = Store.recordSpin(account.read("stats", state.stats), result);
    var table = Store.normalizeTable(account.read("table", null));
    var history = table.history.concat([result.segment]).slice(-Store.HISTORY_LIMIT);
    account.write("bankroll", bankroll);
    account.write("stats", stats);
    account.write("table", { history: history });
    account.remove("round");
    state.bankroll = bankroll;
    state.stats = stats;
    state.history = history;
    state.lastWin = result.returned;
    renderStats();
  }

  function resultText(result) {
    var words = t("landedOn", { symbol: betName(result.symbol) });
    return result.returned ? words + ". " + t("winLine", { amount: money(result.returned) }) : words;
  }

  // A spin left on its way by a reload, a crash or a closed tab is settled
  // on the very segment it was drawn with. A round that cannot be trusted is
  // voided and its stake returned.
  function recoverRound() {
    var raw = account.read("round", null);
    if (raw == null) return null;
    var round = Store.normalizeRound(raw);
    if (!round) {
      var bankroll = Store.normalizeBankroll(account.read("bankroll", Store.START_BANKROLL));
      var refund = Engine.totalStake(Engine.normalizeBets(raw && raw.bets));
      state.bankroll = Math.min(Store.MAX_BANKROLL, bankroll + refund);
      account.write("bankroll", state.bankroll);
      account.remove("round");
      toast(t("roundVoided"), "lose");
      return { voided: true };
    }
    var result = Engine.resolve(round.bets, round.segment);
    commitSpin(result);
    showSegment(round.segment);
    toast(t("roundRestored", { result: resultText(result) }), result.returned ? "win" : "");
    return { result: result };
  }

  function spin() {
    if (!canBet()) return;
    var bets = Engine.normalizeBets(state.bets);
    var wager = Engine.totalStake(bets);
    if (!wager) { toast(t("minBet"), "lose"); return; }
    Sound.unlock();
    state.busy = true;
    updateControls();
    account.run(function () {
      recoverRound();
      var elsewhere = account.roundsElsewhere();
      if (elsewhere.length) return { elsewhere: elsewhere[0] };
      var bankroll = Store.normalizeBankroll(account.read("bankroll", Store.START_BANKROLL));
      if (wager > bankroll) {
        state.bankroll = bankroll;
        return { insufficient: true };
      }
      var round = { id: Store.newRoundId(), bets: bets, segment: Engine.spin(), wager: wager, at: Date.now() };
      // The bets, the stake and the segment are saved before the wheel
      // turns, so a reload can neither spin again nor refund a losing bet.
      account.write("round", Store.roundSnapshot(round));
      account.write("bankroll", bankroll - wager);
      account.write("lastBets", bets);
      state.bankroll = bankroll - wager;
      state.lastBets = bets;
      state.actions = [];
      return playSpin(round);
    }, 900).then(function (outcome) {
      state.busy = false;
      if (outcome && outcome.busy) toast(t("accountBusy"), "lose");
      if (outcome && outcome.insufficient) toast(t("insufficientFunds"), "lose");
      if (outcome && outcome.elsewhere) toast(t("roundElsewhere", { table: Pit.TABLES[outcome.elsewhere] }), "lose");
      if (state.phase !== "betting") setPhase("betting");
      renderBets(null);
      updateControls();
    }, function (error) {
      state.busy = false;
      setPhase("betting");
      toast(String(error && error.message || error), "lose");
    });
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, Math.max(0, ms)); });
  }

  // The wheel turns four times and more, and slows to a stop on the segment.
  async function turnWheel(segment) {
    var seconds = reducedMotion.matches ? 0 : 4.2 * (PACE[state.settings.animationSpeed] || 1);
    el.rotor.querySelectorAll(".wedge.landed").forEach(function (node) { node.classList.remove("landed"); });
    state.rotation = rotationFor(segment, 4);
    Sound.shuffle();
    setRotation(state.rotation, seconds);
    // The clapper ticks while the wheel turns, further apart as it slows;
    // the gaps are shares of the whole turn.
    var gaps = seconds ? [0.04, 0.05, 0.06, 0.07, 0.09, 0.11, 0.14, 0.18, 0.24] : [];
    var waited = 0;
    for (var i = 0; i < gaps.length; i++) {
      await wait(seconds * 1000 * gaps[i]);
      waited += gaps[i];
      Sound.chip(1);
    }
    await wait(seconds * 1000 * (1 - waited));
    el.wheel.setAttribute("aria-label", t("wheelLabel", { symbol: betName(Engine.symbolAt(segment)) }));
    var wedge = el.rotor.querySelector('.wedge[data-segment="' + segment + '"]');
    if (wedge) wedge.classList.add("landed");
    Sound.chip(3);
    await pause(200);
  }

  async function playSpin(round) {
    setPhase("spinning");
    renderBets(null);
    setBanner("wheelSpinning");
    await turnWheel(round.segment);

    var result = Engine.resolve(round.bets, round.segment);
    var sub = result.returned ? { key: "winLine", params: { amount: result.returned } } : { key: "lostLine", params: { amount: result.lost } };
    setBanner("landedOn", { symbol: result.symbol }, sub, result.returned > result.stake ? "win" : result.returned ? "" : "lose");
    setPhase("settling");
    await showResult(result);
    commitSpin(result);
    if (result.returned) {
      Sound.chipsPush();
      flashBalance();
    }
    state.bets = {};
    renderHistory();
    renderBets(null);
    el.layout.querySelectorAll(".lit").forEach(function (node) { node.classList.remove("lit"); });
    setPhase("betting");
    restakeIfBroke();
  }

  // The spot of the symbol that came up lights up; losing stacks are swept
  // away and winners are paid beside their stake.
  async function showResult(result) {
    spotFor(result.symbol).classList.add("lit");
    result.lines.forEach(function (line) {
      var stack = holderFor(line.key).querySelector(".bet-chip");
      if (!stack) return;
      if (line.result === "lose") stack.classList.add("losing");
      else holderFor(line.key).appendChild(Chips.stack(document, line.profit, "bet-chip payout"));
    });
    if (result.returned) Sound.payout();
    if (result.returned > result.stake) Sound.win();
    else if (!result.returned) Sound.lose();
    await pause(result.lines.length ? 1300 : 600);
  }

  function restakeIfBroke() {
    if (state.bankroll >= MIN_CHIP || staked()) return;
    account.run(function () {
      var bankroll = Store.normalizeBankroll(account.read("bankroll", 0));
      if (bankroll >= MIN_CHIP || account.read("round", null) != null) return;
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

  function applyLanguageUI() {
    document.querySelectorAll("[data-lang], [data-set-lang]").forEach(function (button) {
      var on = (button.getAttribute("data-lang") || button.getAttribute("data-set-lang")) === I18n.get();
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", String(on));
    });
  }

  function deposit(amount) {
    amount = Engine.wholeAmount(amount);
    if (!amount) { toast(t("invalidDeposit"), "lose"); return; }
    if (!canBet()) return;
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
    if (!canBet()) return;
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

    el.layout.addEventListener("click", function (event) {
      var spot = event.target.closest("[data-bet]");
      if (spot) addChip(spot.getAttribute("data-bet"));
    });
    el.layout.addEventListener("contextmenu", function (event) {
      var spot = event.target.closest("[data-bet]");
      if (!spot) return;
      event.preventDefault();
      removeChip(spot.getAttribute("data-bet"));
    });
    el.layout.addEventListener("keydown", function (event) {
      var spot = event.target.closest("[data-bet]");
      if (spot && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        removeChip(spot.getAttribute("data-bet"));
      }
    });

    el.btn.undo.addEventListener("click", undo);
    el.btn.clear.addEventListener("click", clearBets);
    el.btn.rebet.addEventListener("click", rebet);
    el.btn.spin.addEventListener("click", spin);
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
        renderHistory();
        renderBets(null);
        renderStats();
        updateControls();
      }
    });
  }

  function onGlobalKey(event) {
    if (event.defaultPrevented || event.altKey || event.metaKey || event.repeat || event.isComposing) return;
    if (!el.settings.hidden) return;
    var target = event.target;
    var typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    if (typing) return;
    var onControl = target && target.closest && target.closest("button, a, summary, [role='button']");
    var key = event.key;
    if (event.ctrlKey) {
      if (key.toLowerCase() === "z") { event.preventDefault(); undo(); }
      return;
    }
    if ((key === " " || key === "Enter") && !onControl) { event.preventDefault(); spin(); return; }
    if (key === "Backspace" && !onControl) { event.preventDefault(); undo(); return; }
    var lower = key.length === 1 ? key.toLowerCase() : key;
    if (lower >= "1" && lower <= "6") { selectChip(TRAY[Number(lower) - 1]); return; }
    switch (lower) {
      case "z": undo(); break;
      case "c": clearBets(); break;
      case "r": rebet(); break;
      case "m": setSound(!soundEnabled); break;
    }
  }

  /* ---------------- Start ---------------- */
  function translateAll() {
    I18n.apply(document);
    applyLanguageUI();
    applySoundUI();
    renderPays();
    renderBanner();
    renderHistory();
    renderBets(null);
    renderStats();
  }

  function init() {
    readAccountState();
    applyTheme(Pit.readTheme(safeStorage("localStorage")));
    applyAnimationSpeed();
    var volumes = Store.readJSON(safeStorage("localStorage"), Store.KEYS.audio, null);
    if (volumes) Sound.setVolumes(volumes);
    Sound.setEnabled(soundEnabled);
    renderLimits();
    Chips.decorateTray(el.chipTray);
    selectChip(state.chip);
    buildWheel();
    if (state.history.length) showSegment(state.history[state.history.length - 1]);
    translateAll();
    bindControls();
    if (!account.shared) toast(t("temporaryAccount"));
    updateControls();

    // A spin left on its way by a reload, crash or closed tab is settled now.
    if (account.read("round", null) != null) {
      state.busy = true;
      updateControls();
      account.run(recoverRound, 2500).then(function (outcome) {
        state.busy = false;
        if (outcome && outcome.busy) toast(t("accountBusy"), "lose");
        renderHistory();
        renderBets(null);
        restakeIfBroke();
        updateControls();
      }, function () { state.busy = false; updateControls(); });
    } else {
      restakeIfBroke();
    }
  }

  init();
})();
