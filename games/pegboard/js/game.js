/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Drop 16 — the machine
   The board drawn for its rows and risk, the bet, the balls falling
   peg by peg, settlement and the statistics. Every ball's way down is
   drawn and saved, with the stake already taken, before the first ball
   falls, so a reload settles the very same drop instead of a new one.
   ========================================================= */
(function () {
  "use strict";

  var global = window;
  var Pit = global.Pit;
  var Engine = global.PegboardEngine;
  var Store = global.PegboardStore;
  var Chips = global.ChipArt;
  var Sound = global.Sound;
  if (!Pit || !Engine || !Store || !Chips || !Sound) {
    throw new Error("Machine modules must load before game.js");
  }

  var SVG_NS = "http://www.w3.org/2000/svg";
  // The chips this machine offers, as its tray shows them: the bet on each ball.
  var TRAY = Chips.trayValues(document.getElementById("chipTray"));
  var PACE = { fast: 0.6, normal: 1, cinematic: 1.45 };
  // The board, in the units of its viewBox: the gap between two pegs of a
  // row, between two rows, where the first row is, and the sizes of a peg,
  // a ball and a slot.
  var GAP = 40;
  var ROW = 34;
  var TOP = 52;
  var PEG = 4.2;
  var BALL = 8.5;
  var SLOT = 30;
  // One row of the way down at the normal pace, and the time between two
  // balls of one drop.
  var STEP_MS = 118;
  var LAUNCH_MS = 180;
  var reducedMotion = global.matchMedia ? global.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  var t = function (key, params) { return I18n.t(key, params); };
  function fmt(n) { return Number(n).toLocaleString(I18n.locale()); }
  function money(n) { return "$" + fmt(n); }
  function percent(fraction) {
    return (fraction * 100).toLocaleString(I18n.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
  }
  // A multiple of the bet: "0.5×", "1,000×". The slots print it without
  // the thousands separator, to keep it short: "1000×".
  function times(multiplier, compact) {
    return t("times", { n: multiplier.toLocaleString(I18n.locale(), { maximumFractionDigits: 1, useGrouping: !compact }) });
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
    history: [],
    settings: Store.normalizeSettings(Store.readJSON(safeStorage("localStorage"), Store.KEYS.settings, null)),
    phase: "betting",
    busy: false,
    lastWin: 0,
    // The balls of the last drop: how many have landed of how many, and
    // the multiple the last one landed on.
    meter: { landed: 0, total: 1, last: null },
    banner: { key: "placeBet", params: null, sub: null, tone: "" }
  };

  function readAccountState() {
    var snap = account.snapshot();
    state.bankroll = snap.bankroll;
    state.stats = snap.stats;
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
    board: $("board"),
    history: $("history"),
    rowsPicker: $("rowsPicker"),
    riskPicker: $("riskPicker"),
    ballsPicker: $("ballsPicker"),
    chipTray: $("chipTray"),
    ballsDown: $("ballsDown"),
    ballsTotal: $("ballsTotal"),
    lastMultiple: $("lastMultiple"),
    betAmount: $("betAmount"),
    ballsLine: $("ballsLine"),
    lastWin: $("lastWin"),
    tableMin: $("tableMin"),
    tableMax: $("tableMax"),
    tableRtp: $("tableRtp"),
    toast: $("toast"),
    settings: $("settingsModal"),
    btn: { drop: $("btnDrop"), sound: $("soundToggle"), settings: $("settingsBtn"), resetStats: $("btnResetStats") }
  };

  /* ---------------- Timing ---------------- */
  function paceOf() { return PACE[state.settings.animationSpeed] || 1; }

  function pause(ms) {
    var scaled = reducedMotion.matches ? 0 : Math.round(ms * paceOf());
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

  // Parameters may hold a multiple ({ times: 0.5 }) or an amount
  // ({ amount: 30 }); they are put into words in the language shown.
  function localize(params) {
    if (!params) return params;
    var out = {};
    Object.keys(params).forEach(function (key) {
      var value = params[key];
      if (key === "amount") value = money(value);
      else if (value && typeof value === "object" && "times" in value) value = times(value.times);
      out[key] = value;
    });
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

  // The words for how a drop ended.
  function resultLine(settlement) {
    if (settlement.balls.length === 1) {
      var ball = settlement.balls[0];
      return { key: ball.returned > settlement.stake ? "landedWin" : "landedBack", params: { pays: { times: ball.multiplier }, amount: ball.returned } };
    }
    return { key: "manyResult", params: { balls: settlement.balls.length, amount: settlement.returned } };
  }

  function resultSub(settlement) {
    if (settlement.balls.length === 1) return null;
    if (settlement.net > 0) return { key: "winLine", params: { amount: settlement.net } };
    if (settlement.net < 0) return { key: "lostLine", params: { amount: -settlement.net } };
    return { key: "evenLine" };
  }

  function resultText(settlement) {
    var line = resultLine(settlement), sub = resultSub(settlement);
    return t(line.key, localize(line.params)) + (sub ? ". " + t(sub.key, localize(sub.params)) : "");
  }

  /* ---------------- The bet ---------------- */
  function bet() { return state.settings.bet; }
  function balls() { return state.settings.balls; }
  function stake() { return bet() * balls(); }
  function canDrop() { return state.phase === "betting" && !state.busy; }

  function selectChip(value) {
    if (TRAY.indexOf(value) === -1) return;
    state.settings.bet = value;
    saveSettings();
    renderBet();
  }

  function setBalls(count) {
    if (!canDrop() || Engine.BALLS.indexOf(count) === -1) return;
    state.settings.balls = count;
    saveSettings();
    renderBet();
  }

  function setRows(rows) {
    if (!canDrop() || !Engine.isRows(rows) || rows === state.settings.rows) return;
    state.settings.rows = rows;
    saveSettings();
    drawBoard();
    renderPickers();
  }

  function setRisk(risk) {
    if (!canDrop() || !Engine.isRisk(risk) || risk === state.settings.risk) return;
    state.settings.risk = risk;
    saveSettings();
    drawBoard();
    renderPickers();
  }

  function cycle(list, current) {
    return list[(list.indexOf(current) + 1) % list.length];
  }

  /* ---------------- The board ---------------- */
  // How a slot's multiple is coloured: below the bet, the bet back, and
  // rising pays up to the top ones.
  function tierOf(multiplier) {
    if (multiplier < 1) return "low";
    if (multiplier < 2) return "even";
    if (multiplier < 10) return "mid";
    if (multiplier < 100) return "big";
    return "top";
  }

  function svg(name, attributes, parent) {
    var node = document.createElementNS(SVG_NS, name);
    Object.keys(attributes || {}).forEach(function (key) { node.setAttribute(key, attributes[key]); });
    if (parent) parent.appendChild(node);
    return node;
  }

  // The geometry of a board of `rows` rows: row r holds r + 3 pegs, and the
  // rows + 1 slots sit between the rows + 2 pegs of the last row. A ball's
  // offset from the centre counts half gaps: every bounce moves it one.
  function geometry(rows) {
    var width = (rows + 3) * GAP;
    var slotTop = TOP + (rows - 1) * ROW + ROW * 0.72;
    return {
      rows: rows,
      width: width,
      height: slotTop + SLOT + 10,
      centre: width / 2,
      slotTop: slotTop,
      pegY: function (row) { return TOP + row * ROW; },
      x: function (offset) { return width / 2 + offset * GAP / 2; }
    };
  }

  var board = { geometry: null, slots: [], pegs: [], balls: null };

  function drawBoard() {
    var rows = state.settings.rows, risk = state.settings.risk;
    var geo = geometry(rows);
    var pays = Engine.pays(rows, risk);
    el.board.textContent = "";
    el.board.setAttribute("viewBox", "0 0 " + geo.width + " " + geo.height);
    board = { geometry: geo, slots: [], pegs: [], balls: null };
    var pegs = svg("g", { "class": "pegs" }, el.board);
    for (var row = 0; row < rows; row++) {
      var line = [];
      for (var j = 0; j < row + 3; j++) {
        line.push(svg("circle", { "class": "peg", cx: geo.x(2 * j - (row + 2)), cy: geo.pegY(row), r: PEG }, pegs));
      }
      board.pegs.push(line);
    }
    var slots = svg("g", { "class": "slots" }, el.board);
    pays.forEach(function (multiplier, slot) {
      var group = svg("g", { "class": "slot tier-" + tierOf(multiplier), "data-slot": String(slot) }, slots);
      var x = geo.x(2 * slot - rows);
      svg("rect", { x: x - GAP / 2 + 2, y: geo.slotTop, width: GAP - 4, height: SLOT, rx: 6 }, group);
      svg("text", { x: x, y: geo.slotTop + SLOT / 2 + 1 }, group);
      board.slots.push(group);
    });
    board.balls = svg("g", { "class": "balls" }, el.board);
    renderBoardLabel();
    renderReturn();
  }

  function renderBoardLabel() {
    el.board.setAttribute("aria-label", t("boardLabel", { rows: state.settings.rows, risk: t(riskWord(state.settings.risk)).toLowerCase() }));
    var pays = Engine.pays(state.settings.rows, state.settings.risk);
    board.slots.forEach(function (group, slot) {
      var label = group.querySelector("text");
      label.textContent = times(pays[slot], true);
      // A long multiple is pressed to the width of its slot.
      if (label.textContent.length > 4) {
        label.setAttribute("textLength", String(GAP - 9));
        label.setAttribute("lengthAdjust", "spacingAndGlyphs");
      } else {
        label.removeAttribute("textLength");
        label.removeAttribute("lengthAdjust");
      }
    });
  }

  function riskWord(risk) {
    return { low: "riskLow", medium: "riskMedium", high: "riskHigh" }[risk];
  }

  // Where a ball is when it meets the peg of `row` it bounces on, or when it
  // comes to rest in a slot.
  function contactPoint(geo, row, offset) {
    return { x: geo.x(offset), y: geo.pegY(row) - PEG - BALL + 1 };
  }

  function restPoint(geo, slot) {
    return { x: geo.x(2 * slot - geo.rows), y: geo.slotTop + SLOT / 2 };
  }

  function lightPeg(row, offset) {
    var line = board.pegs[row];
    var peg = line && line[(offset + row + 2) / 2];
    if (!peg) return;
    peg.classList.remove("hit");
    void peg.getBoundingClientRect();
    peg.classList.add("hit");
  }

  function lightSlot(slot) {
    var group = board.slots[slot];
    if (!group) return;
    group.classList.remove("landed");
    void group.getBoundingClientRect();
    group.classList.add("landed");
  }

  var lastTick = 0;
  function tick(row) {
    var now = Date.now();
    if (now - lastTick < 45) return;
    lastTick = now;
    Sound.chip(row % 3);
  }

  // One ball down its path. It falls onto the middle peg of the first row
  // and, from each peg, hops half a gap left or right onto the next row,
  // until it drops into its slot. Resolves when the ball comes to rest.
  function animateBall(path, delay) {
    var geo = board.geometry;
    var slot = Engine.slotOf(path);
    if (reducedMotion.matches) return Promise.resolve(slot);
    // The ball's offset at every row it meets, then the slot it rests in.
    var offsets = [0];
    for (var row = 1; row < path.length; row++) offsets.push(offsets[row - 1] + (path.charAt(row - 1) === "R" ? 1 : -1));
    var points = [{ x: geo.centre, y: TOP - ROW * 1.4 }];
    offsets.forEach(function (offset, index) { points.push(contactPoint(geo, index, offset)); });
    points.push(restPoint(geo, slot));
    var step = STEP_MS * paceOf();
    return new Promise(function (resolve) {
      setTimeout(function () {
        var ball = svg("circle", { "class": "ball", r: BALL, cx: points[0].x, cy: points[0].y }, board.balls);
        var start = 0, reached = 0;
        function frame(now) {
          if (!start) start = now;
          var progress = (now - start) / step;
          var segment = Math.min(Math.floor(progress), points.length - 2);
          var within = Math.min(1, progress - segment);
          // Each peg met lights up and clicks once.
          while (reached < Math.min(segment, path.length)) {
            lightPeg(reached, offsets[reached]);
            tick(reached);
            reached++;
          }
          var from = points[segment], to = points[segment + 1];
          var x = from.x + (to.x - from.x) * within;
          // The first stretch is a fall; every other one a hop off a peg.
          var y = segment === 0 ? from.y + (to.y - from.y) * within * within
            : from.y + (to.y - from.y) * within - ROW * 0.42 * 4 * within * (1 - within);
          ball.setAttribute("cx", x.toFixed(1));
          ball.setAttribute("cy", y.toFixed(1));
          if (progress < points.length - 1) { global.requestAnimationFrame(frame); return; }
          ball.classList.add("resting");
          setTimeout(function () { ball.remove(); }, 260);
          resolve(slot);
        }
        global.requestAnimationFrame(frame);
      }, delay);
    });
  }

  /* ---------------- Rendering ---------------- */
  function renderBankroll() {
    el.bankroll.textContent = fmt(state.bankroll);
    el.lastWin.textContent = fmt(state.lastWin);
  }

  function flashBalance() {
    el.balancePill.classList.remove("win-flash");
    void el.balancePill.offsetWidth;
    el.balancePill.classList.add("win-flash");
  }

  function renderBet() {
    el.betAmount.textContent = fmt(bet());
    el.ballsLine.textContent = balls() > 1 ? t("ballsLine", { balls: balls(), amount: money(stake()) }) : "";
    el.chipTray.querySelectorAll(".chip").forEach(function (chip) {
      var on = Number(chip.getAttribute("data-value")) === bet();
      chip.setAttribute("aria-checked", String(on));
      chip.tabIndex = on ? 0 : -1;
    });
    el.ballsPicker.querySelectorAll("[data-balls]").forEach(function (button) {
      var on = Number(button.getAttribute("data-balls")) === balls();
      button.classList.toggle("active", on);
      button.setAttribute("aria-checked", String(on));
      button.tabIndex = on ? 0 : -1;
    });
    updateControls();
  }

  function renderPickers() {
    el.rowsPicker.querySelectorAll("[data-rows]").forEach(function (button) {
      var on = Number(button.getAttribute("data-rows")) === state.settings.rows;
      button.classList.toggle("active", on);
      button.setAttribute("aria-checked", String(on));
      button.tabIndex = on ? 0 : -1;
    });
    el.riskPicker.querySelectorAll("[data-risk]").forEach(function (button) {
      var on = button.getAttribute("data-risk") === state.settings.risk;
      button.classList.toggle("active", on);
      button.setAttribute("aria-checked", String(on));
      button.tabIndex = on ? 0 : -1;
    });
  }

  function renderReturn() {
    el.tableRtp.textContent = percent(Engine.returnFor(state.settings.rows, state.settings.risk));
  }

  function renderMeter() {
    el.ballsDown.textContent = String(state.meter.landed);
    el.ballsTotal.textContent = String(state.meter.total);
    el.lastMultiple.textContent = state.meter.last == null ? "–" : times(state.meter.last);
  }

  function renderHistory() {
    el.history.textContent = "";
    if (!state.history.length) {
      var empty = document.createElement("li");
      empty.className = "history-empty";
      empty.textContent = t("historyEmpty");
      el.history.appendChild(empty);
      return;
    }
    state.history.forEach(function (tenths) {
      var item = document.createElement("li");
      var multiplier = tenths / 10;
      item.className = "tier-" + tierOf(multiplier);
      item.textContent = times(multiplier);
      el.history.appendChild(item);
    });
  }

  // Every board's exact return, in the settings.
  function renderReturns() {
    var rows = $("returnRows");
    rows.textContent = "";
    Engine.ROWS.forEach(function (count) {
      var row = document.createElement("tr");
      var head = document.createElement("th");
      head.scope = "row";
      head.textContent = String(count);
      row.appendChild(head);
      Engine.RISKS.forEach(function (risk) {
        var cell = document.createElement("td");
        cell.textContent = percent(Engine.returnFor(count, risk));
        row.appendChild(cell);
      });
      rows.appendChild(row);
    });
  }

  function renderLimits() {
    el.tableMin.textContent = money(TRAY[0]);
    el.tableMax.textContent = money(TRAY[TRAY.length - 1]);
  }

  function renderStats() {
    var s = state.stats;
    var net = s.returned - s.wagered;
    $("stDrops").textContent = fmt(s.drops);
    $("stWinRate").textContent = (s.drops ? Math.round(s.winningDrops / s.drops * 100) : 0) + "%";
    $("stBest").textContent = s.bestMultiplier ? times(s.bestMultiplier / 10) : t("noneYet");
    $("stWagered").textContent = money(s.wagered);
    $("stReturned").textContent = money(s.returned);
    var netNode = $("stNet");
    netNode.textContent = (net < 0 ? "−" : "") + money(Math.abs(net));
    netNode.classList.toggle("positive", net > 0);
    netNode.classList.toggle("negative", net < 0);
    $("stBiggest").textContent = money(s.biggestWin);
  }

  function updateControls() {
    var ready = canDrop();
    el.btn.drop.disabled = !ready;
    el.btn.drop.classList.toggle("ready", ready && stake() <= state.bankroll);
    el.chipTray.querySelectorAll(".chip").forEach(function (chip) {
      chip.disabled = !ready;
      chip.classList.toggle("unaffordable", Number(chip.getAttribute("data-value")) * balls() > state.bankroll);
    });
    [el.ballsPicker, el.rowsPicker, el.riskPicker].forEach(function (picker) {
      picker.querySelectorAll("button").forEach(function (button) { button.disabled = !ready; });
    });
    $("depositAmount").disabled = !ready;
    document.querySelectorAll("[data-deposit], #btnDeposit, #btnResetStats").forEach(function (node) { node.disabled = !ready; });
    body.setAttribute("data-busy", String(state.busy || state.phase !== "betting"));
    // A drop's stake leaves the balance at once; nothing waits on the board between drops.
    body.setAttribute("data-wager", "0");
  }

  function setPhase(phase) {
    state.phase = phase;
    body.setAttribute("data-phase", phase);
    updateControls();
  }

  /* ---------------- A drop ---------------- */
  // Credits the account, records the drop, keeps its multiples for the
  // history and closes the saved round.
  function commitRound(settlement) {
    var bankroll = Store.normalizeBankroll(account.read("bankroll", state.bankroll));
    bankroll = Math.min(Store.MAX_BANKROLL, bankroll + settlement.returned);
    var stats = Store.recordRound(account.read("stats", state.stats), settlement);
    var history = Store.addHistory(account.read("history", state.history), settlement);
    account.write("bankroll", bankroll);
    account.write("stats", stats);
    account.write("history", history);
    account.remove("round");
    state.bankroll = bankroll;
    state.stats = stats;
    state.history = history;
    state.lastWin = settlement.returned;
    renderStats();
    renderHistory();
  }

  // A drop left unfinished by a reload, a crash or a closed tab is settled
  // with the very paths it drew, on the board it was dropped on. One that
  // cannot be trusted is voided and its stake returned.
  function recoverRound() {
    var raw = account.read("round", null);
    if (raw == null) return null;
    var round = Store.normalizeRound(raw);
    if (!round) {
      var bankroll = Store.normalizeBankroll(account.read("bankroll", Store.START_BANKROLL));
      var paths = raw && Array.isArray(raw.paths) && Engine.BALLS.indexOf(raw.paths.length) !== -1 ? raw.paths.length : 1;
      var refund = raw && Engine.normalizeBet(raw.bet) ? raw.bet * paths : 0;
      state.bankroll = Math.min(Store.MAX_BANKROLL, bankroll + refund);
      account.write("bankroll", state.bankroll);
      account.remove("round");
      toast(t("roundVoided"), "lose");
      return { voided: true };
    }
    var settlement = Engine.settle(round.bet, round.rows, round.risk, round.paths);
    commitRound(settlement);
    state.settings.rows = round.rows;
    state.settings.risk = round.risk;
    state.settings.bet = round.bet;
    state.settings.balls = round.paths.length;
    saveSettings();
    state.meter = { landed: round.paths.length, total: round.paths.length, last: settlement.balls[settlement.balls.length - 1].multiplier };
    toast(t("roundRestored", { result: resultText(settlement) }), settlement.net > 0 ? "win" : "");
    return { settlement: settlement };
  }

  function drop() {
    if (!canDrop()) return;
    var cost = stake(), count = balls();
    var rows = state.settings.rows, risk = state.settings.risk, perBall = bet();
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
      var paths = [];
      for (var i = 0; i < count; i++) paths.push(Engine.drop(rows));
      var round = { id: Store.newRoundId(), bet: perBall, rows: rows, risk: risk, paths: paths, at: Date.now() };
      // Every ball's path and the stake are saved before the first ball
      // falls, so a reload can neither drop again nor refund a loss.
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
      renderBet();
    }, function (error) {
      state.busy = false;
      setPhase("betting");
      toast(String(error && error.message || error), "lose");
    });
  }

  // The balls fall one after another, each lighting the pegs it meets and
  // the slot it lands in; the lot is paid when the last one comes to rest.
  async function playRound(round) {
    setPhase("dropping");
    renderBankroll();
    var settlement = Engine.settle(round.bet, round.rows, round.risk, round.paths);
    state.meter = { landed: 0, total: round.paths.length, last: null };
    renderMeter();
    setBanner(round.paths.length > 1 ? "droppingMany" : "dropping", { balls: round.paths.length });
    await Promise.all(round.paths.map(function (path, index) {
      return animateBall(path, Math.round(index * LAUNCH_MS * paceOf())).then(function (slot) {
        state.meter.landed += 1;
        state.meter.last = settlement.balls[index].multiplier;
        lightSlot(slot);
        renderMeter();
        if (settlement.balls[index].returned > round.bet) Sound.payout();
      });
    }));
    commitRound(settlement);
    var line = resultLine(settlement);
    setBanner(line.key, line.params, resultSub(settlement), settlement.net > 0 ? "win" : settlement.net < 0 ? "lose" : "");
    if (settlement.net > 0) {
      Sound.win();
      flashBalance();
    } else if (settlement.net < 0) {
      Sound.lose();
    } else {
      Sound.push();
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
    amount = Number(amount);
    amount = Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
    if (!amount) { toast(t("invalidDeposit"), "lose"); return; }
    if (!canDrop()) return;
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
    if (!canDrop()) return;
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

    el.ballsPicker.addEventListener("click", function (event) {
      var button = event.target.closest("[data-balls]");
      if (button && !button.disabled) setBalls(Number(button.getAttribute("data-balls")));
    });
    radioKeys(el.ballsPicker, "[data-balls]", function (button) { button.click(); });
    el.rowsPicker.addEventListener("click", function (event) {
      var button = event.target.closest("[data-rows]");
      if (button && !button.disabled) setRows(Number(button.getAttribute("data-rows")));
    });
    radioKeys(el.rowsPicker, "[data-rows]", function (button) { button.click(); });
    el.riskPicker.addEventListener("click", function (event) {
      var button = event.target.closest("[data-risk]");
      if (button && !button.disabled) setRisk(button.getAttribute("data-risk"));
    });
    radioKeys(el.riskPicker, "[data-risk]", function (button) { button.click(); });

    el.btn.drop.addEventListener("click", drop);
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
        renderHistory();
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
    var lower = key.length === 1 ? key.toLowerCase() : key;
    if ((key === " " || key === "Enter") && !onControl) { event.preventDefault(); drop(); return; }
    if (!canDrop()) {
      if (lower === "m") setSound(!soundEnabled);
      return;
    }
    if (lower >= "1" && lower <= "6") { selectChip(TRAY[Number(lower) - 1]); return; }
    switch (lower) {
      case "b": setBalls(cycle(Engine.BALLS, balls())); break;
      case "w": setRows(cycle(Engine.ROWS, state.settings.rows)); break;
      case "k": setRisk(cycle(Engine.RISKS, state.settings.risk)); break;
      case "m": setSound(!soundEnabled); break;
    }
  }

  /* ---------------- Start ---------------- */
  function translateAll() {
    I18n.apply(document);
    applyLanguageUI();
    applySoundUI();
    renderBanner();
    renderBet();
    renderBoardLabel();
    renderReturn();
    renderReturns();
    renderMeter();
    renderHistory();
    renderStats();
  }

  function init() {
    readAccountState();
    state.meter.total = balls();
    applyTheme(Pit.readTheme(safeStorage("localStorage")));
    applyAnimationSpeed();
    var volumes = Store.readJSON(safeStorage("localStorage"), Store.KEYS.audio, null);
    if (volumes) Sound.setVolumes(volumes);
    Sound.setEnabled(soundEnabled);
    renderLimits();
    Chips.decorateTray(el.chipTray);
    drawBoard();
    renderPickers();
    translateAll();
    bindControls();
    if (!account.shared) toast(t("temporaryAccount"));
    updateControls();
    renderBankroll();

    // A drop left unfinished by a reload, crash or closed tab is settled now.
    if (account.read("round", null) != null) {
      state.busy = true;
      updateControls();
      account.run(recoverRound, 2500).then(function () {
        state.busy = false;
        drawBoard();
        renderPickers();
        renderBet();
        renderMeter();
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
