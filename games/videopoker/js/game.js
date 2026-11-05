/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Poker 11 — the machine
   The bet, the deal, the hold and the draw, the pays, the strategy
   hint with the value of every hold, and the statistics. Every hand is dealt and saved, with its stake already
   taken and the cards of its draw already chosen, before the first
   card is shown, and the hold is saved before the new cards are
   turned, so a reload brings back the very same hand.
   ========================================================= */
(function () {
  "use strict";

  var global = window;
  var Pit = global.Pit;
  var Engine = global.VideoPokerEngine;
  var Store = global.VideoPokerStore;
  var PitCards = global.PitCards;
  var Chips = global.ChipArt;
  var Sound = global.Sound;
  if (!Pit || !Engine || !Store || !PitCards || !Chips || !Sound) {
    throw new Error("Machine modules must load before game.js");
  }

  // The coin values this machine offers, as its tray shows them.
  var TRAY = Chips.trayValues(document.getElementById("chipTray"));
  var PACE = { fast: 0.55, normal: 1, cinematic: 1.45 };
  var CATEGORY_WORDS = {
    royalFlush: "catRoyalFlush", straightFlush: "catStraightFlush", quads: "catQuads", fullHouse: "catFullHouse",
    flush: "catFlush", straight: "catStraight", trips: "catTrips", twoPair: "catTwoPair", jacksOrBetter: "catJacksOrBetter",
    quadsLow: "catQuadsLow", quadAces: "catQuadAces", fiveOfAKind: "catFiveOfAKind", wildRoyal: "catWildRoyal", fourDeuces: "catFourDeuces"
  };
  // Where a game names a hand its own way: Deuces Wild calls a royal flush
  // without twos natural, Double Bonus pays the other fours apart.
  var GAME_WORDS = {
    deuces: { royalFlush: "catNaturalRoyal" },
    bonus: { quads: "catQuadsHigh" }
  };
  var GAME_TITLES = { jacks: "subtitleJacks", bonus: "subtitleBonus", deuces: "subtitleDeuces" };
  var PROFILE_WORDS = { nineSix: "profileNineSix", eightFive: "profileEightFive", doubleBonus: "profileDoubleBonus", deucesWild: "profileDeucesWild" };
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
    // The hand in the machine, from the deal until it is settled, and the
    // positions the player holds.
    round: null,
    held: [false, false, false, false, false],
    // The cards on show and, once a hand is settled, its result.
    shown: null,
    result: null,
    lastWin: 0,
    // Every hold of the hand in the machine with its value, best first,
    // worked out once per hand.
    coach: null,
    banner: { key: "placeBet", params: null, sub: null, tone: "" }
  };

  function readAccountState() {
    var snap = account.snapshot();
    state.bankroll = snap.bankroll;
    state.stats = snap.stats;
  }

  function saveSettings() {
    Store.writeJSON(safeStorage("localStorage"), Store.KEYS.settings, state.settings);
  }

  // The bet of the hand in the machine, or the one the next deal will take.
  function currentBet() {
    return state.round ? state.round.bet : { denomination: state.settings.denomination, coins: state.settings.coins };
  }

  function currentPayTable() {
    return state.round ? state.round.payTable : state.settings.payTable;
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
    payTable: $("payTable"),
    payRows: $("payRows"),
    subtitle: $("subtitle"),
    holds: $("holdsModal"),
    holdsList: $("holdsList"),
    slots: Array.prototype.slice.call(document.querySelectorAll(".hand-slot")),
    chipTray: $("chipTray"),
    totalBet: $("totalBet"),
    coinsLine: $("coinsLine"),
    winMeter: $("winMeter"),
    lastWin: $("lastWin"),
    dealLabel: $("dealLabel"),
    toast: $("toast"),
    settings: $("settingsModal"),
    btn: {
      betOne: $("btnBetOne"), betMax: $("btnBetMax"), deal: $("btnDeal"), holds: $("btnHolds"),
      sound: $("soundToggle"), settings: $("settingsBtn"), resetStats: $("btnResetStats")
    }
  };

  function holdButton(position) {
    return el.slots[position].querySelector(".hold-btn");
  }

  function cardHolder(position) {
    return el.slots[position].querySelector(".slot-card");
  }

  /* ---------------- Timing ---------------- */
  // A pause in the deal, scaled by the chosen pace; nothing waits with
  // reduced motion.
  function pause(ms) {
    var scaled = reducedMotion.matches ? 0 : Math.round(ms * (PACE[state.settings.animationSpeed] || 1));
    return new Promise(function (resolve) { setTimeout(resolve, scaled); });
  }

  /* ---------------- Words for hands ---------------- */
  // The word for a hand under the game of a pay table.
  function categoryWord(category, payTable) {
    var own = GAME_WORDS[Engine.gameOf(payTable)];
    return (own && own[category]) || CATEGORY_WORDS[category];
  }

  // "Full house", "Pair of Kings": a paying hand as the machine names it.
  // A hand carries the pay table it was played under.
  function handName(hand) {
    if (!hand || hand.category === "nothing") return "";
    if (hand.category === "jacksOrBetter") return t("handPair", { ranks: t("rankPlural" + (Engine.RANKS.indexOf(hand.pairRank) + 2)) });
    return t(categoryWord(hand.category, hand.payTable || currentPayTable()));
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
  function resultLine(settlement, payTable) {
    return settlement.returned
      ? { key: "resultWin", params: { hand: Object.assign({ payTable: payTable }, settlement.hand), amount: money(settlement.returned) } }
      : { key: "resultNothing", params: null };
  }

  function resultText(settlement, payTable) {
    var line = resultLine(settlement, payTable);
    return t(line.key, localize(line.params));
  }

  /* ---------------- Phases ---------------- */
  function canBet() { return state.phase === "betting" && !state.busy; }
  function canHold() { return state.phase === "holding" && !state.busy && !!state.round; }

  function setPhase(phase) {
    state.phase = phase;
    body.setAttribute("data-phase", phase);
    renderPayTable();
    updateControls();
  }

  /* ---------------- The bet ---------------- */
  function selectChip(value) {
    if (TRAY.indexOf(value) === -1) return;
    if (state.phase === "betting") {
      state.settings.denomination = value;
      saveSettings();
    }
    var shown = currentBet().denomination;
    el.chipTray.querySelectorAll(".chip").forEach(function (chip) {
      var on = Number(chip.getAttribute("data-value")) === shown;
      chip.setAttribute("aria-checked", String(on));
      chip.tabIndex = on ? 0 : -1;
    });
    renderBet();
  }

  // One more coin, from one back round to one after five.
  function betOne() {
    if (!canBet()) return;
    Sound.unlock();
    state.settings.coins = state.settings.coins % Engine.MAX_COINS + 1;
    saveSettings();
    Sound.chip(state.settings.coins);
    renderBet();
    renderPayTable();
  }

  // Five coins, and the deal at once, as on the machines.
  function betMax() {
    if (!canBet()) return;
    state.settings.coins = Engine.MAX_COINS;
    saveSettings();
    renderBet();
    renderPayTable();
    deal();
  }

  /* ---------------- Rendering ---------------- */
  function renderBankroll() {
    el.bankroll.textContent = fmt(Math.max(0, state.bankroll));
    el.lastWin.textContent = fmt(state.lastWin);
  }

  function renderBet() {
    var bet = currentBet();
    el.totalBet.textContent = fmt(Engine.stakeOf(bet));
    el.coinsLine.textContent = t("coinsLine", { coins: bet.coins, amount: money(bet.denomination) });
    body.setAttribute("data-coins", String(bet.coins));
  }

  function flashBalance() {
    el.balancePill.classList.remove("win-flash");
    void el.balancePill.offsetWidth;
    el.balancePill.classList.add("win-flash");
  }

  // The rows of a pay table, best hand first, each with a cell for one to
  // five coins. They are laid again only when the pay table changes.
  function layPayRows(payTable) {
    if (el.payRows.getAttribute("data-pay-table") === payTable) return;
    el.payRows.textContent = "";
    Engine.PAY_ROWS[payTable].forEach(function (category) {
      var row = document.createElement("tr");
      row.setAttribute("data-category", category);
      var head = document.createElement("th");
      head.scope = "row";
      head.setAttribute("data-i18n", categoryWord(category, payTable));
      head.textContent = t(categoryWord(category, payTable));
      row.appendChild(head);
      for (var coins = 1; coins <= Engine.MAX_COINS; coins++) {
        var cell = document.createElement("td");
        cell.setAttribute("data-coins", String(coins));
        row.appendChild(cell);
      }
      el.payRows.appendChild(row);
    });
    el.payRows.setAttribute("data-pay-table", payTable);
  }

  // The pay table in coins, the column of the coins bet lit and, after a
  // win, the winning row.
  function renderPayTable() {
    var payTable = currentPayTable();
    var coins = currentBet().coins;
    layPayRows(payTable);
    var title = GAME_TITLES[Engine.gameOf(payTable)];
    el.subtitle.setAttribute("data-i18n", title);
    el.subtitle.textContent = t(title);
    el.payTable.querySelectorAll("tbody tr").forEach(function (row) {
      var category = row.getAttribute("data-category");
      row.querySelectorAll("td").forEach(function (cell) {
        var column = Number(cell.getAttribute("data-coins"));
        cell.textContent = fmt(Engine.payPerCoin(category, payTable, column) * column);
      });
      row.classList.toggle("won", !!(state.result && state.result.hand.category === category && state.result.returned));
    });
    el.payTable.querySelectorAll("[data-coins]").forEach(function (cell) {
      cell.classList.toggle("active", Number(cell.getAttribute("data-coins")) === coins);
    });
    el.tableRtp.textContent = I18n.percent(Engine.RETURN_PERCENT[payTable] / 100, 2);
    body.setAttribute("data-pay-table", payTable);
    document.querySelectorAll(".rule-profile").forEach(function (button) {
      var on = button.getAttribute("data-profile") === state.settings.payTable;
      button.classList.toggle("active", on);
      button.setAttribute("aria-checked", String(on));
      button.tabIndex = on ? 0 : -1;
    });
  }

  function renderLimits() {
    el.tableMin.textContent = money(TRAY[0]);
    el.tableMax.textContent = money(TRAY[TRAY.length - 1] * Engine.MAX_COINS);
  }

  function renderStats() {
    var s = state.stats;
    var net = s.returned - s.wagered;
    $("stHands").textContent = fmt(s.hands);
    $("stWinRate").textContent = I18n.percent(s.hands ? s.winningHands / s.hands : 0);
    $("stRoyals").textContent = fmt(s.royalFlushes);
    var best = Engine.CATEGORIES[s.bestHand];
    $("stBestHand").textContent = s.bestHand ? t(CATEGORY_WORDS[best]) : t("noHandYet");
    $("stWagered").textContent = money(s.wagered);
    $("stReturned").textContent = money(s.returned);
    var netNode = $("stNet");
    netNode.textContent = (net < 0 ? "−" : "") + money(Math.abs(net));
    netNode.classList.toggle("positive", net > 0);
    netNode.classList.toggle("negative", net < 0);
    $("stBiggest").textContent = money(s.biggestWin);
    $("stBestHolds").textContent = s.decisions ? I18n.percent(s.bestHolds / s.decisions) + " (" + fmt(s.decisions) + ")" : I18n.percent(0);
    $("stMissed").textContent = money(Math.round(s.missedMilli / 10) / 100);
  }

  // The hold buttons follow the hold, and the strategy hint marks its pick.
  function renderHolds() {
    var holding = state.phase === "holding" && state.round;
    var pick = holding && state.settings.coach && state.coach ? state.coach.ranked[0].held : null;
    el.slots.forEach(function (slot, position) {
      var held = !!(holding && state.held[position]);
      var button = holdButton(position);
      slot.classList.toggle("held", held);
      slot.classList.toggle("coach-pick", !!(pick && pick[position]));
      button.setAttribute("aria-pressed", String(held));
      button.querySelector("span").textContent = t(held ? "held" : "hold");
      var c = state.shown && state.shown[position];
      button.setAttribute("aria-label", c ? t("holdCard", { card: PitCards.label(c, false) }) : t("hold"));
    });
  }

  function updateControls() {
    var betting = canBet();
    var holding = canHold();
    el.btn.betOne.disabled = !betting;
    el.btn.betMax.disabled = !betting;
    el.btn.deal.disabled = !(betting || holding);
    el.btn.deal.classList.toggle("ready", betting || holding);
    el.btn.holds.disabled = !(holding && state.settings.coach && state.coach && state.coach.id === state.round.id);
    var labelKey = state.phase === "holding" ? "draw" : "deal";
    el.dealLabel.setAttribute("data-i18n", labelKey);
    el.dealLabel.textContent = t(labelKey);
    el.slots.forEach(function (slot, position) { holdButton(position).disabled = !holding; });
    el.chipTray.querySelectorAll(".chip").forEach(function (chip) { chip.disabled = !betting; });
    $("depositAmount").disabled = !betting;
    document.querySelectorAll("[data-deposit], #btnDeposit, .rule-profile, #btnResetStats").forEach(function (node) {
      node.disabled = !betting;
    });
    body.setAttribute("data-busy", String(state.busy || (state.phase !== "betting" && state.phase !== "holding")));
  }

  /* ---------------- The cards ---------------- */
  function layCard(position, c, faceDown, animate) {
    var holder = cardHolder(position);
    holder.textContent = "";
    var node = PitCards.create(c, faceDown, animate);
    holder.appendChild(node);
    return node;
  }

  function turnCard(node, c) {
    node.querySelector(".card-inner").classList.remove("facedown");
    node.setAttribute("aria-label", PitCards.label(c, false));
  }

  function clearWin() {
    state.result = null;
    el.winMeter.textContent = "0";
    el.slots.forEach(function (slot) { slot.classList.remove("winning"); });
    renderPayTable();
  }

  // The five cards come face down, one at a time, and are turned together.
  // A hand brought back after a reload is laid out at once.
  async function showDeal(round, restored) {
    var nodes = [];
    for (var i = 0; i < Engine.HAND_SIZE; i++) {
      nodes.push(layCard(i, round.hand[i], true, !restored));
      if (!restored) {
        Sound.card();
        await pause(130);
      }
    }
    if (!restored) await pause(160);
    nodes.forEach(function (node, index) { turnCard(node, round.hand[index]); });
    if (!restored) Sound.flip();
    state.shown = round.hand.slice();
  }

  // Each card let go is taken away and its replacement dealt and turned,
  // left to right.
  async function showDraw(round, final) {
    for (var i = 0; i < Engine.HAND_SIZE; i++) {
      if (round.held[i]) continue;
      var node = layCard(i, final[i], true, true);
      Sound.card();
      await pause(150);
      turnCard(node, final[i]);
      Sound.flip();
      await pause(110);
    }
    state.shown = final.slice();
  }

  /* ---------------- The strategy hint ---------------- */
  // Every hold is valued from every possible draw, once a hand, after the
  // cards are on show; it takes a moment, so it waits for the next frame.
  // The values are worked out whether the hint is on or not: they judge
  // each hold for the statistics.
  function rankRound(round) {
    if (!state.coach || state.coach.id !== round.id) {
      state.coach = { id: round.id, ranked: Engine.rankHolds(round.hand, round.payTable, round.bet.coins) };
    }
    return state.coach;
  }

  function updateCoach() {
    var round = state.round;
    if (!round || state.phase !== "holding") {
      renderHolds();
      return;
    }
    if (state.coach && state.coach.id === round.id) {
      showCoach();
      return;
    }
    global.requestAnimationFrame(function () {
      if (state.round !== round || state.phase !== "holding") return;
      rankRound(round);
      showCoach();
    });
  }

  function showCoach() {
    renderHolds();
    updateControls();
    if (state.settings.coach) setBanner("holdPrompt", null, coachLine());
  }

  function coachLine() {
    if (!state.coach) return null;
    var best = state.coach.ranked[0];
    var count = best.held.filter(Boolean).length;
    var key = count === 0 ? "coachDrawAll" : count === Engine.HAND_SIZE ? "coachStand" : "coachHold";
    return { key: key, params: { value: coinValue(best.value) } };
  }

  // A value per coin, to three places: "1.537".
  function coinValue(value) {
    return value.toLocaleString(I18n.locale(), { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  }

  // How a hold compares with the best: whether it returns as much, and the
  // dollars it gives up on average for the bet in play.
  function judgeHold(round, held) {
    var ranked = rankRound(round).ranked;
    var mask = Engine.holdMask(held);
    var chosen = ranked.filter(function (entry) { return entry.mask === mask; })[0];
    var stake = Engine.stakeOf(round.bet);
    return { best: chosen.best, missed: (ranked[0].value - chosen.value) * stake, value: chosen.value, bestValue: ranked[0].value };
  }

  function setCoach(on) {
    state.settings.coach = !!on;
    saveSettings();
    body.setAttribute("data-coach", String(state.settings.coach));
    $("setCoach").checked = state.settings.coach;
    if (state.phase === "holding" && state.round) {
      if (state.settings.coach) updateCoach();
      else { renderHolds(); setBanner("holdPrompt"); }
    }
    updateControls();
  }

  /* ---------------- Every hold ---------------- */
  // The hold as words: the cards kept, or "Draw five new cards".
  function holdWords(round, held) {
    var kept = round.hand.filter(function (c, i) { return held[i]; });
    if (!kept.length) return t("holdNothing");
    return kept.map(function (c) { return c.rank + c.suit; }).join(" ");
  }

  function renderHoldsList() {
    var round = state.round;
    el.holdsList.textContent = "";
    if (!round || !state.coach || state.coach.id !== round.id) return;
    var current = Engine.holdMask(state.held);
    state.coach.ranked.forEach(function (entry) {
      var item = document.createElement("li");
      var button = document.createElement("button");
      button.type = "button";
      button.className = "hold-choice" + (entry.best ? " best" : "") + (entry.mask === current ? " current" : "");
      button.setAttribute("data-mask", String(entry.mask));
      button.setAttribute("aria-pressed", String(entry.mask === current));
      var cards = document.createElement("span");
      cards.className = "hold-cards";
      cards.textContent = holdWords(round, entry.held);
      var value = document.createElement("span");
      value.className = "hold-value";
      value.textContent = coinValue(entry.value);
      button.appendChild(cards);
      button.appendChild(value);
      if (entry.best) button.setAttribute("aria-description", t("bestHoldLabel"));
      item.appendChild(button);
      el.holdsList.appendChild(item);
    });
  }

  function openHolds() {
    if (el.btn.holds.disabled || !canHold()) return;
    openDialog(el.holds);
    renderHoldsList();
    var current = el.holdsList.querySelector(".current") || el.holdsList.querySelector("button");
    if (current) current.focus();
  }

  function pickHold(mask) {
    if (!canHold()) return;
    state.held = Engine.holdFromMask(mask);
    Sound.chip(1);
    renderHolds();
    closeDialog();
  }

  /* ---------------- The hand ---------------- */
  // Credits the account, records the hand and closes the saved round.
  // judged is how the hold compared with the best one, when known.
  function commitSettlement(settlement, judged) {
    var bankroll = Store.normalizeBankroll(account.read("bankroll", state.bankroll));
    bankroll = Math.min(Store.MAX_BANKROLL, bankroll + settlement.returned);
    var stats = Store.recordHand(account.read("stats", state.stats), settlement, judged);
    account.write("bankroll", bankroll);
    account.write("stats", stats);
    account.remove("round");
    state.bankroll = bankroll;
    state.stats = stats;
    state.lastWin = settlement.returned;
    renderStats();
  }

  function settleRound(round) {
    var final = Engine.draw(round.hand, round.held, round.draws);
    return { final: final, settlement: Engine.settle(round.bet, final, round.payTable) };
  }

  // A hand left behind by a reload, a crash or a closed tab. One that was
  // drawn is settled with its very cards; one still waiting for the hold
  // comes back to the machine. One that cannot be trusted is voided and its
  // stake returned.
  function recoverRound() {
    var raw = account.read("round", null);
    if (raw == null) return null;
    var round = Store.normalizeRound(raw);
    if (!round) {
      var bankroll = Store.normalizeBankroll(account.read("bankroll", Store.START_BANKROLL));
      var bet = Engine.normalizeBet(raw && raw.bet);
      state.bankroll = Math.min(Store.MAX_BANKROLL, bankroll + (bet ? Engine.stakeOf(bet) : 0));
      account.write("bankroll", state.bankroll);
      account.remove("round");
      toast(t("roundVoided"), "lose");
      renderBankroll();
      return { voided: true };
    }
    if (round.held === null) return { resume: round };
    var settled = settleRound(round);
    commitSettlement(settled.settlement);
    renderBankroll();
    toast(t("roundRestored", { result: resultText(settled.settlement, round.payTable) }), settled.settlement.returned ? "win" : "");
    return { settlement: settled.settlement };
  }

  // Ends the work done under the account lock and reports what stopped it.
  function afterLock(outcome) {
    state.busy = false;
    if (outcome && outcome.busy) toast(t("accountBusy"), "lose");
    if (outcome && outcome.insufficient) toast(t("insufficientFunds"), "lose");
    if (outcome && outcome.elsewhere) toast(t("roundElsewhere", { table: Pit.TABLES[outcome.elsewhere] }), "lose");
    if (outcome && outcome.resume) return resumeRound(outcome.resume);
    if (state.phase !== "betting" && state.phase !== "holding") setPhase("betting");
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
    var bet = Engine.normalizeBet(currentBet());
    var stake = Engine.stakeOf(bet);
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
      var cards = Engine.deal(Engine.newDeck());
      var round = { id: Store.newRoundId(), bet: bet, payTable: state.settings.payTable, hand: cards.hand, draws: cards.draws, held: null, at: Date.now() };
      // The cards, those of the draw and the stake are saved before the first
      // card is shown, so a reload can neither redeal this hand nor refund it.
      account.write("round", Store.roundSnapshot(round));
      account.write("bankroll", bankroll - stake);
      state.bankroll = bankroll - stake;
      return dealRound(round);
    }, 900).then(afterLock, lockFailed);
  }

  async function dealRound(round) {
    state.round = round;
    state.held = [false, false, false, false, false];
    state.coach = null;
    clearWin();
    renderBankroll();
    renderBet();
    setPhase("dealing");
    setBanner("holdPrompt");
    Sound.chip(round.bet.coins);
    await showDeal(round, false);
    setPhase("holding");
    renderHolds();
    updateCoach();
  }

  // A hand that was waiting for the hold when the page closed.
  async function resumeRound(round) {
    state.round = round;
    state.held = [false, false, false, false, false];
    state.coach = null;
    clearWin();
    selectChip(round.bet.denomination);
    renderBet();
    await showDeal(round, true);
    setPhase("holding");
    setBanner("holdPrompt");
    renderHolds();
    updateCoach();
    toast(t("roundResumed"));
  }

  function toggleHold(position) {
    if (!canHold() || position < 0 || position >= Engine.HAND_SIZE) return;
    Sound.unlock();
    state.held[position] = !state.held[position];
    Sound.chip(1);
    renderHolds();
  }

  // The hold is saved before the new cards are turned. It is judged
  // against the best hold first, while the hand is still on show.
  function drawCards() {
    if (!canHold()) return;
    var current = state.round;
    var held = state.held.slice();
    var judged = judgeHold(current, held);
    Sound.unlock();
    state.busy = true;
    updateControls();
    account.run(function () {
      var saved = Store.normalizeRound(account.read("round", null));
      if (!saved || saved.id !== current.id || saved.held !== null) return { lost: true };
      saved.held = held;
      account.write("round", Store.roundSnapshot(saved));
      state.round = saved;
      return finishRound(saved, judged);
    }, 900).then(function (outcome) {
      if (outcome && outcome.lost) {
        // Another tab settled this hand; the machine is cleared to match.
        state.round = null;
        state.busy = false;
        readAccountState();
        el.slots.forEach(function (slot, position) { cardHolder(position).textContent = ""; });
        state.shown = null;
        renderBankroll();
        setPhase("betting");
        renderHolds();
        setBanner("placeBet");
        return;
      }
      afterLock(outcome);
    }, lockFailed);
  }

  async function finishRound(round, judged) {
    setPhase("drawing");
    renderHolds();
    var settled = settleRound(round);
    await showDraw(round, settled.final);
    var settlement = settled.settlement;
    commitSettlement(settlement, judged);
    state.result = settlement;
    state.round = null;
    var line = resultLine(settlement, round.payTable);
    setBanner(line.key, line.params, null, settlement.returned ? "win" : "");
    el.winMeter.textContent = fmt(settlement.returned);
    if (settlement.returned) {
      el.slots.forEach(function (slot) { slot.classList.add("winning"); });
      Sound.win();
      Sound.payout();
      flashBalance();
    } else {
      Sound.lose();
    }
    renderBankroll();
    renderBet();
    selectChip(state.settings.denomination);
    setPhase("betting");
    renderHolds();
    if (state.settings.coach && judged && !judged.best) {
      toast(t("coachMiss", { yours: coinValue(judged.value), best: coinValue(judged.bestValue) }), "coach");
    }
    restakeIfBroke();
  }

  // A hand needs at least one coin of the smallest value.
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

  // Deal between hands, draw once the cards are held.
  function mainAction() {
    if (state.phase === "holding") drawCards();
    else deal();
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
  var openModal = null;

  function focusables(modal) {
    return Array.prototype.slice.call(modal.querySelectorAll("a[href], button, input, summary, [tabindex]"))
      .filter(function (node) { return !node.disabled && node.tabIndex >= 0 && !node.closest("[hidden]"); });
  }

  function openDialog(modal) {
    if (openModal) closeDialog();
    dialogReturn = document.activeElement;
    openModal = modal;
    modal.hidden = false;
  }

  function closeDialog() {
    if (!openModal) return;
    openModal.hidden = true;
    openModal = null;
    if (dialogReturn && typeof dialogReturn.focus === "function") dialogReturn.focus();
    dialogReturn = null;
  }

  function openSettings() {
    openDialog(el.settings);
    renderStats();
    el.settings.querySelector(".modal-head [data-close]").focus();
  }

  // Escape closes a dialog, and Tab keeps the focus inside it.
  function trapDialog(modal) {
    modal.querySelectorAll("[data-close]").forEach(function (node) { node.addEventListener("click", closeDialog); });
    modal.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { event.preventDefault(); closeDialog(); return; }
      if (event.key !== "Tab") return;
      var items = focusables(modal);
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
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

    // A card is held from its button or by a tap on the card itself.
    el.slots.forEach(function (slot, position) {
      slot.addEventListener("click", function () { toggleHold(position); });
    });

    el.btn.betOne.addEventListener("click", betOne);
    el.btn.betMax.addEventListener("click", betMax);
    el.btn.deal.addEventListener("click", mainAction);
    el.btn.sound.addEventListener("click", function () { setSound(!soundEnabled); });
    $("setSound").addEventListener("change", function (event) { setSound(event.target.checked); });
    $("setCoach").addEventListener("change", function (event) { setCoach(event.target.checked); });
    document.querySelectorAll("[data-sound-level]").forEach(function (slider) {
      slider.addEventListener("input", function () {
        Sound.setVolume(slider.getAttribute("data-sound-level"), Number(slider.value) / 100);
        Store.writeJSON(safeStorage("localStorage"), Store.KEYS.audio, Sound.getVolumes());
        applySoundUI();
      });
    });

    el.btn.settings.addEventListener("click", openSettings);
    el.btn.holds.addEventListener("click", openHolds);
    trapDialog(el.settings);
    trapDialog(el.holds);
    el.holdsList.addEventListener("click", function (event) {
      var choice = event.target.closest(".hold-choice");
      if (choice) pickHold(Number(choice.getAttribute("data-mask")));
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

    var payTablePicker = document.querySelector(".rule-profile-picker");
    payTablePicker.addEventListener("click", function (event) {
      var button = event.target.closest(".rule-profile");
      if (!button || button.disabled || !canBet()) return;
      state.settings.payTable = button.getAttribute("data-profile");
      saveSettings();
      clearWin();
      toast(t("profileApplied", { profile: t(PROFILE_WORDS[state.settings.payTable]) }));
    });
    radioKeys(payTablePicker, ".rule-profile", function (button) { button.click(); });

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
    if (openModal) return;
    var target = event.target;
    var typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    if (typing) return;
    var onControl = target && target.closest && target.closest("button, a, summary, [role='button']");
    var key = event.key;
    var lower = key.length === 1 ? key.toLowerCase() : key;
    if ((key === " " || key === "Enter") && !onControl) { event.preventDefault(); mainAction(); return; }
    if (lower === "m") { setSound(!soundEnabled); return; }
    if (state.phase === "holding") {
      // 1 to 5 hold the cards, left to right; H shows every hold.
      if (lower >= "1" && lower <= "5") toggleHold(Number(lower) - 1);
      else if (lower === "h") openHolds();
      return;
    }
    if (lower >= "1" && lower <= "6") { selectChip(TRAY[Number(lower) - 1]); return; }
    if (lower === "b") betOne();
    else if (lower === "x") betMax();
  }

  /* ---------------- Start ---------------- */
  function translateAll() {
    I18n.apply(document);
    applyLanguageUI();
    applySoundUI();
    renderBanner();
    renderBet();
    renderPayTable();
    renderHolds();
    renderStats();
    updateControls();
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
    selectChip(state.settings.denomination);
    body.setAttribute("data-coach", String(state.settings.coach));
    $("setCoach").checked = state.settings.coach;
    translateAll();
    bindControls();
    if (!account.shared) toast(t("temporaryAccount"));
    renderBankroll();
    updateControls();

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
