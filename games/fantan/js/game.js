/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 4 — the table
   Betting on the layout, the croupier's beads counted off in fours,
   settlement against the box of change, the last results and the
   statistics. The bets, the stake and the pile of beads are saved
   before the bowl is lifted, so a reload settles the very same round
   instead of a new one.
   ========================================================= */
(function () {
  "use strict";

  var global = window;
  var Pit = global.Pit;
  var Engine = global.FanTanEngine;
  var Store = global.FanTanStore;
  var Chips = global.ChipArt;
  var Sound = global.Sound;
  if (!Pit || !Engine || !Store || !Chips || !Sound) {
    throw new Error("Table modules must load before game.js");
  }

  // The chips this table offers, as its tray shows them; the smallest is the table minimum.
  var TRAY = Chips.trayValues(document.getElementById("chipTray"));
  var MIN_CHIP = TRAY[0];
  var PACE = { fast: 0.55, normal: 1, cinematic: 1.45 };
  var PAY_WORDS = { fan: "payFan", nim: "payNim", pair: "payPair", tan: "payTan", ssh: "paySsh" };
  // The golden angle lays the beads out as a natural heap, densest in the middle.
  var GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  var reducedMotion = global.matchMedia ? global.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  var t = function (key, params) { return I18n.t(key, params); };
  function fmt(n) { return Number(n).toLocaleString(I18n.locale()); }
  function money(n) { return "$" + fmt(n); }
  // Change in the box: the whole cents it holds, never rounded up.
  function cents(units) {
    var amount = Math.floor(units * 100 / Engine.UNITS) / 100;
    return "$" + amount.toLocaleString(I18n.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    bets: {},
    actions: [],
    lastBets: {},
    box: 0,
    history: [],
    chip: 25,
    phase: "betting",
    busy: false,
    lastWin: 0,
    // The pile on show: its beads and what they left, once counted.
    shown: null,
    banner: { key: "placeBets", params: null, sub: null, tone: "" }
  };

  function readAccountState() {
    var snap = account.snapshot();
    state.bankroll = snap.bankroll;
    state.stats = snap.stats;
    state.lastBets = snap.lastBets;
    state.box = snap.box;
    state.history = snap.history;
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
    results: $("results"),
    bowl: $("bowl"),
    beads: $("beads"),
    bowlResult: $("bowlResult"),
    bowlCount: $("bowlCount"),
    layout: $("layout"),
    boxSpec: $("boxSpec"),
    boxAmount: $("boxAmount"),
    tableMin: $("tableMin"),
    tableMax: $("tableMax"),
    chipTray: $("chipTray"),
    totalBet: $("totalBet"),
    lastWin: $("lastWin"),
    toast: $("toast"),
    settings: $("settingsModal"),
    btn: {
      undo: $("btnUndo"), clear: $("btnClear"), double: $("btnDouble"), rebet: $("btnRebet"), open: $("btnOpen"),
      sound: $("soundToggle"), settings: $("settingsBtn"), resetStats: $("btnResetStats")
    }
  };

  function spotFor(key) { return el.layout.querySelector('[data-bet="' + key + '"]'); }

  /* ---------------- Timing ---------------- */
  function pause(ms) {
    var scaled = reducedMotion.matches ? 0 : Math.round(ms * (PACE[state.settings.animationSpeed] || 1));
    return new Promise(function (resolve) { setTimeout(resolve, scaled); });
  }

  /* ---------------- Words for the bets ---------------- */
  function betName(key) {
    var def = Engine.DEFS[key];
    var n = def.wins.concat(def.push);
    switch (def.kind) {
      case "fan": return t("fanName", { a: n[0] });
      case "ssh": return t("sshName", { a: n[0], b: n[1], c: n[2] });
      case "nim": return t("nimName", { a: n[0], b: n[1] });
      case "tan": return t("tanName", { a: n[0], b: n[1], c: n[2] });
      default: return key === "odd" ? t("oddName") : key === "even" ? t("evenName") : t("kwokName", { a: n[0], b: n[1] });
    }
  }

  function numberList(numbers) {
    return numbers.join(t("orWord"));
  }

  function spotLabel(key) {
    var def = Engine.DEFS[key];
    return t("spotLabel", {
      name: betName(key),
      wins: numberList(def.wins),
      push: def.push.length ? t("pushPart", { push: numberList(def.push) }) : "",
      pays: t(PAY_WORDS[def.kind]).toLowerCase(),
      amount: money(state.bets[key] || 0)
    });
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

  // Amounts are put into words in the language shown.
  function localize(params) {
    if (!params) return params;
    var out = {};
    Object.keys(params).forEach(function (key) { out[key] = key === "amount" ? money(params[key]) : params[key]; });
    return out;
  }

  // The banner remembers its words, not its text, so it follows a language change.
  function setBanner(key, params, sub, tone) {
    state.banner = { key: key, params: params || null, sub: sub || null, tone: tone || "" };
    renderBanner();
  }

  function renderBanner() {
    var b = state.banner;
    el.bannerText.textContent = t(b.key, localize(b.params));
    el.bannerText.removeAttribute("data-i18n");
    el.bannerSub.textContent = b.sub ? t(b.sub.key, localize(b.sub.params)) : "";
    el.banner.classList.toggle("flash-win", b.tone === "win");
    el.banner.classList.toggle("flash-lose", b.tone === "lose");
  }

  function resultSub(settlement) {
    if (!settlement.paid) return { key: "noWin" };
    if (settlement.net > 0) return { key: "winLine", params: { amount: settlement.net } };
    return { key: "returnedLine", params: { amount: settlement.paid } };
  }

  function resultText(settlement, beads) {
    var sub = resultSub(settlement);
    return t("resultLine", { beads: beads, left: settlement.result }) + ". " + t(sub.key, localize(sub.params));
  }

  /* ---------------- Bets ---------------- */
  function staked() { return Engine.totalStake(state.bets); }
  function available() { return state.bankroll - staked(); }
  function canBet() { return state.phase === "betting" && !state.busy; }

  // Applies one action (a list of spot changes) and remembers it for undo.
  // The first bet of a round clears the marks the last result left.
  function applyAction(changes) {
    if (!changes.length) return;
    clearMarks();
    changes.forEach(function (change) {
      if (change.after > 0) state.bets[change.key] = change.after;
      else delete state.bets[change.key];
    });
    state.actions.push(changes);
    renderBets(changes.map(function (change) { return change.key; }));
    updateControls();
  }

  function addChip(key) {
    if (!canBet() || !Engine.isBet(key)) return;
    var current = state.bets[key] || 0;
    var limit = Engine.maxBet(key);
    if (current >= limit) { toast(t("tableLimit", { amount: money(limit) }), "lose"); return; }
    var amount = Math.min(state.chip, limit - current);
    if (amount > available()) { toast(t("insufficientFunds"), "lose"); return; }
    Sound.unlock();
    applyAction([{ key: key, before: current, after: current + amount }]);
    Sound.chip(Object.keys(state.bets).length);
    if (amount < state.chip) toast(t("tableLimit", { amount: money(limit) }), "lose");
  }

  // Takes one chip of the selected value back off a spot.
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

  function doubleBets() {
    if (!canBet() || !staked()) return;
    var changes = Object.keys(state.bets).map(function (key) {
      var before = state.bets[key];
      return { key: key, before: before, after: Math.min(before * 2, Engine.maxBet(key)) };
    }).filter(function (change) { return change.after > change.before; });
    var extra = changes.reduce(function (sum, change) { return sum + change.after - change.before; }, 0);
    if (!changes.length) { toast(t("tableLimit", { amount: money(Engine.maxBet(Object.keys(state.bets)[0])) }), "lose"); return; }
    if (extra > available()) { toast(t("doubleUnavailable"), "lose"); return; }
    applyAction(changes);
    Sound.chipStack(3);
  }

  // Puts down again the bets of the last round.
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
    el.bankroll.textContent = fmt(Math.max(0, state.phase === "betting" ? available() : state.bankroll));
    el.totalBet.textContent = fmt(staked());
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
      var spot = spotFor(key);
      var holder = spot.querySelector(".spot-stack");
      holder.textContent = "";
      if (state.bets[key]) {
        var placed = changedKeys && changedKeys.indexOf(key) !== -1;
        holder.appendChild(Chips.stack(document, state.bets[key], "bet-chip" + (placed ? " placed" : "")));
      }
      spot.classList.toggle("staked", !!state.bets[key]);
      spot.setAttribute("aria-label", spotLabel(key));
    });
    renderBankroll();
  }

  function renderBox() {
    el.boxSpec.hidden = !state.box;
    el.boxAmount.textContent = cents(state.box);
    el.boxSpec.title = t("boxTitle", { amount: cents(state.box) });
  }

  function renderResults() {
    el.results.textContent = "";
    state.history.forEach(function (result) {
      var item = document.createElement("li");
      item.className = "result result-" + result;
      item.textContent = String(result);
      el.results.appendChild(item);
    });
  }

  function renderLimits() {
    el.tableMin.textContent = money(MIN_CHIP);
    el.tableMax.textContent = money(Math.max.apply(null, Engine.BETS.map(Engine.maxBet)));
  }

  function renderStats() {
    var s = state.stats;
    var net = s.returned - s.wagered;
    $("stRounds").textContent = fmt(s.rounds);
    $("stWinRate").textContent = I18n.percent(s.rounds ? s.winningRounds / s.rounds : 0);
    $("stResults").textContent = [s.ones, s.twos, s.threes, s.fours].map(fmt).join(" · ");
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
    var any = staked() > 0;
    el.btn.undo.disabled = !betting || !state.actions.length;
    el.btn.clear.disabled = !betting || !any;
    el.btn.double.disabled = !betting || !any;
    el.btn.rebet.disabled = !betting || any || !Object.keys(state.lastBets).length;
    el.btn.open.disabled = !betting || !any;
    el.btn.open.classList.toggle("ready", betting && any);
    var avail = available();
    el.chipTray.querySelectorAll(".chip").forEach(function (chip) {
      chip.disabled = !betting;
      chip.classList.toggle("unaffordable", Number(chip.getAttribute("data-value")) > avail);
    });
    el.layout.querySelectorAll(".spot").forEach(function (spot) { spot.disabled = !betting; });
    $("depositAmount").disabled = !betting;
    document.querySelectorAll("[data-deposit], #btnDeposit, #btnResetStats").forEach(function (node) { node.disabled = !betting; });
    body.setAttribute("data-busy", String(state.busy || state.phase !== "betting"));
  }

  function setPhase(phase) {
    state.phase = phase;
    body.setAttribute("data-phase", phase);
    updateControls();
  }

  /* ---------------- The beads ---------------- */
  // Lays out a pile of beads: bead i sits on the golden-angle spiral, the
  // first in the middle. The croupier takes them back from the outside in,
  // so the last ones left are those in the middle.
  function layBeads(count) {
    el.beads.textContent = "";
    var spread = 0.4 / Math.sqrt(count);
    for (var i = 0; i < count; i++) {
      var radius = spread * Math.sqrt(i + 0.5);
      var angle = i * GOLDEN_ANGLE;
      var bead = document.createElement("span");
      bead.className = "bead";
      bead.style.left = (50 + radius * 100 * Math.cos(angle)).toFixed(2) + "%";
      bead.style.top = (50 + radius * 100 * Math.sin(angle)).toFixed(2) + "%";
      el.beads.appendChild(bead);
    }
  }

  // The bowl and the words under it: the beads waiting, nothing while they
  // are counted, then what they left.
  function renderBowl() {
    var shown = state.shown;
    el.bowl.classList.toggle("open", !!shown);
    el.bowlResult.textContent = shown && shown.result ? String(shown.result) : "";
    el.bowlResult.className = "bowl-result" + (shown && shown.result ? " result-" + shown.result : "");
    el.bowlCount.textContent = !shown ? t("bowlIdle") : shown.result ? t("bowlCount", { beads: shown.beads, left: shown.result }) : "";
    el.bowl.setAttribute("aria-label", shown && shown.result ? t("bowlCount", { beads: shown.beads, left: shown.result }) : t("bowlLabel"));
  }

  // The bowl is lifted and the beads are taken away four at a time until
  // one to four are left.
  async function countBeads(beads) {
    state.shown = { beads: beads, result: null };
    layBeads(beads);
    renderBowl();
    Sound.shuffle();
    await pause(420);
    var nodes = Array.prototype.slice.call(el.beads.children);
    var left = Engine.remainderOf(beads);
    for (var end = nodes.length; end > left; end -= 4) {
      nodes.slice(end - 4, end).forEach(function (bead) { bead.classList.add("taken"); });
      Sound.chip(end % 3);
      await pause(reducedMotion.matches ? 0 : 70);
    }
    nodes.slice(0, left).forEach(function (bead) { bead.classList.add("left"); });
    state.shown.result = left;
    renderBowl();
    await pause(360);
  }

  // A pile brought back after a reload is shown counted, at once.
  function showCounted(beads) {
    layBeads(beads);
    var left = Engine.remainderOf(beads);
    Array.prototype.forEach.call(el.beads.children, function (bead, index) { bead.classList.add(index < left ? "left" : "taken"); });
    state.shown = { beads: beads, result: left };
    renderBowl();
  }

  /* ---------------- The round ---------------- */
  // Credits the account, records the round, keeps the box and the result,
  // and closes the saved round.
  function commitRound(settlement) {
    var bankroll = Store.normalizeBankroll(account.read("bankroll", state.bankroll));
    bankroll = Math.min(Store.MAX_BANKROLL, bankroll + settlement.paid);
    var stats = Store.recordRound(account.read("stats", state.stats), settlement);
    var history = Store.addHistory(account.read("history", state.history), settlement.result);
    account.write("bankroll", bankroll);
    account.write("stats", stats);
    account.write("box", settlement.box);
    account.write("history", history);
    account.remove("round");
    state.bankroll = bankroll;
    state.stats = stats;
    state.box = settlement.box;
    state.history = history;
    state.lastWin = settlement.paid;
    renderStats();
    renderBox();
    renderResults();
  }

  // A round left behind by a reload, a crash or a closed tab is settled with
  // the very pile it was dealt, against the box as it stands. One that
  // cannot be trusted is voided and its stake returned.
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
    var settlement = Engine.settle(round.bets, Engine.remainderOf(round.beads), Engine.normalizeBox(account.read("box", 0)));
    commitRound(settlement);
    showCounted(round.beads);
    toast(t("roundRestored", { result: resultText(settlement, round.beads) }), settlement.net > 0 ? "win" : "");
    return { settlement: settlement };
  }

  function open() {
    if (!canBet()) return;
    var bets = Engine.normalizeBets(state.bets);
    var stake = Engine.totalStake(bets);
    if (!stake) { toast(t("betRequired"), "lose"); return; }
    Sound.unlock();
    state.busy = true;
    updateControls();
    account.run(function () {
      recoverRound();
      var elsewhere = account.roundsElsewhere();
      if (elsewhere.length) return { elsewhere: elsewhere[0] };
      var bankroll = Store.normalizeBankroll(account.read("bankroll", Store.START_BANKROLL));
      if (stake > bankroll) {
        state.bankroll = bankroll;
        return { insufficient: true };
      }
      var round = { id: Store.newRoundId(), bets: bets, beads: Engine.drawBeads(), at: Date.now() };
      // The bets, the stake and the pile are saved before the bowl is
      // lifted, so a reload can neither take another pile nor refund a loss.
      account.write("round", Store.roundSnapshot(round));
      account.write("bankroll", bankroll - stake);
      account.write("lastBets", bets);
      state.bankroll = bankroll - stake;
      state.lastBets = bets;
      state.actions = [];
      return playRound(round);
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

  function clearMarks() {
    el.layout.querySelectorAll(".lit, .returned").forEach(function (node) { node.classList.remove("lit", "returned"); });
  }

  async function playRound(round) {
    setPhase("counting");
    state.bets = Object.assign({}, round.bets);
    renderBets(null);
    clearMarks();
    setBanner("counting");
    await countBeads(round.beads);

    var settlement = Engine.settle(round.bets, Engine.remainderOf(round.beads), state.box);
    setBanner("resultLine", { beads: round.beads, left: settlement.result }, resultSub(settlement),
      settlement.net > 0 ? "win" : settlement.paid ? "" : "lose");
    setPhase("settling");
    await settleChips(settlement);
    commitRound(settlement);
    if (settlement.paid) {
      Sound.chipsPush();
      flashBalance();
    }
    state.bets = {};
    renderBets(null);
    setPhase("betting");
    restakeIfBroke();
  }

  // Every spot the number wins lights up and its stack grows to all it
  // returns, a spot that is returned keeps its chips, and losing chips are
  // swept away.
  async function settleChips(settlement) {
    Engine.BETS.forEach(function (key) {
      var outcome = Engine.resultOf(key, settlement.result);
      spotFor(key).classList.toggle("lit", outcome === "win");
      spotFor(key).classList.toggle("returned", outcome === "push");
    });
    settlement.lines.forEach(function (line) {
      var holder = spotFor(line.key).querySelector(".spot-stack");
      var stack = holder.querySelector(".bet-chip");
      if (!stack) return;
      if (line.result === "lose") stack.classList.add("losing");
      if (line.result !== "win") return;
      holder.textContent = "";
      holder.appendChild(Chips.stack(document, Math.floor(line.units / Engine.UNITS), "bet-chip payout winning"));
    });
    if (settlement.paid) Sound.payout();
    if (settlement.net > 0) Sound.win();
    else if (!settlement.paid) Sound.lose();
    else Sound.push();
    await pause(settlement.lines.length ? 1300 : 600);
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
      var spot = event.target.closest(".spot");
      if (spot) addChip(spot.getAttribute("data-bet"));
    });
    el.layout.addEventListener("contextmenu", function (event) {
      var spot = event.target.closest(".spot");
      if (!spot) return;
      event.preventDefault();
      removeChip(spot.getAttribute("data-bet"));
    });
    el.layout.addEventListener("keydown", function (event) {
      var spot = event.target.closest(".spot");
      if (spot && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        removeChip(spot.getAttribute("data-bet"));
      }
    });

    el.btn.undo.addEventListener("click", undo);
    el.btn.clear.addEventListener("click", clearBets);
    el.btn.double.addEventListener("click", doubleBets);
    el.btn.rebet.addEventListener("click", rebet);
    el.btn.open.addEventListener("click", open);
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
        renderBox();
        renderResults();
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
    var lower = key.length === 1 ? key.toLowerCase() : key;
    if (event.ctrlKey) {
      if (lower === "z") { event.preventDefault(); undo(); }
      return;
    }
    if ((key === " " || key === "Enter") && !onControl) { event.preventDefault(); open(); return; }
    if (key === "Backspace" && !onControl) { event.preventDefault(); undo(); return; }
    if (lower >= "1" && lower <= "6") { selectChip(TRAY[Number(lower) - 1]); return; }
    switch (lower) {
      case "o": addChip("odd"); break;
      case "e": addChip("even"); break;
      case "z": undo(); break;
      case "c": clearBets(); break;
      case "d": doubleBets(); break;
      case "r": rebet(); break;
      case "m": setSound(!soundEnabled); break;
    }
  }

  /* ---------------- Start ---------------- */
  function translateAll() {
    I18n.apply(document);
    applyLanguageUI();
    applySoundUI();
    renderBanner();
    renderBets(null);
    renderBox();
    renderBowl();
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
    renderResults();
    translateAll();
    bindControls();
    if (!account.shared) toast(t("temporaryAccount"));
    updateControls();
    renderBankroll();

    // A round left unfinished by a reload, crash or closed tab is settled now.
    if (account.read("round", null) != null) {
      state.busy = true;
      updateControls();
      account.run(recoverRound, 2500).then(function () {
        state.busy = false;
        renderBankroll();
        updateControls();
        restakeIfBroke();
      }, function () { state.busy = false; updateControls(); });
    } else {
      restakeIfBroke();
    }
  }

  init();
})();
