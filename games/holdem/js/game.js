/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 2 — the table
   Betting, the deal, the flop, the decision to call or fold, the turn
   and the river, settlement and the statistics. Every hand is dealt and
   saved, all nine cards and the stake, before the first card is shown,
   and the decision is saved before the rest is turned, so a reload
   brings back the very same hand instead of a new one.
   ========================================================= */
(function () {
  "use strict";

  var global = window;
  var Pit = global.Pit;
  var Engine = global.HoldemEngine;
  var Store = global.HoldemStore;
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
  var SPOTS = ["aaBonus", "ante", "call"];
  var BET_NAMES = { aaBonus: "aaBonusName", ante: "anteName", call: "callName" };
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
    bets: {},
    actions: [],
    lastBets: {},
    chip: 25,
    phase: "betting",
    busy: false,
    lastWin: 0,
    // The hand on the felt, from the deal until it is settled, and the
    // ranking of each side's cards once they are face up.
    round: null,
    shown: { player: null, dealer: null },
    // The board cards turned so far: none, the flop or all five.
    boardShown: 0,
    banner: { key: "placeBets", params: null, sub: null, tone: "" }
  };

  function readAccountState() {
    var snap = account.snapshot();
    state.bankroll = snap.bankroll;
    state.stats = snap.stats;
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
    deck: $("deck"),
    boardCards: $("boardCards"),
    tableMin: $("tableMin"),
    tableMax: $("tableMax"),
    tableAaMax: $("tableAaMax"),
    bays: { player: document.querySelector(".bay-player"), dealer: document.querySelector(".bay-dealer") },
    cards: { player: $("playerCards"), dealer: $("dealerCards") },
    hands: { player: $("playerHand"), dealer: $("dealerHand") },
    spots: $("spots"),
    chipTray: $("chipTray"),
    totalBet: $("totalBet"),
    lastWin: $("lastWin"),
    toast: $("toast"),
    settings: $("settingsModal"),
    btn: {
      undo: $("btnUndo"), clear: $("btnClear"), double: $("btnDouble"), rebet: $("btnRebet"),
      deal: $("btnDeal"), call: $("btnCall"), fold: $("btnFold"),
      sound: $("soundToggle"), settings: $("settingsBtn"), resetStats: $("btnResetStats")
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

  /* ---------------- Words for hands ---------------- */
  var HAND_WORDS = {
    high: "handHigh", pair: "handPair", twoPair: "handTwoPair", trips: "handTrips", straight: "handStraight",
    flush: "handFlush", fullHouse: "handFullHouse", quads: "handQuads", straightFlush: "handStraightFlush", royalFlush: "handRoyalFlush"
  };

  // "Pair of Kings", "Queens full of Fives": a hand as the dealer calls it.
  function handName(hand) {
    if (!hand) return "";
    var top = hand.ranks[0], low = hand.ranks[1];
    return t(HAND_WORDS[hand.category], {
      rank: t("rankName" + top), ranks: t("rankPlural" + top), lows: low ? t("rankPlural" + low) : ""
    });
  }

  // Banner and toast parameters may hold hands; they are named in the
  // language shown when the words are drawn.
  function localize(params) {
    if (!params) return params;
    var out = {};
    Object.keys(params).forEach(function (key) {
      var value = params[key];
      out[key] = value && typeof value === "object" && value.category ? handName(value) : value;
    });
    return out;
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
    el.bannerText.textContent = t(b.key, localize(b.params));
    el.bannerText.removeAttribute("data-i18n");
    el.bannerSub.textContent = b.sub ? t(b.sub.key, localize(b.sub.params)) : "";
    el.banner.classList.toggle("flash-win", b.tone === "win");
    el.banner.classList.toggle("flash-lose", b.tone === "lose");
  }

  // The words for how a hand ended.
  function resultLine(settlement) {
    var hands = { player: settlement.player, dealer: settlement.dealer };
    switch (settlement.outcome) {
      case "fold": return { key: "foldHand", params: hands };
      case "noQualify": return { key: "noQualifyHand", params: hands };
      case "win": return { key: "winHand", params: hands };
      case "lose": return { key: "loseHand", params: hands };
      default: return { key: "tieHand", params: hands };
    }
  }

  function resultText(settlement) {
    var line = resultLine(settlement);
    return t(line.key, localize(line.params));
  }

  /* ---------------- Bets ---------------- */
  function totalStake() { return Engine.totalStake(state.bets); }
  function available() { return state.bankroll - totalStake(); }
  function canBet() { return state.phase === "betting" && !state.busy; }
  function canDecide() { return state.phase === "deciding" && !state.busy && !!state.round; }
  function callOf(bets) { return (bets.ante || 0) * Engine.CALL_TIMES; }
  // The stake of the hand in play, or of the bets being placed.
  function stakeShown() { return state.round ? Store.roundStake(state.round.bets, state.round.decision) : totalStake(); }

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
    if (!canBet() || Engine.BETS.indexOf(key) === -1) return;
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
    el.totalBet.textContent = fmt(stakeShown());
    el.lastWin.textContent = fmt(state.lastWin);
    body.setAttribute("data-wager", String(stakeShown()));
  }

  function flashBalance() {
    el.balancePill.classList.remove("win-flash");
    void el.balancePill.offsetWidth;
    el.balancePill.classList.add("win-flash");
  }

  // The amount on each spot: the bets being placed, or those of the hand in play.
  function spotAmount(key) {
    var round = state.round;
    if (!round) return state.bets[key] || 0;
    if (key === "call") return round.decision === "call" ? callOf(round.bets) : 0;
    return round.bets[key] || 0;
  }

  function spotLabel(key) {
    var pays = spotFor(key).querySelector(".spot-pay").textContent;
    return t("spotLabel", { name: t(BET_NAMES[key]), pays: pays.toLowerCase(), amount: money(spotAmount(key)) });
  }

  // Draws the chips on each spot; freshly placed stacks drop in.
  function renderBets(changedKeys) {
    SPOTS.forEach(function (key) {
      var spot = spotFor(key);
      var holder = spot.querySelector(".spot-stack");
      holder.textContent = "";
      var amount = spotAmount(key);
      if (amount) {
        var placed = changedKeys && changedKeys.indexOf(key) !== -1;
        holder.appendChild(Chips.stack(document, amount, "bet-chip" + (placed ? " placed" : "")));
      }
      spot.setAttribute("aria-label", spotLabel(key));
    });
    renderBankroll();
  }

  function renderLimits() {
    el.tableMin.textContent = money(MIN_CHIP);
    el.tableMax.textContent = money(Store.betLimit("ante"));
    el.tableAaMax.textContent = money(Store.betLimit("aaBonus"));
  }

  function renderHandNames() {
    ["player", "dealer"].forEach(function (side) {
      var hand = state.shown[side];
      el.hands[side].textContent = handName(hand);
      el.cards[side].setAttribute("aria-label", hand ? t("handLabel", { side: t(side + "Name"), hand: handName(hand) }) : t(side + "Name"));
    });
  }

  function showHandName(side, cards) {
    state.shown[side] = cards ? Engine.evaluate(cards) : null;
    renderHandNames();
  }

  // The cards a side plays with: its own two and the board turned so far.
  function sideCards(round, side) {
    return round[side].concat(round.board.slice(0, state.boardShown));
  }

  function renderStats() {
    var s = state.stats;
    var net = s.returned - s.wagered;
    $("stHands").textContent = fmt(s.hands);
    $("stWinRate").textContent = I18n.percent(s.hands ? s.winningHands / s.hands : 0);
    $("stCalled").textContent = fmt(s.called);
    $("stFolded").textContent = fmt(s.folded);
    $("stNoQualify").textContent = fmt(s.noQualify);
    $("stAaWins").textContent = fmt(s.aaWins);
    var best = Engine.fromScore(s.bestHand);
    $("stBestHand").textContent = best ? handName(best) : t("noHandYet");
    $("stWagered").textContent = money(s.wagered);
    $("stReturned").textContent = money(s.returned);
    var netNode = $("stNet");
    netNode.textContent = (net < 0 ? "−" : "") + money(Math.abs(net));
    netNode.classList.toggle("positive", net > 0);
    netNode.classList.toggle("negative", net < 0);
    $("stBiggest").textContent = money(s.biggestWin);
  }

  function askDecision() {
    setBanner("decideLine", { hand: Engine.evaluate(sideCards(state.round, "player")) });
  }

  function updateControls() {
    var betting = canBet();
    var deciding = canDecide();
    var staked = totalStake() > 0;
    el.btn.undo.disabled = !betting || !state.actions.length;
    el.btn.clear.disabled = !betting || !staked;
    el.btn.double.disabled = !betting || !staked;
    el.btn.rebet.disabled = !betting || staked || !Object.keys(state.lastBets).length;
    el.btn.deal.disabled = !betting || !state.bets.ante;
    el.btn.deal.classList.toggle("ready", betting && !!state.bets.ante);
    el.btn.call.disabled = !deciding;
    el.btn.fold.disabled = !deciding;
    var avail = available();
    el.chipTray.querySelectorAll(".chip").forEach(function (chip) {
      chip.disabled = !betting;
      chip.classList.toggle("unaffordable", Number(chip.getAttribute("data-value")) > avail);
    });
    Engine.BETS.forEach(function (key) { spotFor(key).disabled = !betting; });
    // The Call spot takes the Call, and only while the hand waits for it.
    spotFor("call").disabled = !deciding;
    $("depositAmount").disabled = !betting;
    document.querySelectorAll("[data-deposit], #btnDeposit, #btnResetStats").forEach(function (node) {
      node.disabled = !betting;
    });
    body.setAttribute("data-busy", String(state.busy || (state.phase !== "betting" && state.phase !== "deciding")));
  }

  function setPhase(phase) {
    state.phase = phase;
    body.setAttribute("data-phase", phase);
    updateControls();
  }

  /* ---------------- The cards on the felt ---------------- */
  function clearHands() {
    ["player", "dealer"].forEach(function (side) {
      el.cards[side].textContent = "";
      el.bays[side].classList.remove("winner");
      showHandName(side, null);
    });
    el.boardCards.textContent = "";
    state.boardShown = 0;
    el.spots.querySelectorAll(".spot").forEach(function (spot) { spot.classList.remove("won"); });
  }

  function layCard(holder, card, faceDown, animate) {
    var node = PitCards.create(card, faceDown, animate);
    holder.appendChild(node);
    return node;
  }

  function turnCard(node, card) {
    node.querySelector(".card-inner").classList.remove("facedown");
    node.setAttribute("aria-label", PitCards.label(card, false));
  }

  // Turns board cards up to `count`: the flop, then the turn and the river.
  async function turnBoard(round, count, restored) {
    while (state.boardShown < count) {
      var index = state.boardShown;
      layCard(el.boardCards, round.board[index], false, !restored);
      state.boardShown++;
      if (!restored) {
        Sound.card();
        await pause(index < 3 ? 220 : 520);
      }
    }
    showHandName("player", sideCards(round, "player"));
  }

  // The deal: two cards each, one at a time and face down, the player's
  // turned, then the flop. A hand brought back after a reload is laid out
  // at once.
  async function showDeal(round, restored) {
    for (var i = 0; i < 2; i++) {
      ["player", "dealer"].forEach(function (side) {
        layCard(el.cards[side], round[side][i], true, !restored);
      });
      if (!restored) {
        Sound.card();
        await pause(300);
      }
    }
    el.cards.player.querySelectorAll(".card").forEach(function (node, index) { turnCard(node, round.player[index]); });
    if (!restored) {
      Sound.flip();
      await pause(360);
    }
    await turnBoard(round, 3, restored);
  }

  // The dealer's cards are turned one after the other.
  async function revealDealer(round) {
    var nodes = el.cards.dealer.querySelectorAll(".card");
    for (var i = 0; i < nodes.length; i++) {
      turnCard(nodes[i], round.dealer[i]);
      Sound.flip();
      await pause(380);
    }
    showHandName("dealer", sideCards(round, "dealer"));
    await pause(360);
  }

  // Losing chips are swept away, winning bets are paid beside their stake and
  // pushes stay. The balance changes when the chips come back.
  async function settleChips(settlement) {
    var payouts = { aaBonus: 0, ante: 0, call: 0 };
    settlement.lines.forEach(function (line) {
      var stack = spotFor(line.key).querySelector(".spot-stack .bet-chip");
      if (stack && line.result === "lose") stack.classList.add("losing");
      if (line.returned > line.amount) payouts[line.key] += line.returned - line.amount;
    });
    SPOTS.forEach(function (key) {
      if (!payouts[key]) return;
      spotFor(key).classList.add("won");
      spotFor(key).querySelector(".spot-stack").appendChild(Chips.stack(document, payouts[key], "bet-chip payout"));
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

  /* ---------------- The hand ---------------- */
  // Credits the account, records the hand and closes the saved round.
  function commitSettlement(settlement) {
    var bankroll = Store.normalizeBankroll(account.read("bankroll", state.bankroll));
    bankroll = Math.min(Store.MAX_BANKROLL, bankroll + settlement.returned);
    var stats = Store.recordHand(account.read("stats", state.stats), settlement);
    account.write("bankroll", bankroll);
    account.write("stats", stats);
    account.remove("round");
    state.bankroll = bankroll;
    state.stats = stats;
    state.lastWin = settlement.returned;
    renderStats();
  }

  // A hand left behind by a reload, a crash or a closed tab. One that was
  // decided is settled with its very cards; one still waiting for the
  // decision comes back to the felt. One that cannot be trusted is voided
  // and its stake returned.
  function recoverRound() {
    var raw = account.read("round", null);
    if (raw == null) return null;
    var round = Store.normalizeRound(raw);
    if (!round) {
      var bankroll = Store.normalizeBankroll(account.read("bankroll", Store.START_BANKROLL));
      var bets = Engine.normalizeBets(raw && raw.bets);
      var refund = Store.roundStake(bets, bets.ante && raw.decision === "call" ? "call" : null);
      state.bankroll = Math.min(Store.MAX_BANKROLL, bankroll + refund);
      account.write("bankroll", state.bankroll);
      account.remove("round");
      toast(t("roundVoided"), "lose");
      renderBankroll();
      return { voided: true };
    }
    state.lastBets = round.bets;
    if (round.decision === null) return { resume: round };
    var settlement = Engine.settle(round.bets, round, round.decision);
    commitSettlement(settlement);
    renderBankroll();
    toast(t("roundRestored", { result: resultText(settlement) }), settlement.returned ? "win" : "");
    return { settlement: settlement };
  }

  // Ends the work done under the account lock and reports what stopped it.
  function afterLock(outcome) {
    state.busy = false;
    if (outcome && outcome.busy) toast(t("accountBusy"), "lose");
    if (outcome && outcome.insufficient) toast(t("insufficientFunds"), "lose");
    if (outcome && outcome.reserve) toast(t("callReserve", { amount: money(outcome.reserve) }), "lose");
    if (outcome && outcome.elsewhere) toast(t("roundElsewhere", { table: Pit.TABLES[outcome.elsewhere] }), "lose");
    if (outcome && outcome.resume) return resumeRound(outcome.resume);
    if (state.phase !== "betting" && state.phase !== "deciding") setPhase("betting");
    renderBankroll();
    updateControls();
  }

  function lockFailed(error) {
    state.busy = false;
    state.round = null;
    setPhase("betting");
    toast(String(error && error.message || error), "lose");
  }

  function deal() {
    if (!canBet()) return;
    var bets = Engine.normalizeBets(state.bets);
    if (!bets.ante) { toast(t("anteRequired"), "lose"); return; }
    var stake = Engine.totalStake(bets);
    Sound.unlock();
    state.busy = true;
    updateControls();
    account.run(function () {
      var recovered = recoverRound();
      if (recovered && recovered.resume) return recovered;
      var elsewhere = account.roundsElsewhere();
      if (elsewhere.length) return { elsewhere: elsewhere[0] };
      var bankroll = Store.normalizeBankroll(account.read("bankroll", Store.START_BANKROLL));
      if (stake > bankroll) {
        state.bankroll = bankroll;
        return { insufficient: true };
      }
      // The Call is twice the Ante, so the balance must hold it too.
      if (stake + callOf(bets) > bankroll) {
        state.bankroll = bankroll;
        return { reserve: callOf(bets) };
      }
      var deck = Engine.newDeck();
      var hands = Engine.deal(function () { return deck.shift(); });
      var round = { id: Store.newRoundId(), bets: bets, player: hands.player, dealer: hands.dealer, board: hands.board, decision: null, at: Date.now() };
      // The cards and the stake are saved before the first card is shown, so
      // a reload can neither redeal this hand nor refund a losing bet.
      account.write("round", Store.roundSnapshot(round));
      account.write("bankroll", bankroll - stake);
      account.write("lastBets", bets);
      state.bankroll = bankroll - stake;
      state.lastBets = bets;
      return dealRound(round);
    }, 900).then(afterLock, lockFailed);
  }

  async function dealRound(round) {
    state.round = round;
    state.bets = {};
    state.actions = [];
    setPhase("dealing");
    clearHands();
    renderBets(null);
    setBanner("noMoreBets");
    el.deck.classList.remove("shuffling");
    void el.deck.offsetWidth;
    el.deck.classList.add("shuffling");
    Sound.shuffle();
    await pause(420);
    await showDeal(round, false);
    await pause(240);
    setPhase("deciding");
    askDecision();
  }

  // A hand that was waiting for the decision when the page closed.
  async function resumeRound(round) {
    state.round = round;
    state.bets = {};
    state.actions = [];
    clearHands();
    renderBets(null);
    await showDeal(round, true);
    setPhase("deciding");
    askDecision();
    toast(t("roundResumed"));
  }

  // Call puts down twice the Ante; fold gives up the Ante. The decision and
  // any Call are saved before the turn, the river and the dealer's cards.
  function decide(decision) {
    if (!canDecide()) return;
    var current = state.round;
    Sound.unlock();
    state.busy = true;
    updateControls();
    account.run(function () {
      var saved = Store.normalizeRound(account.read("round", null));
      if (!saved || saved.id !== current.id || saved.decision !== null) return { lost: true };
      var bankroll = Store.normalizeBankroll(account.read("bankroll", Store.START_BANKROLL));
      if (decision === "call" && callOf(saved.bets) > bankroll) {
        state.bankroll = bankroll;
        return { insufficient: true };
      }
      saved.decision = decision;
      account.write("round", Store.roundSnapshot(saved));
      if (decision === "call") {
        account.write("bankroll", bankroll - callOf(saved.bets));
        state.bankroll = bankroll - callOf(saved.bets);
      }
      state.round = saved;
      return finishRound(saved);
    }, 900).then(function (outcome) {
      if (outcome && outcome.lost) {
        // Another tab settled this hand; the felt is cleared to match.
        state.round = null;
        state.busy = false;
        clearHands();
        readAccountState();
        renderBets(null);
        setPhase("betting");
        setBanner("placeBets");
        return;
      }
      afterLock(outcome);
    }, lockFailed);
  }

  async function finishRound(round) {
    setPhase("revealing");
    if (round.decision === "call") {
      renderBets(["call"]);
      Sound.chip(2);
      await pause(360);
    }
    await turnBoard(round, 5, false);
    await revealDealer(round);

    var settlement = Engine.settle(round.bets, round, round.decision);
    commitSettlement(settlement);
    if (settlement.outcome === "win" || settlement.outcome === "noQualify") el.bays.player.classList.add("winner");
    if (settlement.outcome === "lose") el.bays.dealer.classList.add("winner");
    var line = resultLine(settlement);
    var net = settlement.net;
    var sub = !settlement.returned ? { key: "noWin" }
      : net > 0 ? { key: "winLine", params: { amount: money(settlement.returned) } }
      : { key: "returnedLine", params: { amount: money(settlement.returned) } };
    setBanner(line.key, line.params, sub, net > 0 ? "win" : net < 0 ? "lose" : "");
    var bonus = settlement.lines.filter(function (l) { return l.key === "aaBonus" && l.result === "win"; })[0];
    if (bonus) toast(t("aaPaid", { amount: money(bonus.returned) }), "win");
    if (net > 0) Sound.win();
    else if (net < 0) Sound.lose();
    else Sound.push();
    setPhase("settling");
    await settleChips(settlement);

    await pause(1100);
    await collectCards();
    state.round = null;
    renderBets(null);
    setPhase("betting");
    setBanner("placeBets");
    restakeIfBroke();
  }

  // A hand needs an Ante and room for the Call: three of the smallest chip.
  function restakeIfBroke() {
    if (state.bankroll >= MIN_CHIP * (1 + Engine.CALL_TIMES) || totalStake()) return;
    account.run(function () {
      var bankroll = Store.normalizeBankroll(account.read("bankroll", 0));
      if (bankroll >= MIN_CHIP * (1 + Engine.CALL_TIMES) || account.read("round", null) != null) return;
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
      if (!spot) return;
      var key = spot.getAttribute("data-bet");
      if (key === "call") decide("call");
      else addChip(key);
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
    el.btn.call.addEventListener("click", function () { decide("call"); });
    el.btn.fold.addEventListener("click", function () { decide("fold"); });
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
    if (event.defaultPrevented || event.altKey || event.metaKey || event.repeat || event.isComposing) return;
    if (!el.settings.hidden) return;
    var target = event.target;
    var typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    if (typing) return;
    var onControl = target && target.closest && target.closest("button, a, summary, [role='button']");
    var key = event.key;
    var lower = key.length === 1 ? key.toLowerCase() : key;
    if (state.phase === "deciding") {
      if ((key === " " || key === "Enter") && !onControl) { event.preventDefault(); decide("call"); return; }
      if (lower === "l") decide("call");
      else if (lower === "f") decide("fold");
      else if (lower === "m") setSound(!soundEnabled);
      return;
    }
    if (event.ctrlKey) {
      if (lower === "z") { event.preventDefault(); undo(); }
      return;
    }
    if ((key === " " || key === "Enter") && !onControl) { event.preventDefault(); deal(); return; }
    if (key === "Backspace" && !onControl) { event.preventDefault(); undo(); return; }
    if (lower >= "1" && lower <= "6") { selectChip(TRAY[Number(lower) - 1]); return; }
    switch (lower) {
      case "a": addChip("ante"); break;
      case "b": addChip("aaBonus"); break;
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
    renderHandNames();
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

    // A hand left unfinished by a reload, crash or closed tab comes back now.
    if (account.read("round", null) != null) {
      state.busy = true;
      updateControls();
      account.run(recoverRound, 2500).then(function (outcome) {
        afterLock(outcome);
        if (!outcome || !outcome.resume) restakeIfBroke();
      }, function () { state.busy = false; updateControls(); });
    } else {
      restakeIfBroke();
    }
  }

  init();
})();
