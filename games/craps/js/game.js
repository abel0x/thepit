/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 7 — the table
   Bets on the layout, the roll, the puck and what every roll does to
   the bets. New chips are only chips until the dice are thrown; then
   they, the bets already standing and the dice themselves are saved
   before the dice are shown, so a reload settles the very same roll.
   ========================================================= */
(function () {
  "use strict";

  var global = window;
  var Pit = global.Pit;
  var Engine = global.CrapsEngine;
  var Store = global.CrapsStore;
  var Chips = global.ChipArt;
  var Sound = global.Sound;
  if (!Pit || !Engine || !Store || !Chips || !Sound) {
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
    point: null,
    history: [],
    // The different points the shooter has made since the last seven-out.
    made: [],
    // Bets standing on the layout, already out of the balance.
    standing: {},
    // Chips put down since the last roll; they leave the balance with the roll.
    pending: {},
    actions: [],
    lastBets: {},
    chip: 25,
    phase: "betting",
    busy: false,
    lastWin: 0,
    banner: { key: "comeOutLine", params: null, sub: null, tone: "" }
  };

  function readAccountState() {
    var snap = account.snapshot();
    state.bankroll = snap.bankroll;
    state.stats = snap.stats;
    state.point = snap.table.point;
    state.history = snap.table.history;
    state.made = snap.table.made;
    state.lastBets = snap.lastBets;
    state.standing = snap.round && !snap.round.roll ? snap.round.bets : {};
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
    tablePoint: $("tablePoint"),
    layout: $("layout"),
    chipTray: $("chipTray"),
    layoutTotal: $("layoutTotal"),
    pendingTotal: $("pendingTotal"),
    lastWin: $("lastWin"),
    toast: $("toast"),
    settings: $("settingsModal"),
    hopPanel: $("hopPanel"),
    hopTotal: $("hopTotal"),
    btn: {
      undo: $("btnUndo"), clear: $("btnClear"), rebet: $("btnRebet"), roll: $("btnRoll"),
      sound: $("soundToggle"), settings: $("settingsBtn"), resetStats: $("btnResetStats"),
      hops: $("btnHops"), hopsClose: $("btnHopsClose")
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
    var n = Engine.numberOf(key);
    if (/^place/.test(key)) return t("placeName", { number: n });
    if (/^comeOdds/.test(key)) return t("comeOddsName", { number: n });
    if (/^dontComeOdds/.test(key)) return t("dontComeOddsName", { number: n });
    if (/^come\d/.test(key)) return t("comeOnName", { number: n });
    if (/^dontCome\d/.test(key)) return t("dontComeOnName", { number: n });
    if (/^hard/.test(key)) return t("hardName", { number: n });
    if (/^hop/.test(key)) return t("hopBetName", { dice: Engine.hopDice(key).join("-") });
    return t(key + "Name");
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

  function idleBanner() {
    if (state.point) setBanner("pointLine", { point: state.point });
    else setBanner("comeOutLine");
  }

  // The stickman's call for a roll.
  function rollCall(result) {
    var total = result.total;
    if (result.comeOut) {
      if (total === 7 || total === 11) return { key: "naturalCall", params: { total: total } };
      if (total === 2 || total === 3 || total === 12) return { key: "crapsCall", params: { total: total } };
      return { key: "pointSet", params: { total: total, point: total } };
    }
    if (result.pointMade) return { key: "pointMade", params: { total: total } };
    if (result.sevenOut) return { key: "sevenOut", params: null };
    return { key: result.hard && Engine.HARDS.indexOf(total) !== -1 ? "rollHard" : "rollEasy", params: { total: total } };
  }

  /* ---------------- Bets ---------------- */
  function pendingTotal() { return Engine.totalStake(state.pending); }
  function standingTotal() { return Engine.totalStake(state.standing); }
  function available() { return state.bankroll - pendingTotal(); }
  function canBet() { return state.phase === "betting" && !state.busy; }

  // Standing bets and new chips together, as the layout shows them.
  function combined() {
    var all = Object.assign({}, state.standing);
    Object.keys(state.pending).forEach(function (key) { all[key] = (all[key] || 0) + state.pending[key]; });
    return all;
  }

  function applyAction(changes) {
    if (!changes.length) return;
    changes.forEach(function (change) {
      if (change.after > 0) state.pending[change.key] = change.after;
      else delete state.pending[change.key];
    });
    state.actions.push(changes);
    renderBets(changes.map(function (change) { return change.key; }));
    updateControls();
  }

  var REFUSALS = { comeOutOnly: "comeOutOnly", pointOnly: "pointOnly", oddsNeedBet: "oddsNeedBet", travels: "travels", fireNewShooter: "fireNewShooter" };

  function addChip(key) {
    if (!canBet()) return;
    var all = combined();
    var refusal = Engine.canAdd(key, state.point, all, state.made);
    if (refusal === "limit") { toast(t("tableLimit", { amount: money(Engine.maxBet(key, state.point, all)) }), "lose"); return; }
    if (refusal) { if (REFUSALS[refusal]) toast(t(REFUSALS[refusal]), "lose"); return; }
    var room = Engine.maxBet(key, state.point, all) - (all[key] || 0);
    var amount = Math.min(state.chip, room);
    if (amount > available()) { toast(t("insufficientFunds"), "lose"); return; }
    Sound.unlock();
    var current = state.pending[key] || 0;
    applyAction([{ key: key, before: current, after: current + amount }]);
    Sound.chip(Object.keys(state.pending).length);
    if (amount < state.chip) toast(t("tableLimit", { amount: money(Engine.maxBet(key, state.point, all)) }), "lose");
  }

  // Takes back new chips first; a standing bet that is not a contract comes
  // down whole, back to the balance.
  function removeChip(key) {
    if (!canBet()) return;
    if (state.pending[key]) {
      var current = state.pending[key];
      applyAction([{ key: key, before: current, after: current - Math.min(current, state.chip) }]);
      Sound.chip(1);
      return;
    }
    if (!state.standing[key]) return;
    if (!Engine.canRemove(key, state.point, state.made)) { toast(t("contractBet"), "lose"); return; }
    takeDown(key);
  }

  function takeDown(key) {
    state.busy = true;
    updateControls();
    account.run(function () {
      var round = Store.normalizeRound(account.read("round", null));
      if (!round || round.roll || !round.bets[key]) return { stale: true };
      var amount = round.bets[key];
      delete round.bets[key];
      // Odds cannot stand without their bet.
      Object.keys(round.bets).forEach(function (other) {
        if (Engine.kindOf(other) === "lineOdds" || Engine.kindOf(other) === "comeOdds") {
          var max = Engine.maxBet(other, round.point, round.bets);
          if (round.bets[other] > max) {
            amount += round.bets[other] - max;
            if (max) round.bets[other] = max;
            else delete round.bets[other];
          }
        }
      });
      var bankroll = Math.min(Store.MAX_BANKROLL, Store.normalizeBankroll(account.read("bankroll", state.bankroll)) + amount);
      account.write("bankroll", bankroll);
      if (Object.keys(round.bets).length) account.write("round", Store.roundSnapshot(round));
      else account.remove("round");
      state.bankroll = bankroll;
      state.standing = round.bets;
      return { amount: amount };
    }, 900).then(function (outcome) {
      state.busy = false;
      if (outcome && outcome.busy) toast(t("accountBusy"), "lose");
      if (outcome && outcome.amount) {
        toast(t("takenDown", { name: betName(key), amount: money(outcome.amount) }));
        Sound.chipsPush();
      }
      if (outcome && outcome.stale) readAccountState();
      renderBets(null);
      updateControls();
    });
  }

  function undo() {
    if (!canBet() || !state.actions.length) return;
    var changes = state.actions.pop();
    changes.forEach(function (change) {
      if (change.before > 0) state.pending[change.key] = change.before;
      else delete state.pending[change.key];
    });
    renderBets(changes.map(function (change) { return change.key; }));
    updateControls();
    Sound.chip(2);
  }

  function clearBets() {
    if (!canBet() || !pendingTotal()) return;
    applyAction(Object.keys(state.pending).map(function (key) { return { key: key, before: state.pending[key], after: 0 }; }));
    Sound.chipsPush();
  }

  // Puts down again the new bets of the last roll that the layout takes now.
  function rebet() {
    if (!canBet() || pendingTotal()) return;
    var bets = Engine.normalizeBets(state.lastBets);
    var changes = [];
    var all = combined();
    Object.keys(bets).forEach(function (key) {
      if (Engine.canAdd(key, state.point, all, state.made)) return;
      var amount = Math.min(bets[key], Engine.maxBet(key, state.point, all) - (all[key] || 0));
      if (amount > 0) {
        changes.push({ key: key, before: 0, after: amount });
        all[key] = (all[key] || 0) + amount;
      }
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
    el.layoutTotal.textContent = fmt(standingTotal() + pendingTotal());
    el.pendingTotal.textContent = fmt(pendingTotal());
    el.lastWin.textContent = fmt(state.lastWin);
    body.setAttribute("data-wager", String(standingTotal() + pendingTotal()));
  }

  function flashBalance() {
    el.balancePill.classList.remove("win-flash");
    void el.balancePill.offsetWidth;
    el.balancePill.classList.add("win-flash");
  }

  function payText(spot) {
    var pay = spot.querySelector(".spot-pay");
    return pay ? pay.textContent.toLowerCase() : t("payTrueOdds").toLowerCase();
  }

  // Draws the stacks on every bet; freshly placed stacks drop in.
  function renderBets(changedKeys) {
    var all = combined();
    Engine.BETS.forEach(function (key) {
      var holder = holderFor(key);
      if (!holder) return;
      holder.textContent = "";
      if (all[key]) {
        var placed = changedKeys && changedKeys.indexOf(key) !== -1;
        holder.appendChild(Chips.stack(document, all[key], "bet-chip" + (placed ? " placed" : "") + (state.pending[key] && !state.standing[key] ? " pending" : "")));
      }
    });
    // Odds spots on a number open once a come bet stands there; with a
    // point on, an empty number takes a put bet.
    Engine.POINTS.forEach(function (n) {
      [["comeOdds", "come"], ["dontComeOdds", "dontCome"]].forEach(function (pair) {
        var odds = el.layout.querySelector('.mini-spot[data-bet="' + pair[0] + n + '"]');
        odds.hidden = !all[pair[1] + n] && !all[pair[0] + n];
      });
      el.layout.querySelector('.put-spot[data-bet="come' + n + '"]').hidden = !state.point || !!all["come" + n];
    });
    el.layout.querySelectorAll("[data-bet]").forEach(function (spot) {
      var key = spot.getAttribute("data-bet");
      var put = spot.classList.contains("put-spot");
      var name = put ? t("putName", { number: Engine.numberOf(key) }) : betName(key);
      var pays = put ? t("payEven").toLowerCase() : payText(spot);
      // The words printed on the spot, then what they leave out, then the bet.
      spot.setAttribute("aria-label", I18n.labelFor(spot, [name, pays, t("spotBet", { amount: money(all[key] || 0) })]));
    });
    // The hop button carries what the hop bets hold while their panel is shut.
    var hops = Engine.HOPS.reduce(function (sum, key) { return sum + (all[key] || 0); }, 0);
    el.hopTotal.setAttribute("data-i18n", hops ? "hopsOn" : "payHop");
    el.hopTotal.textContent = hops ? t("hopsOn", { amount: money(hops) }) : t("payHop");
    el.btn.hops.classList.toggle("has-bets", hops > 0);
    renderBankroll();
  }

  // The Fire Bet lights every point the shooter has made.
  function renderFire() {
    el.layout.querySelectorAll(".fire-points [data-made]").forEach(function (node) {
      node.classList.toggle("lit", state.made.indexOf(Number(node.getAttribute("data-made"))) !== -1);
    });
  }

  function toggleHops(open) {
    var show = open == null ? el.hopPanel.hidden : open;
    el.hopPanel.hidden = !show;
    el.btn.hops.setAttribute("aria-expanded", String(show));
    if (show) {
      var first = el.hopPanel.querySelector(".spot-hop");
      if (first) first.focus();
    }
  }

  function renderNames() {
    el.layout.querySelectorAll(".spot-name[data-name]").forEach(function (node) {
      node.textContent = t(node.getAttribute("data-name"), { number: node.getAttribute("data-i18n-number") });
    });
  }

  function renderPuck() {
    body.setAttribute("data-point", state.point ? String(state.point) : "off");
    renderFire();
    el.layout.querySelectorAll(".number-box").forEach(function (box) {
      box.classList.toggle("is-point", Number(box.getAttribute("data-number")) === state.point);
    });
    if (state.point) {
      el.tablePoint.removeAttribute("data-i18n");
      el.tablePoint.textContent = String(state.point);
    } else {
      el.tablePoint.setAttribute("data-i18n", "puckOff");
      el.tablePoint.textContent = t("puckOff");
    }
  }

  function showDice(dice) {
    el.dice.querySelectorAll(".die").forEach(function (die, index) { die.setAttribute("data-face", String(dice[index])); });
    el.dice.setAttribute("aria-label", t("diceLabel", { first: dice[0], second: dice[1] }));
  }

  function renderHistory() {
    el.history.textContent = "";
    state.history.slice(-12).reverse().forEach(function (dice, index) {
      var li = document.createElement("li");
      var total = dice[0] + dice[1];
      li.textContent = String(total);
      li.className = (total === 7 ? "seven" : "") + (dice[0] === dice[1] ? " pair" : "") + (index === 0 ? " latest" : "");
      el.history.appendChild(li);
    });
  }

  function renderLimits() {
    el.tableMin.textContent = money(MIN_CHIP);
    el.tableMax.textContent = money(Engine.LIMITS.line);
  }

  function renderStats() {
    var s = state.stats;
    var net = s.returned - s.wagered;
    $("stRolls").textContent = fmt(s.rolls);
    $("stPointsMade").textContent = fmt(s.pointsMade);
    $("stSevenOuts").textContent = fmt(s.sevenOuts);
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
    var hasNew = pendingTotal() > 0;
    el.btn.undo.disabled = !betting || !state.actions.length;
    el.btn.clear.disabled = !betting || !hasNew;
    el.btn.rebet.disabled = !betting || hasNew || !Object.keys(state.lastBets).length;
    el.btn.roll.disabled = !betting || (!hasNew && !standingTotal());
    el.btn.roll.classList.toggle("ready", betting && (hasNew || standingTotal() > 0));
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
  // Credits the account, records the roll and keeps what stays on the layout.
  function commitRoll(round, result) {
    var bankroll = Store.normalizeBankroll(account.read("bankroll", state.bankroll));
    bankroll = Math.min(Store.MAX_BANKROLL, bankroll + result.returned);
    var stats = Store.recordRoll(account.read("stats", state.stats), result, round.wager);
    var table = Store.normalizeTable(account.read("table", null));
    var history = table.history.concat([result.dice]).slice(-Store.HISTORY_LIMIT);
    account.write("bankroll", bankroll);
    account.write("stats", stats);
    account.write("table", { point: result.point, history: history, made: result.made });
    if (Object.keys(result.bets).length) {
      account.write("round", Store.roundSnapshot({ id: round.id, point: result.point, made: result.made, bets: result.bets, roll: null, at: round.at }));
    } else {
      account.remove("round");
    }
    state.bankroll = bankroll;
    state.stats = stats;
    state.point = result.point;
    state.made = result.made;
    state.history = history;
    state.standing = result.bets;
    state.lastWin = result.returned;
    renderStats();
  }

  function resultText(result) {
    var call = rollCall(result);
    var words = t(call.key, call.params);
    return result.returned ? words + ". " + t("winLine", { amount: money(result.returned) }) : words;
  }

  // A roll left on its way by a reload, a crash or a closed tab is settled
  // with the very dice it was thrown with. A round that cannot be trusted is
  // voided and its bets returned.
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
      state.standing = {};
      toast(t("roundVoided"), "lose");
      return { voided: true };
    }
    if (!round.roll) {
      state.standing = round.bets;
      return null;
    }
    var result = Engine.resolve({ point: round.point, bets: round.bets, made: round.made }, round.roll.dice);
    commitRoll(round, result);
    showDice(round.roll.dice);
    toast(t("roundRestored", { result: resultText(result) }), result.returned ? "win" : "");
    return { result: result };
  }

  function roll() {
    if (!canBet()) return;
    var pending = Engine.normalizeBets(state.pending);
    var wager = Engine.totalStake(pending);
    if (!wager && !standingTotal()) { toast(t("minBet"), "lose"); return; }
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
      var table = Store.normalizeTable(account.read("table", null));
      var saved = Store.normalizeRound(account.read("round", null));
      var bets = Object.assign({}, saved ? saved.bets : {});
      Object.keys(pending).forEach(function (key) { bets[key] = (bets[key] || 0) + pending[key]; });
      // A layout another tab changed may no longer take every new chip.
      if (Object.keys(pending).some(function (key) { return bets[key] > Engine.maxBet(key, table.point, bets) && Engine.kindOf(key) !== "comePoint"; })) {
        return { stale: true };
      }
      // So may a shooter who has made a point since the Fire Bet went down.
      if (pending.fire && (table.point || table.made.length)) return { stale: true };
      var round = {
        id: saved ? saved.id : Store.newRoundId(),
        point: table.point,
        made: table.made,
        bets: Engine.normalizeBets(bets),
        roll: { dice: Engine.rollDice() },
        wager: wager,
        at: Date.now()
      };
      // The bets, the new money and the dice are saved before the dice are
      // shown, so a reload can neither throw again nor refund a losing bet.
      account.write("round", Store.roundSnapshot(round));
      account.write("bankroll", bankroll - wager);
      if (wager) account.write("lastBets", pending);
      state.bankroll = bankroll - wager;
      if (wager) state.lastBets = pending;
      state.pending = {};
      state.actions = [];
      state.standing = round.bets;
      return playRoll(round);
    }, 900).then(function (outcome) {
      state.busy = false;
      if (outcome && outcome.busy) toast(t("accountBusy"), "lose");
      if (outcome && outcome.insufficient) toast(t("insufficientFunds"), "lose");
      if (outcome && outcome.elsewhere) toast(t("roundElsewhere", { table: Pit.TABLES[outcome.elsewhere] }), "lose");
      if (outcome && outcome.stale) {
        readAccountState();
        state.pending = {};
        state.actions = [];
      }
      if (state.phase !== "betting") setPhase("betting");
      renderPuck();
      renderBets(null);
      updateControls();
    }, function (error) {
      state.busy = false;
      setPhase("betting");
      toast(String(error && error.message || error), "lose");
    });
  }

  // The dice tumble across the felt and land on the roll.
  async function throwDice(dice) {
    el.dice.classList.remove("rolling");
    void el.dice.offsetWidth;
    el.dice.classList.add("rolling");
    Sound.shuffle();
    var shown = 0;
    while (!reducedMotion.matches && shown < 6) {
      showDice([Engine.randomInt(6) + 1, Engine.randomInt(6) + 1]);
      await pause(90);
      shown++;
    }
    showDice(dice);
    el.dice.classList.remove("rolling");
    Sound.chip(2);
    await pause(240);
  }

  async function playRoll(round) {
    setPhase("rolling");
    renderBets(null);
    setBanner("diceRolling");
    await throwDice(round.roll.dice);

    var result = Engine.resolve({ point: round.point, bets: round.bets, made: round.made }, round.roll.dice);
    var call = rollCall(result);
    var sub = result.returned ? { key: "winLine", params: { amount: result.returned } }
      : result.lost ? { key: "lostLine", params: { amount: result.lost } }
      : { key: "noAction" };
    setBanner(call.key, call.params, sub, result.profit > 0 ? "win" : result.lost ? "lose" : "");
    setPhase("settling");
    await showResult(result);
    commitRoll(round, result);
    if (result.returned) {
      Sound.chipsPush();
      flashBalance();
    }
    renderPuck();
    renderHistory();
    renderBets(null);
    await pause(500);
    setPhase("betting");
    if (state.point) setBanner(call.key, call.params, { key: "pointLine", params: { point: state.point } }, state.banner.tone);
    restakeIfBroke();
  }

  // Losing stacks are swept away, winners are paid beside their stake, and
  // come bets travel to their numbers.
  async function showResult(result) {
    var paid = false;
    result.lines.forEach(function (line) {
      var holder = holderFor(line.key);
      var stack = holder && holder.querySelector(".bet-chip");
      if (!stack) return;
      if (line.result === "lose") stack.classList.add("losing");
      else if (line.result === "win") {
        paid = true;
        var spot = holder.closest(".spot, .number-box");
        if (spot) spot.classList.add("won");
        holder.appendChild(Chips.stack(document, line.profit, "bet-chip payout"));
      } else if (line.result === "push" || line.result === "move") stack.classList.add("collect");
    });
    if (paid) Sound.payout();
    if (result.sevenOut) Sound.lose();
    else if (result.profit > 0) Sound.win();
    await pause(paid || result.lost ? 1000 : 400);
    el.layout.querySelectorAll(".won").forEach(function (node) { node.classList.remove("won"); });
  }

  function restakeIfBroke() {
    if (state.bankroll >= MIN_CHIP || standingTotal() || pendingTotal()) return;
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
  // The bet under a click: a spot, or a come bet standing in a number box.
  function betAt(target) {
    var node = target.closest("[data-bet], [data-stack]");
    return node ? node.getAttribute("data-bet") || node.getAttribute("data-stack") : null;
  }

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
    el.btn.hops.addEventListener("click", function () { toggleHops(); });
    el.btn.hopsClose.addEventListener("click", function () { toggleHops(false); el.btn.hops.focus(); });
    el.hopPanel.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { event.preventDefault(); toggleHops(false); el.btn.hops.focus(); }
    });
    el.layout.addEventListener("contextmenu", function (event) {
      var key = betAt(event.target);
      if (!key) return;
      event.preventDefault();
      removeChip(key);
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
        renderPuck();
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
    if ((key === " " || key === "Enter") && !onControl) { event.preventDefault(); roll(); return; }
    if (key === "Backspace" && !onControl) { event.preventDefault(); undo(); return; }
    var lower = key.length === 1 ? key.toLowerCase() : key;
    if (lower >= "1" && lower <= "6") { selectChip(TRAY[Number(lower) - 1]); return; }
    switch (lower) {
      case "p": addChip("pass"); break;
      case "f": addChip("field"); break;
      case "h": toggleHops(); break;
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
    renderNames();
    renderPuck();
    renderBanner();
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
    renderHistory();
    idleBanner();
    translateAll();
    bindControls();
    if (!account.shared) toast(t("temporaryAccount"));
    updateControls();

    // A roll left on its way by a reload, crash or closed tab is settled now.
    var raw = account.read("round", null);
    if (raw != null && !(Store.normalizeRound(raw) && !Store.normalizeRound(raw).roll)) {
      state.busy = true;
      updateControls();
      account.run(recoverRound, 2500).then(function (outcome) {
        state.busy = false;
        if (outcome && outcome.busy) toast(t("accountBusy"), "lose");
        renderPuck();
        renderHistory();
        renderBets(null);
        if (outcome && outcome.result) idleBanner();
        restakeIfBroke();
        updateControls();
      }, function () { state.busy = false; updateControls(); });
    } else {
      restakeIfBroke();
    }
  }

  init();
})();
