/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 18 — the table
   Chips on the layout, the roll of three dice and what it pays. Chips
   are only chips until the dice are thrown; then the bets, the stake
   and the dice are saved before the dice are shown, so a reload
   settles the very same roll.
   ========================================================= */
(function () {
  "use strict";

  var global = window;
  var Pit = global.Pit;
  var Engine = global.SicBoEngine;
  var Store = global.SicBoStore;
  var Chips = global.ChipArt;
  var Sound = global.Sound;
  var PitTally = global.PitTally;
  if (!Pit || !Engine || !Store || !Chips || !Sound || !PitTally) {
    throw new Error("Table modules must load before game.js");
  }

  // The chips this table offers, as its tray shows them; the smallest is the table minimum.
  var TRAY = Chips.trayValues(document.getElementById("chipTray"));
  var MIN_CHIP = TRAY[0];
  var PACE = { fast: 0.55, normal: 1, cinematic: 1.45 };
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
    // Chips on the layout for the next roll; they leave the balance with the roll.
    bets: {},
    actions: [],
    lastBets: {},
    chip: 25,
    phase: "betting",
    busy: false,
    lastWin: 0,
    banner: { key: "placeBets", params: null, sub: null, tone: "" }
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
    dice: $("dice"),
    history: $("history"),
    tableMin: $("tableMin"),
    tableMax: $("tableMax"),
    layout: $("layout"),
    chipTray: $("chipTray"),
    layoutTotal: $("layoutTotal"),
    lastWin: $("lastWin"),
    toast: $("toast"),
    settings: $("settingsModal"),
    stats: $("statsModal"),
    statsLead: $("statsLead"),
    btn: {
      undo: $("btnUndo"), clear: $("btnClear"), rebet: $("btnRebet"), roll: $("btnRoll"),
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
  // The name of any bet on the layout.
  function betName(key) {
    var numbers = Engine.numbersOf(key);
    switch (Engine.kindOf(key)) {
      case "total": return t("totalName", { number: numbers[0] });
      case "triple": return t("tripleName", { number: numbers[0] });
      case "double": return t("doubleName", { number: numbers[0] });
      case "combo": return t("comboName", { first: numbers[0], second: numbers[1] });
      case "single": return t("singleName", { number: numbers[0] });
      default: return t(key + "Name");
    }
  }

  // What a spot pays, as printed on it.
  function payWords(value) {
    return value === "single" ? t("paySingle") : t("payTo", { n: value });
  }

  // The call for a roll: the total and its size, or the triple.
  function rollCall(result) {
    if (result.triple) return { key: "rollTriple", params: { number: result.dice[0] } };
    return { key: "rollCall", params: { total: result.total, size: result.total <= 10 ? "sizeSmall" : "sizeBig" } };
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

  // Parameters named amount are dollars and size names a word, both drawn in
  // the language shown.
  function localize(params) {
    if (!params) return params;
    var out = {};
    Object.keys(params).forEach(function (key) {
      out[key] = key === "amount" ? money(params[key]) : key === "size" ? t(params[key]) : params[key];
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

  // Puts down again the bets of the last roll.
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
      var pays = payWords(spot.querySelector(".spot-pay").getAttribute("data-pay")).toLowerCase();
      spot.setAttribute("aria-label", t("spotLabel", { name: betName(key), pays: pays, amount: money(state.bets[key] || 0) }));
    });
    renderBankroll();
  }

  // The odds printed on each spot, in the language shown.
  function renderPays() {
    el.layout.querySelectorAll(".spot-pay[data-pay]").forEach(function (node) {
      node.textContent = payWords(node.getAttribute("data-pay"));
    });
  }

  function showDice(dice) {
    el.dice.querySelectorAll(".die").forEach(function (die, index) { die.setAttribute("data-face", String(dice[index])); });
    el.dice.setAttribute("aria-label", t("diceLabel", { first: dice[0], second: dice[1], third: dice[2] }));
  }

  function renderHistory() {
    el.history.textContent = "";
    state.history.slice(-12).reverse().forEach(function (dice, index) {
      var li = document.createElement("li");
      var total = dice[0] + dice[1] + dice[2];
      var triple = Engine.isTriple(dice);
      var size = triple ? "triple" : total <= 10 ? "small" : "big";
      li.className = size + (index === 0 ? " latest" : "");
      li.textContent = String(total);
      li.title = t(size === "triple" ? "rollTriple" : "rollCall", { number: dice[0], total: total, size: t(size === "small" ? "sizeSmall" : "sizeBig") });
      el.history.appendChild(li);
    });
  }

  function renderLimits() {
    el.tableMin.textContent = money(MIN_CHIP);
    el.tableMax.textContent = money(Engine.LIMITS.even);
  }

  function renderStats() {
    var s = state.stats;
    var net = s.returned - s.wagered;
    $("stRolls").textContent = fmt(s.rolls);
    $("stWinRate").textContent = (s.rolls ? Math.round(s.winningRolls / s.rolls * 100) : 0) + "%";
    $("stTriples").textContent = fmt(s.triples);
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
    el.btn.roll.disabled = !betting || !hasBets;
    el.btn.roll.classList.toggle("ready", betting && hasBets);
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

  /* ---------------- The roll ---------------- */
  // Credits the account, records the roll and closes the round.
  function commitRoll(result) {
    var bankroll = Store.normalizeBankroll(account.read("bankroll", state.bankroll));
    bankroll = Math.min(Store.MAX_BANKROLL, bankroll + result.returned);
    var stats = Store.recordRoll(account.read("stats", state.stats), result);
    var table = Store.normalizeTable(account.read("table", null));
    var history = table.history.concat([result.dice]).slice(-Store.HISTORY_LIMIT);
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
    var call = rollCall(result);
    var words = t(call.key, localize(call.params));
    return result.returned ? words + ". " + t("winLine", { amount: money(result.returned) }) : words;
  }

  // A roll left on its way by a reload, a crash or a closed tab is settled
  // with the very dice it was thrown with. A round that cannot be trusted is
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
    var result = Engine.resolve(round.bets, round.dice);
    commitRoll(result);
    showDice(round.dice);
    toast(t("roundRestored", { result: resultText(result) }), result.returned ? "win" : "");
    return { result: result };
  }

  function roll() {
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
      var round = { id: Store.newRoundId(), bets: bets, dice: Engine.rollDice(), wager: wager, at: Date.now() };
      // The bets, the stake and the dice are saved before the dice are
      // shown, so a reload can neither throw again nor refund a losing bet.
      account.write("round", Store.roundSnapshot(round));
      account.write("bankroll", bankroll - wager);
      account.write("lastBets", bets);
      state.bankroll = bankroll - wager;
      state.lastBets = bets;
      state.actions = [];
      return playRoll(round);
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

  // The dice shake under the dome and land on the roll.
  async function throwDice(dice) {
    el.dice.classList.remove("rolling");
    void el.dice.offsetWidth;
    el.dice.classList.add("rolling");
    Sound.shuffle();
    var shown = 0;
    while (!reducedMotion.matches && shown < 7) {
      showDice([Engine.randomInt(6) + 1, Engine.randomInt(6) + 1, Engine.randomInt(6) + 1]);
      await pause(90);
      shown++;
    }
    showDice(dice);
    el.dice.classList.remove("rolling");
    Sound.chip(3);
    await pause(260);
  }

  async function playRoll(round) {
    setPhase("rolling");
    renderBets(null);
    setBanner("diceRolling");
    await throwDice(round.dice);

    var result = Engine.resolve(round.bets, round.dice);
    var call = rollCall(result);
    var sub = result.returned ? { key: "winLine", params: { amount: result.returned } } : { key: "lostLine", params: { amount: result.lost } };
    setBanner(call.key, call.params, sub, result.returned > result.stake ? "win" : result.returned ? "" : "lose");
    setPhase("settling");
    await showResult(result);
    commitRoll(result);
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

  // Every spot the dice win lights up; losing stacks are swept away and
  // winners are paid beside their stake.
  async function showResult(result) {
    Engine.winners(result.dice).forEach(function (key) { spotFor(key).classList.add("lit"); });
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

  /* ---------------- Statistics ---------------- */
  // How often each result came in the last rolls the table remembers.
  function percentText(fraction) {
    return (fraction * 100).toLocaleString(I18n.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
  }

  function sinceText(rounds) {
    if (rounds === null) return t("statsNever");
    return rounds === 0 ? t("statsLatest") : t("statsAgo", { n: fmt(rounds) });
  }

  function renderTallies() {
    var list = state.history;
    el.statsLead.textContent = list.length ? t("statsLead", { n: fmt(list.length) }) : t("statsEmpty");
    var specs = Engine.statSpecs();
    var words = function (name) { return { name: name, percent: percentText, since: sinceText }; };
    PitTally.draw($("tallyTotals"), PitTally.rows(list, specs.totals), words(function (key) { return String(key); }));
    PitTally.draw($("tallyFaces"), PitTally.rows(list, specs.faces), words(function (key) { return t("singleName", { number: key }); }));
    PitTally.draw($("tallyGroups"), PitTally.rows(list, specs.groups), words(function (key) { return t(key === "triple" ? "anyTripleName" : key + "Name"); }));
  }

  function openStats() {
    if (!el.settings.hidden) return;
    dialogReturn = document.activeElement;
    renderTallies();
    el.stats.hidden = false;
    el.stats.querySelector(".modal-head [data-close]").focus();
  }

  function closeStats() {
    if (el.stats.hidden) return;
    el.stats.hidden = true;
    if (dialogReturn && typeof dialogReturn.focus === "function") dialogReturn.focus();
    dialogReturn = null;
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
    el.btn.roll.addEventListener("click", roll);
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
    $("statsBtn").addEventListener("click", openStats);
    el.stats.querySelectorAll("[data-close]").forEach(function (node) { node.addEventListener("click", closeStats); });
    el.stats.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { event.preventDefault(); closeStats(); return; }
      if (event.key !== "Tab") return;
      var items = focusables(el.stats);
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
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
    if (!el.settings.hidden || !el.stats.hidden) return;
    var target = event.target;
    var typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    if (typing) return;
    var onControl = target && target.closest && target.closest("button, a, summary, [role='button']");
    var key = event.key;
    if (event.ctrlKey) {
      if (key.toLowerCase() === "z") { event.preventDefault(); undo(); }
      return;
    }
    if ((key === " " || key === "Enter") && !onControl) { event.preventDefault(); roll(); return; }
    if (key === "Backspace" && !onControl) { event.preventDefault(); undo(); return; }
    var lower = key.length === 1 ? key.toLowerCase() : key;
    if (lower >= "1" && lower <= "6") { selectChip(TRAY[Number(lower) - 1]); return; }
    switch (lower) {
      case "s": addChip("small"); break;
      case "i": openStats(); break;
      case "b": addChip("big"); break;
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
    if (state.history.length) showDice(state.history[state.history.length - 1]);
    translateAll();
    bindControls();
    if (!account.shared) toast(t("temporaryAccount"));
    updateControls();

    // A roll left on its way by a reload, crash or closed tab is settled now.
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
