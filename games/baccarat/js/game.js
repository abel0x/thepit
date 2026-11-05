/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 9 — the table
   Betting, the deal, settlement and the scoreboards. Every coup is
   drawn and saved, with its stake already taken, before the first
   card is shown, so a reload settles the same coup instead of a new
   one. The cards are shown face down and turned as at a real table.
   ========================================================= */
(function () {
  "use strict";

  var global = window;
  var Pit = global.Pit;
  var Engine = global.BaccaratEngine;
  var Store = global.BaccaratStore;
  var PitCards = global.PitCards;
  var Chips = global.ChipArt;
  var Sound = global.Sound;
  if (!Pit || !Engine || !Store || !PitCards || !Chips || !Sound) {
    throw new Error("Table modules must load before game.js");
  }

  // The chips this table offers, as its tray shows them; the smallest is the table minimum.
  var TRAY = Chips.trayValues(document.getElementById("chipTray"));
  var MIN_CHIP = TRAY[0];
  var PACE = { fast: 0.55, normal: 1, cinematic: 1.45 };
  var BET_NAMES = {
    player: "playerName", banker: "bankerName", tie: "tieName", playerPair: "playerPairName", bankerPair: "bankerPairName",
    playerDragon: "playerDragonName", bankerDragon: "bankerDragonName"
  };
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
    roads: [],
    shoe: null,
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
    state.roads = snap.roads;
    state.shoe = snap.shoe;
    state.lastBets = snap.lastBets;
    state.box = snap.box;
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
    shoe: $("shoe"),
    shoeCount: $("shoeCount"),
    tableMin: $("tableMin"),
    tableMax: $("tableMax"),
    tableProfile: $("tableProfile"),
    boxSpec: $("boxSpec"),
    boxLabel: $("boxLabel"),
    tableBox: $("tableBox"),
    bankerPay: $("bankerPay"),
    bankerPayRow: $("bankerPayRow"),
    bays: { player: document.querySelector(".bay-player"), banker: document.querySelector(".bay-banker") },
    cards: { player: $("playerCards"), banker: $("bankerCards") },
    totals: { player: $("playerTotal"), banker: $("bankerTotal") },
    spots: $("spots"),
    beadPlate: $("beadPlate"),
    bigRoad: $("bigRoad"),
    roads: $("roads"),
    roadCounts: $("roadCounts"),
    chipTray: $("chipTray"),
    totalBet: $("totalBet"),
    lastWin: $("lastWin"),
    toast: $("toast"),
    settings: $("settingsModal"),
    btn: {
      undo: $("btnUndo"), clear: $("btnClear"), double: $("btnDouble"), rebet: $("btnRebet"),
      deal: $("btnDeal"), sound: $("soundToggle"), settings: $("settingsBtn"), resetStats: $("btnResetStats")
    }
  };

  function spotFor(key) {
    return el.spots.querySelector('[data-bet="' + key + '"]');
  }

  /* ---------------- Timing ---------------- */
  // A pause in the deal, scaled by the chosen pace; nothing waits with
  // reduced motion.
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

  function renderBanner() {
    var b = state.banner;
    el.bannerText.textContent = t(b.key, b.params);
    el.bannerText.removeAttribute("data-i18n");
    el.bannerSub.textContent = b.sub ? t(b.sub.key, b.sub.params) : "";
    el.banner.classList.toggle("flash-win", b.tone === "win");
    el.banner.classList.toggle("flash-lose", b.tone === "lose");
  }

  function resultBanner(coup) {
    if (coup.winner === "player") return { key: "playerWins", params: { player: coup.playerTotal, banker: coup.bankerTotal } };
    if (coup.winner === "banker") return { key: "bankerWins", params: { player: coup.playerTotal, banker: coup.bankerTotal } };
    return { key: "tieWins", params: { total: coup.playerTotal } };
  }

  function resultText(coup) {
    var line = resultBanner(coup);
    return t(line.key, line.params);
  }

  /* ---------------- Bets ---------------- */
  function totalStake() { return Engine.totalStake(state.bets); }
  function available() { return state.bankroll - totalStake(); }
  function canBet() { return state.phase === "betting" && !state.busy; }

  // Applies one action (a list of spot changes) and remembers it for undo.
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
    var current = state.bets[key] || 0;
    var limit = Store.betLimit(key);
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
    if (!canBet() || !totalStake()) return;
    applyAction(Object.keys(state.bets).map(function (key) { return { key: key, before: state.bets[key], after: 0 }; }));
    Sound.chipsPush();
  }

  function doubleBets() {
    if (!canBet() || !totalStake()) return;
    var changes = Object.keys(state.bets).map(function (key) {
      var before = state.bets[key];
      return { key: key, before: before, after: Math.min(before * 2, Store.betLimit(key)) };
    }).filter(function (change) { return change.after > change.before; });
    var extra = changes.reduce(function (sum, change) { return sum + change.after - change.before; }, 0);
    if (!changes.length) { toast(t("tableLimit", { amount: money(Store.betLimit(Object.keys(state.bets)[0])) }), "lose"); return; }
    if (extra > available()) { toast(t("doubleUnavailable"), "lose"); return; }
    applyAction(changes);
    Sound.chipStack(3);
  }

  function rebet() {
    if (!canBet() || totalStake()) return;
    var bets = Engine.normalizeBets(state.lastBets);
    var keys = Object.keys(bets);
    if (!keys.length) return;
    if (Engine.totalStake(bets) > available()) { toast(t("rebetUnavailable"), "lose"); return; }
    applyAction(keys.map(function (key) { return { key: key, before: 0, after: Math.min(bets[key], Store.betLimit(key)) }; }));
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
    var shown = state.bankroll - (state.phase === "betting" ? totalStake() : 0);
    el.bankroll.textContent = fmt(Math.max(0, shown));
    el.totalBet.textContent = fmt(totalStake());
    el.lastWin.textContent = fmt(state.lastWin);
    body.setAttribute("data-wager", String(totalStake()));
    renderBox();
  }

  // The commission box: the cents of commission owed, or the cents of a half
  // dollar owed to the player, until they make a whole dollar.
  function renderBox() {
    var cents = state.box || 0;
    el.boxSpec.hidden = !cents;
    el.boxLabel.textContent = t(cents < 0 ? "boxCreditLabel" : "boxLabel");
    el.tableBox.textContent = "$" + (Math.abs(cents) / 100).toLocaleString(I18n.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function flashBalance() {
    el.balancePill.classList.remove("win-flash");
    void el.balancePill.offsetWidth;
    el.balancePill.classList.add("win-flash");
  }

  function spotLabel(key) {
    var pays = key === "banker" ? el.bankerPay.textContent : spotFor(key).querySelector(".spot-pay").textContent;
    return t("spotLabel", { name: t(BET_NAMES[key]), pays: pays.toLowerCase(), amount: money(state.bets[key] || 0) });
  }

  // Draws the chips on each spot; freshly placed stacks drop in.
  function renderBets(changedKeys) {
    Engine.BETS.forEach(function (key) {
      var spot = spotFor(key);
      var holder = spot.querySelector(".spot-stack");
      holder.textContent = "";
      if (state.bets[key]) {
        var placed = changedKeys && changedKeys.indexOf(key) !== -1;
        holder.appendChild(Chips.stack(document, state.bets[key], "bet-chip" + (placed ? " placed" : "")));
      }
      spot.setAttribute("aria-label", spotLabel(key));
    });
    renderBankroll();
  }

  function applyRules() {
    var classic = state.settings.rules === "classic";
    var payKey = classic ? "payBankerClassic" : "payBankerNoCommission";
    [el.bankerPay, el.bankerPayRow].forEach(function (node) {
      node.setAttribute("data-i18n", payKey);
      node.textContent = t(payKey);
    });
    el.tableProfile.textContent = t(classic ? "profileShortClassic" : "profileShortNoCommission");
    body.setAttribute("data-rules", state.settings.rules);
    document.querySelectorAll(".rule-profile").forEach(function (button) {
      var on = button.getAttribute("data-profile") === state.settings.rules;
      button.classList.toggle("active", on);
      button.setAttribute("aria-checked", String(on));
      button.tabIndex = on ? 0 : -1;
    });
    Engine.BETS.forEach(function (key) { spotFor(key).setAttribute("aria-label", spotLabel(key)); });
  }

  function renderLimits() {
    el.tableMin.textContent = money(MIN_CHIP);
    el.tableMax.textContent = money(Store.betLimit("banker"));
  }

  function renderShoe() {
    var count = state.shoe ? state.shoe.length : Engine.DECKS * 52;
    el.shoeCount.textContent = String(count);
    el.shoe.setAttribute("aria-label", t("shoeCards", { count: fmt(count) }));
  }

  // How many scoreboard columns fit the space each road has.
  function roadColumns(road) {
    var style = global.getComputedStyle(el.roads);
    var bead = parseFloat(style.getPropertyValue("--bead")) || 16;
    return Math.max(4, Math.floor((road.clientWidth + 2) / (bead + 2)));
  }

  function bead(result) {
    var node = document.createElement("span");
    node.className = "bead " + result.winner + (result.playerPair ? " pair-player" : "") + (result.bankerPair ? " pair-banker" : "");
    node.textContent = String(result.winner === "banker" ? result.banker : result.player);
    return node;
  }

  function renderRoads() {
    var results = state.roads;
    // Bead plate: the latest coups, whole columns of six.
    var beadColumns = roadColumns(el.beadPlate);
    var beads = Engine.beadPlate(results);
    var lastColumn = beads.length ? beads[beads.length - 1].col : 0;
    var firstColumn = Math.max(0, lastColumn - beadColumns + 1);
    el.beadPlate.textContent = "";
    beads.forEach(function (entry) {
      if (entry.col < firstColumn) return;
      var node = bead(entry.result);
      node.style.gridColumn = String(entry.col - firstColumn + 1);
      node.style.gridRow = String(entry.row + 1);
      el.beadPlate.appendChild(node);
    });

    // Big road: the latest columns of runs, with ties marked on the win before them.
    var road = Engine.bigRoad(results);
    var bigColumns = roadColumns(el.bigRoad);
    var maxColumn = road.cells.reduce(function (max, cell) { return Math.max(max, cell.col); }, 0);
    var startColumn = Math.max(0, maxColumn - bigColumns + 1);
    el.bigRoad.textContent = "";
    road.cells.forEach(function (cell) {
      if (cell.col < startColumn) return;
      var node = document.createElement("span");
      node.className = "ring " + cell.winner + (cell.ties ? " tied" : "");
      node.style.gridColumn = String(cell.col - startColumn + 1);
      node.style.gridRow = String(cell.row + 1);
      if (cell.ties > 1) {
        var count = document.createElement("span");
        count.className = "tie-count";
        count.textContent = String(cell.ties);
        node.appendChild(count);
      }
      el.bigRoad.appendChild(node);
    });

    var counts = Engine.tally(results);
    var summary = results.length ? t("roadCounts", { player: counts.player, banker: counts.banker, tie: counts.tie }) : t("roadsEmpty");
    el.roadCounts.textContent = summary;
    el.beadPlate.setAttribute("aria-label", t("beadPlate") + ". " + summary);
    el.bigRoad.setAttribute("aria-label", t("bigRoad") + ". " + summary);
  }

  function renderStats() {
    var s = state.stats;
    var net = s.returned - s.wagered;
    $("stCoups").textContent = fmt(s.coups);
    $("stWinRate").textContent = I18n.percent(s.coups ? s.winningCoups / s.coups : 0);
    $("stPlayer").textContent = fmt(s.playerWins);
    $("stBanker").textContent = fmt(s.bankerWins);
    $("stTies").textContent = fmt(s.ties);
    $("stNaturals").textContent = fmt(s.naturals);
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
    var staked = totalStake() > 0;
    el.btn.undo.disabled = !betting || !state.actions.length;
    el.btn.clear.disabled = !betting || !staked;
    el.btn.double.disabled = !betting || !staked;
    el.btn.rebet.disabled = !betting || staked || !Object.keys(state.lastBets).length;
    el.btn.deal.disabled = !betting || !staked;
    el.btn.deal.classList.toggle("ready", betting && staked);
    var avail = available();
    el.chipTray.querySelectorAll(".chip").forEach(function (chip) {
      chip.disabled = !betting;
      chip.classList.toggle("unaffordable", Number(chip.getAttribute("data-value")) > avail);
    });
    el.spots.querySelectorAll(".spot").forEach(function (spot) { spot.disabled = !betting; });
    $("depositAmount").disabled = !betting;
    document.querySelectorAll("[data-deposit], #btnDeposit, .rule-profile, #btnResetStats").forEach(function (node) {
      node.disabled = !betting;
    });
    body.setAttribute("data-busy", String(state.busy || state.phase !== "betting"));
  }

  function setPhase(phase) {
    state.phase = phase;
    body.setAttribute("data-phase", phase);
    updateControls();
  }

  /* ---------------- The cards on the felt ---------------- */
  function clearHands() {
    ["player", "banker"].forEach(function (side) {
      el.cards[side].textContent = "";
      el.totals[side].textContent = "";
      el.bays[side].classList.remove("winner");
    });
    el.spots.querySelectorAll(".spot").forEach(function (spot) { spot.classList.remove("won"); });
  }

  // Lays a card face down in its bay; a third card lies sideways.
  function dealCard(step, third) {
    var node = PitCards.create(step.card, true, true);
    if (third) node.classList.add("third");
    el.cards[step.side].appendChild(node);
    return node;
  }

  function turnCard(node, card) {
    node.querySelector(".card-inner").classList.remove("facedown");
    node.setAttribute("aria-label", PitCards.label(card, false));
  }

  function showTotal(side, cards) {
    var node = el.totals[side];
    node.textContent = String(Engine.total(cards));
    node.classList.remove("bump");
    void node.offsetWidth;
    node.classList.add("bump");
    el.cards[side].setAttribute("aria-label", t("handLabel", { side: t(side + "Name"), total: Engine.total(cards) }));
  }

  // The coup, card by card: four cards face down, the Player's hand turned,
  // then the Banker's, then any third card, each turned as it lands.
  async function showCoup(coup) {
    var nodes = [];
    for (var i = 0; i < 4; i++) {
      nodes.push(dealCard(coup.order[i], false));
      Sound.card();
      await pause(240);
    }
    await pause(260);
    var seen = { player: [], banker: [] };
    for (var side of ["player", "banker"]) {
      coup.order.slice(0, 4).forEach(function (step, index) {
        if (step.side !== side) return;
        turnCard(nodes[index], step.card);
        seen[side].push(step.card);
      });
      Sound.flip();
      showTotal(side, seen[side]);
      await pause(560);
    }
    if (coup.natural) {
      setBanner("naturalLine", { total: Math.max(Engine.total(seen.player), Engine.total(seen.banker)) });
      await pause(420);
    }
    for (var j = 4; j < coup.order.length; j++) {
      var step = coup.order[j];
      setBanner(step.side === "player" ? "playerDrawsLine" : "bankerDrawsLine");
      var node = dealCard(step, true);
      Sound.card();
      await pause(380);
      turnCard(node, step.card);
      seen[step.side].push(step.card);
      Sound.flip();
      showTotal(step.side, seen[step.side]);
      await pause(560);
    }
  }

  // Losing chips are swept away, winning bets are paid beside their stake and
  // pushes stay; the balance changes when the chips come back.
  async function settleChips(settlement) {
    settlement.lines.forEach(function (line) {
      var spot = spotFor(line.key);
      var holder = spot.querySelector(".spot-stack");
      var stack = holder.querySelector(".bet-chip");
      if (!stack) return;
      if (line.result === "lose") {
        stack.classList.add("losing");
      } else if (line.result === "win") {
        spot.classList.add("won");
        holder.appendChild(Chips.stack(document, line.returned - line.amount, "bet-chip payout"));
      }
    });
    if (settlement.returned > 0) Sound.payout();
    await pause(900);
    el.spots.querySelectorAll(".spot-stack .bet-chip").forEach(function (stack) {
      if (!stack.classList.contains("losing")) stack.classList.add("collect");
    });
    if (settlement.returned > 0) {
      Sound.chipsPush();
      renderBankroll();
      flashBalance();
    }
    await pause(640);
  }

  async function collectCards() {
    document.querySelectorAll(".bay-cards .card").forEach(function (node) { node.classList.add("collecting"); });
    await pause(520);
    clearHands();
  }

  /* ---------------- The coup ---------------- */
  // Credits the account, records the coup and closes the saved round.
  function commitSettlement(round, settlement) {
    var bankroll = Store.normalizeBankroll(account.read("bankroll", state.bankroll));
    bankroll = Math.min(Store.MAX_BANKROLL, bankroll + settlement.paid);
    var stats = Store.recordCoup(account.read("stats", state.stats), round.coup, settlement);
    var roads = Store.normalizeRoads(account.read("roads", [])).concat([Engine.result(round.coup)]).slice(-Store.ROADS_LIMIT);
    account.write("bankroll", bankroll);
    account.write("stats", stats);
    account.write("roads", roads);
    account.write("box", settlement.box);
    account.remove("round");
    state.bankroll = bankroll;
    state.stats = stats;
    state.roads = roads;
    state.box = settlement.box;
    state.lastWin = settlement.paid;
    renderStats();
  }

  // A coup left unfinished by a reload, a crash or a closed tab is settled
  // with the very cards it was dealt. One that cannot be trusted is voided
  // and its stake returned.
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
      renderBankroll();
      return { voided: true };
    }
    var settlement = Engine.settle(round.bets, round.coup, round.rules, account.read("box", 0));
    commitSettlement(round, settlement);
    state.lastBets = round.bets;
    account.write("lastBets", round.bets);
    renderRoads();
    renderBankroll();
    toast(t("roundRestored", { result: resultText(round.coup) }), settlement.paid ? "win" : "");
    return { settlement: settlement };
  }

  function deal() {
    if (!canBet()) return;
    var bets = Engine.normalizeBets(state.bets);
    var stake = Engine.totalStake(bets);
    if (!stake) { toast(t("minBet"), "lose"); return; }
    Sound.unlock();
    state.busy = true;
    updateControls();
    var rules = state.settings.rules;
    account.run(function () {
      recoverRound();
      var elsewhere = account.roundsElsewhere();
      if (elsewhere.length) return { elsewhere: elsewhere[0] };
      var bankroll = Store.normalizeBankroll(account.read("bankroll", Store.START_BANKROLL));
      if (stake > bankroll) {
        state.bankroll = bankroll;
        return { insufficient: true };
      }
      var shoe = Store.normalizeShoe(account.read("shoe", null));
      var fresh = null;
      if (Engine.needsNewShoe(shoe)) {
        fresh = Engine.newShoe();
        shoe = fresh.cards;
        // A new shoe starts a new scoreboard.
        account.write("roads", []);
        state.roads = [];
      }
      var coup = Engine.playCoup(function () { return shoe.shift(); });
      var round = { id: Store.newRoundId(), bets: bets, stake: stake, rules: rules, coup: coup, at: Date.now() };
      // The cards and the stake are saved before the first card is shown, so
      // a reload can neither redeal this coup nor refund a losing bet.
      account.write("round", Store.roundSnapshot(round));
      account.write("shoe", Store.shoeCodes(shoe));
      account.write("bankroll", bankroll - stake);
      account.write("lastBets", bets);
      state.bankroll = bankroll - stake;
      state.shoe = shoe;
      state.lastBets = bets;
      return playRound(round, fresh);
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

  async function playRound(round, fresh) {
    setPhase("dealing");
    state.actions = [];
    clearHands();
    renderBankroll();
    renderShoe();
    setBanner("noMoreBets");
    if (fresh) {
      renderRoads();
      el.shoe.classList.remove("shuffling");
      void el.shoe.offsetWidth;
      el.shoe.classList.add("shuffling");
      Sound.shuffle();
      toast(t("newShoe", { count: fresh.burned.length }));
      await pause(800);
    }

    await showCoup(round.coup);

    var coup = round.coup;
    var settlement = Engine.settle(round.bets, coup, round.rules, account.read("box", 0));
    commitSettlement(round, settlement);
    if (coup.winner !== "tie") el.bays[coup.winner].classList.add("winner");
    document.querySelectorAll(coup.winner === "tie" ? ".bay-cards .card" : ".bay-" + coup.winner + " .card").forEach(function (node) {
      node.classList.add("win-glow");
    });
    var line = resultBanner(coup);
    var net = settlement.net;
    var sub = !settlement.paid ? { key: "noWin" }
      : net > 0 ? { key: "winLine", params: { amount: money(settlement.paid) } }
      : { key: "returnedLine", params: { amount: money(settlement.paid) } };
    setBanner(line.key, line.params, sub, net > 0 ? "win" : net < 0 ? "lose" : "");
    if (net > 0) Sound.win();
    else if (net < 0) Sound.lose();
    else Sound.push();
    setPhase("settling");
    await settleChips(settlement);
    renderRoads();

    await pause(1100);
    await collectCards();
    state.bets = {};
    renderBets(null);
    setPhase("betting");
    setBanner("placeBets");
    restakeIfBroke();
  }

  function restakeIfBroke() {
    if (state.bankroll >= MIN_CHIP || totalStake()) return;
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

    el.spots.addEventListener("click", function (event) {
      var spot = event.target.closest(".spot");
      if (spot) addChip(spot.getAttribute("data-bet"));
    });
    el.spots.addEventListener("contextmenu", function (event) {
      var spot = event.target.closest(".spot");
      if (!spot) return;
      event.preventDefault();
      removeChip(spot.getAttribute("data-bet"));
    });
    el.spots.addEventListener("keydown", function (event) {
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
    el.btn.deal.addEventListener("click", deal);
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

    var rulesPicker = document.querySelector(".rule-profile-picker");
    rulesPicker.addEventListener("click", function (event) {
      var button = event.target.closest(".rule-profile");
      if (!button || button.disabled || !canBet()) return;
      state.settings.rules = button.getAttribute("data-profile");
      saveSettings();
      applyRules();
      toast(t("profileApplied", { profile: t(state.settings.rules === "classic" ? "profileClassic" : "profileNoCommission") }));
    });
    radioKeys(rulesPicker, ".rule-profile", function (button) { button.click(); });

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
    global.addEventListener("resize", renderRoads);
    global.addEventListener("pointerdown", function unlock() {
      Sound.unlock();
      global.removeEventListener("pointerdown", unlock);
    });
    global.addEventListener("storage", function (event) {
      if (event.key === Pit.KEYS.theme) applyTheme(Pit.readTheme(safeStorage("localStorage")));
      if (Pit.isPitKey(event.key) && state.phase === "betting" && !state.busy && !account.isHeld()) {
        readAccountState();
        renderBankroll();
        renderRoads();
        renderShoe();
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
    if ((key === " " || key === "Enter") && !onControl) { event.preventDefault(); deal(); return; }
    if (key === "Backspace" && !onControl) { event.preventDefault(); undo(); return; }
    var lower = key.length === 1 ? key.toLowerCase() : key;
    if (lower >= "1" && lower <= "6") { selectChip(TRAY[Number(lower) - 1]); return; }
    switch (lower) {
      case "p": addChip("player"); break;
      case "b": addChip("banker"); break;
      case "t": addChip("tie"); break;
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
    applyRules();
    applySoundUI();
    renderBanner();
    renderBets(null);
    renderRoads();
    renderShoe();
    renderBox();
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
    translateAll();
    bindControls();
    if (!account.shared) toast(t("temporaryAccount"));
    updateControls();
    renderBankroll();

    // A coup left unfinished by a reload, crash or closed tab is settled now.
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
