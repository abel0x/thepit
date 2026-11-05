/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 37 — the table
   Betting, the spin, settlement and every interaction. Pure client-side,
   offline. Results come from RouletteEngine.spin (crypto.getRandomValues).
   ========================================================= */
(function () {
  "use strict";

  var global = window;
  var Engine = global.RouletteEngine;
  var Layout = global.BoardLayout;
  var Chips = global.ChipArt;
  var Store = global.TableStore;
  var WheelView = global.RouletteWheel;
  var Pit = global.Pit;
  if (!Engine || !Layout || !Chips || !Store || !WheelView || !Pit) {
    throw new Error("Table modules must load before game.js");
  }

  var SVG_NS = "http://www.w3.org/2000/svg";
  // The chips this table offers, as its tray shows them; the smallest is the table minimum.
  var TRAY = Chips.trayValues(document.getElementById("chipTray"));
  var MIN_CHIP = TRAY[0];
  var HISTORY_STRIP = 16;
  var ANIMATION_SCALES = { fast: 0.6, normal: 1, cinematic: 1.35 };
  var SPIN_PACE = { fast: 0.62, normal: 1, cinematic: 1.4 };
  var FRENCH_FELT = {
    feltLow: "MANQUE", feltEven: "PAIR", feltOdd: "IMPAIR", feltHigh: "PASSE",
    feltDozen1: "P 12", feltDozen2: "M 12", feltDozen3: "D 12", feltColumn: "2 à 1"
  };

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
    history: [],
    settings: loadSettings(),
    bets: {},
    actions: [],
    lastBets: {},
    chip: 25,
    phase: "betting",
    busy: false,
    lastWin: 0,
    view: "board",
    layout: "wide",
    trackMode: "inline",
    winning: null,
    hoverKey: null,
    focusPoint: { x: 4.5, y: 1.5 },
    focusKey: null
  };

  function readAccountState() {
    var snap = account.snapshot();
    state.bankroll = snap.bankroll;
    state.stats = snap.stats;
    state.history = snap.history;
    state.lastBets = Engine.normalizeBets(account.read("lastBets", {}));
  }

  // The cloth belongs to the whole pit; the other settings belong to this table.
  function loadSettings() {
    var local = safeStorage("localStorage");
    var settings = Store.normalizeSettings(Store.readJSON(local, Store.KEYS.settings, null));
    settings.theme = Pit.readTheme(local);
    return settings;
  }

  function saveSettings() {
    var local = safeStorage("localStorage");
    Store.writeJSON(local, Store.KEYS.settings, state.settings);
    Pit.writeTheme(local, state.settings.theme);
  }

  /* ---------------- DOM ---------------- */
  var body = document.body;
  var el = {
    bankroll: $("bankroll"),
    balancePill: $("balancePill"),
    felt: $("tableFelt"),
    wheelZone: $("wheelZone"),
    wheelWell: $("wheelWell"),
    wheel: $("wheel"),
    medal: $("resultMedal"),
    medalNumber: $("resultNumber"),
    medalWord: $("resultWord"),
    historyStrip: $("historyStrip"),
    banner: $("banner"),
    bannerText: $("bannerText"),
    bannerSub: $("bannerSub"),
    tableMin: $("tableMin"),
    tableMax: $("tableMax"),
    tableProfile: $("tableProfile"),
    layoutZone: $("layoutZone"),
    boardStage: $("boardStage"),
    board: $("board"),
    boardSvg: $("boardSvg"),
    boardChips: $("boardChips"),
    ghost: $("boardGhost"),
    dolly: $("dolly"),
    winDisplay: $("winDisplay"),
    tip: $("betTip"),
    trackStage: $("trackStage"),
    track: $("racetrack"),
    trackSvg: $("trackSvg"),
    chipTray: $("chipTray"),
    totalBet: $("totalBet"),
    lastWin: $("lastWin"),
    totalBetMini: $("totalBetMini"),
    lastWinMini: $("lastWinMini"),
    toast: $("toast"),
    focusLive: $("boardFocus"),
    subtitle: document.querySelector(".subtitle"),
    btn: {
      undo: $("btnUndo"), clear: $("btnClear"), double: $("btnDouble"), rebet: $("btnRebet"),
      track: $("btnTrack"), spin: $("btnSpin"), settings: $("settingsBtn"), stats: $("statsBtn"),
      sound: $("soundToggle"), deposit: $("btnDeposit"), resetStats: $("btnResetStats")
    }
  };

  var motionPreference = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)");
  var reducedMotion = !!(motionPreference && motionPreference.matches);

  function motionTime(ms) {
    if (reducedMotion) return 0;
    return Math.round(ms * (ANIMATION_SCALES[state.settings.animationSpeed] || 1));
  }
  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, motionTime(ms)); }); }

  var wheel = WheelView.create(el.wheel, { reducedMotion: reducedMotion });

  /* ---------------- Toast & banner ---------------- */
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

  var bannerState = { key: "placeBets", params: null, tone: "" };
  var bannerResetTimer = 0;
  function setBanner(key, params, tone, call) {
    bannerState = { key: key, params: params || null, tone: tone || "" };
    renderBanner(call);
  }
  // A banner is one call, optionally with a smaller detail line beneath it.
  function renderBanner(call) {
    var text = typeof bannerState.key === "function" ? bannerState.key() : t(bannerState.key, bannerState.params);
    var detail = typeof text === "object" ? text.sub : "";
    el.bannerText.textContent = typeof text === "object" ? text.main : text;
    el.bannerSub.textContent = detail || "";
    el.banner.className = "banner" + (bannerState.tone ? " " + bannerState.tone : "");
    if (call && !reducedMotion) {
      void el.banner.offsetWidth;
      el.banner.classList.add("call");
    }
  }

  /* ---------------- Bets: naming ---------------- */
  function numbersText(bet) {
    if (bet.type === "sixLine") return bet.numbers[0] + "–" + bet.numbers[5];
    return bet.numbers.join("/");
  }

  function betName(key) {
    var bet = Engine.getBet(key);
    if (!bet) return key;
    switch (bet.type) {
      case "straight": return t("betNameStraight", { numbers: bet.numbers[0] });
      case "split": return t("betNameSplit", { numbers: numbersText(bet) });
      case "street": return t("betNameStreet", { numbers: numbersText(bet) });
      case "trio": return t("betNameTrio", { numbers: numbersText(bet) });
      case "corner": return t("betNameCorner", { numbers: numbersText(bet) });
      case "firstFour": return t("betNameFirstFour", { numbers: numbersText(bet) });
      case "sixLine": return t("betNameSixLine", { numbers: numbersText(bet) });
      case "column": return t("betNameColumn", { n: key.split(":")[1] });
      case "dozen":
        var d = Number(key.split(":")[1]);
        return t("betNameDozen", { n: d, range: ((d - 1) * 12 + 1) + "–" + d * 12 });
      default:
        return t("betName" + bet.type.charAt(0).toUpperCase() + bet.type.slice(1));
    }
  }

  function colorWord(n) {
    var color = Engine.colorOf(n);
    return t(color === "red" ? "colorRed" : color === "black" ? "colorBlack" : "colorGreen");
  }

  function resultText(n) {
    return n === 0 ? "0" : t("resultLine", { number: n, color: colorWord(n) });
  }

  /* ---------------- Bets: state changes ---------------- */
  function totalStake() { return Engine.totalStake(state.bets); }
  function available() { return state.bankroll - totalStake(); }
  function canBet() { return state.phase === "betting" && !state.busy; }

  function applyDeltas(deltas) {
    deltas.forEach(function (d) {
      var next = (state.bets[d.key] || 0) + d.delta;
      if (next > 0) state.bets[d.key] = next;
      else delete state.bets[d.key];
    });
  }

  // Adds a group of chips as one undoable action. Every part must fit the
  // balance; parts over a table maximum are trimmed, empty ones dropped.
  function addBets(list, options) {
    options = options || {};
    if (!canBet()) return false;
    var deltas = [];
    var limited = false;
    var extra = 0;
    var pending = {};
    list.forEach(function (item) {
      var bet = Engine.getBet(item.key);
      var amount = Engine.wholeAmount(item.amount);
      if (!bet || !amount) return;
      var current = (state.bets[item.key] || 0) + (pending[item.key] || 0);
      var room = Store.betLimit(item.key) - current;
      if (amount > room) { amount = Math.max(0, room); limited = true; }
      if (!amount) return;
      pending[item.key] = (pending[item.key] || 0) + amount;
      deltas.push({ key: item.key, delta: amount });
      extra += amount;
    });
    if (!deltas.length) {
      if (limited) {
        var only = list.length === 1 ? list[0].key : null;
        toast(only ? t("tableLimit", { amount: money(Store.betLimit(only)) }) : t("tableLimit", { amount: money(Store.STRAIGHT_MAX) }), "lose");
      }
      return false;
    }
    if (extra > available()) {
      toast(t(options.unavailable || "insufficientFunds"), "lose");
      return false;
    }
    applyDeltas(deltas);
    state.actions.push(deltas);
    if (limited) {
      var key = list.length === 1 ? list[0].key : null;
      toast(t("tableLimit", { amount: money(key ? Store.betLimit(key) : Store.STRAIGHT_MAX) }));
    }
    if (options.sound !== false) {
      if (deltas.length > 2) Sound.chipStack(Math.min(5, deltas.length));
      else Sound.chip(Object.keys(state.bets).length);
    }
    afterBetsChanged(deltas.map(function (d) { return d.key; }));
    return true;
  }

  function removeChip(key) {
    if (!canBet() || !state.bets[key]) return;
    var amount = Math.min(state.bets[key], state.chip);
    var deltas = [{ key: key, delta: -amount }];
    applyDeltas(deltas);
    state.actions.push(deltas);
    Sound.chip(1);
    afterBetsChanged([]);
  }

  function undo() {
    if (!canBet() || !state.actions.length) return;
    var deltas = state.actions.pop();
    applyDeltas(deltas.map(function (d) { return { key: d.key, delta: -d.delta }; }));
    Sound.chip(2);
    afterBetsChanged([]);
  }

  function clearBets() {
    if (!canBet() || !totalStake()) return;
    var deltas = Object.keys(state.bets).map(function (key) { return { key: key, delta: -state.bets[key] }; });
    applyDeltas(deltas);
    state.actions.push(deltas);
    Sound.chipsPush();
    afterBetsChanged([]);
  }

  function doubleBets() {
    if (!canBet() || !totalStake()) return;
    var list = Object.keys(state.bets).map(function (key) { return { key: key, amount: state.bets[key] }; });
    addBets(list, { unavailable: "doubleUnavailable" });
  }

  function rebet() {
    if (!canBet() || totalStake() || !Object.keys(state.lastBets).length) return;
    var list = Object.keys(state.lastBets).map(function (key) { return { key: key, amount: state.lastBets[key] }; });
    addBets(list, { unavailable: "rebetUnavailable" });
  }

  function placeChip(key) {
    addBets([{ key: key, amount: state.chip }]);
  }

  function placeAnnounced(name) {
    var list = Engine.announcedBets(name, state.chip);
    if (addBets(list, { unavailable: "announcedUnavailable" })) {
      toast(t("announcedPlaced", { name: t(name), chips: Engine.announcedUnits(name), unit: money(state.chip) }));
    }
  }

  function placeNeighbours(number) {
    var count = state.settings.neighbours;
    var list = Engine.neighbourBets(number, count, state.chip);
    if (addBets(list, { unavailable: "announcedUnavailable" })) {
      toast(t("neighboursPlaced", { number: number, count: count, chips: list.length, unit: money(state.chip) }));
    }
  }

  // The dolly comes off the layout as soon as the next round's betting starts.
  function clearWinner() {
    if (state.winning == null) return;
    state.winning = null;
    el.dolly.hidden = true;
    Object.keys(board.glows).forEach(function (key) { board.glows[key].classList.remove("win"); });
    el.trackSvg.querySelectorAll(".track-cell.win").forEach(function (node) { node.classList.remove("win"); });
  }

  function afterBetsChanged(changedKeys) {
    if (totalStake()) {
      clearWinner();
      if (bannerState.key !== "placeBets") {
        clearTimeout(bannerResetTimer);
        setBanner("placeBets", null, "", false);
      }
    }
    renderChips(changedKeys);
    renderBankroll();
    updateControls();
    if (state.hoverKey) showTip(state.hoverKey);
    if (document.activeElement === el.board && state.focusKey) announceFocus();
  }

  /* ---------------- Rendering: balance & controls ---------------- */
  function renderBankroll() {
    var shown = state.bankroll - (state.phase === "betting" ? totalStake() : 0);
    el.bankroll.textContent = fmt(Math.max(0, shown));
    el.totalBet.textContent = fmt(totalStake());
    el.lastWin.textContent = fmt(state.lastWin);
    el.totalBetMini.textContent = el.totalBet.textContent;
    el.lastWinMini.textContent = el.lastWin.textContent;
    body.setAttribute("data-wager", String(totalStake()));
  }

  function flashBalance() {
    el.balancePill.classList.remove("win-flash");
    void el.balancePill.offsetWidth;
    el.balancePill.classList.add("win-flash");
  }

  function updateControls() {
    var betting = canBet();
    var staked = totalStake() > 0;
    el.btn.undo.disabled = !betting || !state.actions.length;
    el.btn.clear.disabled = !betting || !staked;
    el.btn.double.disabled = !betting || !staked;
    el.btn.rebet.disabled = !betting || staked || !Object.keys(state.lastBets).length;
    el.btn.spin.disabled = !betting || !staked;
    el.btn.spin.classList.toggle("ready", betting && staked);
    el.btn.track.disabled = state.trackMode === "hidden";
    el.btn.track.setAttribute("aria-pressed", String(trackVisible()));
    el.btn.deposit.disabled = !betting;
    el.btn.resetStats.disabled = !betting;
    document.querySelectorAll(".preset-btn").forEach(function (b) { b.disabled = !betting; });
    $("depositAmount").disabled = !betting;
    document.querySelectorAll("[data-profile]").forEach(function (b) {
      if (b.classList.contains("rule-profile")) b.disabled = !betting;
    });
    var avail = available();
    el.chipTray.querySelectorAll(".chip").forEach(function (chip) {
      chip.disabled = !betting;
      chip.classList.toggle("unaffordable", Number(chip.getAttribute("data-value")) > avail);
    });
    body.setAttribute("data-busy", String(state.busy || state.phase !== "betting"));
  }

  function setPhase(phase) {
    state.phase = phase;
    body.setAttribute("data-phase", phase);
    if (phase !== "betting") hideHover();
    updateControls();
  }

  function selectChip(value) {
    if (TRAY.indexOf(value) === -1) return;
    state.chip = value;
    el.chipTray.querySelectorAll(".chip").forEach(function (chip) {
      var on = Number(chip.getAttribute("data-value")) === value;
      chip.setAttribute("aria-checked", String(on));
      chip.tabIndex = on ? 0 : -1;
    });
    if (state.hoverKey) showGhost(state.hoverKey);
  }

  /* ---------------- History ---------------- */
  function renderHistory(fresh) {
    var strip = el.historyStrip;
    strip.innerHTML = "";
    strip.setAttribute("data-empty", t("noResultsYet"));
    var recent = state.history.slice(-HISTORY_STRIP).reverse();
    recent.forEach(function (n, index) {
      var li = document.createElement("li");
      li.className = "hist " + Engine.colorOf(n) + (fresh && index === 0 ? " fresh" : "");
      li.textContent = String(n);
      li.setAttribute("aria-label", n === 0 ? "0" : n + " " + colorWord(n));
      strip.appendChild(li);
    });
    var last = state.history[state.history.length - 1];
    el.wheel.setAttribute("aria-label", last == null ? t("rouletteWheel") : t("wheelResult", { result: resultText(last) }));
  }

  function showMedal(n) {
    var color = Engine.colorOf(n);
    el.medal.className = "result-medal " + color;
    el.medalNumber.textContent = String(n);
    el.medalWord.textContent = colorWord(n);
    void el.medal.offsetWidth;
    el.medal.classList.add("show");
  }
  function hideMedal() { el.medal.classList.remove("show"); }

  /* ---------------- Board ---------------- */
  var board = { model: null, scale: null, chipSize: 28, glows: {}, orientation: null };

  function svgNode(name, attrs, text) {
    var node = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, String(attrs[key])); });
    if (text != null) node.textContent = text;
    return node;
  }

  function points(list) {
    return list.map(function (p) { return p.x.toFixed(1) + "," + p.y.toFixed(1); }).join(" ");
  }

  function feltLabel(key) {
    if (state.settings.profile === "french" && FRENCH_FELT[key]) return FRENCH_FELT[key];
    return t(key);
  }

  function gradient(defs, id, stops) {
    var g = svgNode("linearGradient", { id: id, x1: 0, y1: 0, x2: 0, y2: 1 });
    stops.forEach(function (stop) { g.appendChild(svgNode("stop", { offset: stop[0], "stop-color": stop[1] })); });
    defs.appendChild(g);
  }

  function zeroShape(r, inset, vertical) {
    var x0 = r.x + inset, y0 = r.y + inset, x1 = r.x + r.w - inset, y1 = r.y + r.h - inset;
    if (vertical) {
      var tip = Math.min((y1 - y0) * 0.55, (x1 - x0) * 0.14);
      return [{ x: x0, y: y0 + tip }, { x: (x0 + x1) / 2, y: y0 }, { x: x1, y: y0 + tip }, { x: x1, y: y1 }, { x: x0, y: y1 }];
    }
    var point = Math.min((x1 - x0) * 0.42, (y1 - y0) * 0.16);
    return [{ x: x0 + point, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0 + point, y: y1 }, { x: x0, y: (y0 + y1) / 2 }];
  }

  function renderBoard() {
    var orientation = state.layout === "narrow" ? "vertical" : "horizontal";
    if (!board.model || board.orientation !== orientation) {
      board.model = Layout.createBoard(orientation);
      board.orientation = orientation;
    }
    var stage = el.boardStage;
    var w = stage.clientWidth;
    var h = stage.clientHeight;
    if (w < 60 || h < 60) return;
    var scale = board.model.fit(w - 6, h - 6);
    board.scale = scale;
    board.chipSize = Math.max(20, Math.min(54, Math.min(scale.sx, scale.sy) * (orientation === "vertical" ? 0.9 : 0.74)));
    el.board.style.width = scale.width.toFixed(1) + "px";
    el.board.style.height = scale.height.toFixed(1) + "px";
    el.board.style.setProperty("--chip", board.chipSize.toFixed(1) + "px");
    el.board.style.setProperty("--dolly", Math.max(16, board.chipSize * 0.78).toFixed(1) + "px");

    var svg = el.boardSvg;
    svg.innerHTML = "";
    svg.setAttribute("viewBox", "0 0 " + scale.width.toFixed(1) + " " + scale.height.toFixed(1));
    var defs = svgNode("defs");
    gradient(defs, "cellRed", [["0%", "#c81d27"], ["100%", "#8d0e16"]]);
    gradient(defs, "cellBlack", [["0%", "#2a2a2f"], ["100%", "#0d0d0f"]]);
    gradient(defs, "cellGreen", [["0%", "#139a52"], ["100%", "#065d2f"]]);
    svg.appendChild(defs);

    var vertical = orientation === "vertical";
    var patches = svgNode("g");
    var lines = svgNode("g", { opacity: "0.82" });
    var texts = svgNode("g");
    var glows = svgNode("g");
    board.glows = {};

    board.model.cells.forEach(function (cell) {
      var r = board.model.rectToView(cell, scale);
      var glowShape;
      if (cell.kind === "zero") {
        var outline = zeroShape(r, 0, vertical);
        lines.appendChild(svgNode("polygon", { class: "print-line", points: points(outline), stroke: "#ead9a6" }));
        patches.appendChild(svgNode("polygon", { class: "num-cell green", points: points(zeroShape(r, Math.min(r.w, r.h) * 0.12, vertical)) }));
        texts.appendChild(svgNode("text", {
          class: "num-text", x: (r.x + r.w / 2 + (vertical ? 0 : r.w * 0.06)).toFixed(1), y: (r.y + r.h / 2 + (vertical ? r.h * 0.08 : 0)).toFixed(1),
          "font-size": (Math.min(vertical ? r.h : r.w, 60) * 0.5).toFixed(1)
        }, "0"));
        glowShape = svgNode("polygon", { class: "glow", points: points(outline) });
      } else {
        lines.appendChild(svgNode("rect", { class: "print-line", x: r.x.toFixed(1), y: r.y.toFixed(1), width: r.w.toFixed(1), height: r.h.toFixed(1), stroke: "#ead9a6" }));
        if (cell.kind === "number") {
          var inset = Math.min(r.w, r.h) * 0.1;
          patches.appendChild(svgNode("rect", {
            class: "num-cell " + Engine.colorOf(cell.number),
            x: (r.x + inset).toFixed(1), y: (r.y + inset).toFixed(1),
            width: (r.w - inset * 2).toFixed(1), height: (r.h - inset * 2).toFixed(1),
            rx: (Math.min(r.w, r.h) * 0.08).toFixed(1)
          }));
          texts.appendChild(svgNode("text", {
            class: "num-text", x: (r.x + r.w / 2).toFixed(1), y: (r.y + r.h / 2).toFixed(1),
            "font-size": (Math.min(r.w, r.h) * (vertical ? 0.5 : 0.42)).toFixed(1)
          }, String(cell.number)));
        } else {
          drawOutside(cell, r, texts, vertical);
        }
        glowShape = svgNode("rect", { class: "glow", x: r.x.toFixed(1), y: r.y.toFixed(1), width: r.w.toFixed(1), height: r.h.toFixed(1) });
      }
      glows.appendChild(glowShape);
      board.glows[cell.key] = glowShape;
    });

    svg.appendChild(patches);
    svg.appendChild(lines);
    svg.appendChild(texts);
    svg.appendChild(glows);
    renderChips([]);
    if (state.winning != null) {
      markWinner(state.winning);
      if (!el.dolly.hidden) placeDolly(state.winning, false);
    }
  }

  function drawOutside(cell, r, texts, vertical) {
    var cx = r.x + r.w / 2;
    var cy = r.y + r.h / 2;
    var rotate = vertical && cell.kind !== "column";
    var along = rotate ? r.h : r.w;
    var across = rotate ? r.w : r.h;
    if (cell.key === "red" || cell.key === "black") {
      var dw = Math.min(along * 0.42, across * 1.2) / 2;
      var dh = across * 0.3;
      var shape = rotate
        ? [{ x: cx, y: cy - dw }, { x: cx + dh, y: cy }, { x: cx, y: cy + dw }, { x: cx - dh, y: cy }]
        : [{ x: cx - dw, y: cy }, { x: cx, y: cy - dh }, { x: cx + dw, y: cy }, { x: cx, y: cy + dh }];
      texts.appendChild(svgNode("polygon", { class: "diamond " + cell.key, points: points(shape) }));
      return;
    }
    var key = cell.kind === "column" ? "feltColumn"
      : cell.kind === "dozen" ? "feltDozen" + cell.key.split(":")[1]
      : { low: "feltLow", even: "feltEven", odd: "feltOdd", high: "feltHigh" }[cell.key];
    var label = feltLabel(key);
    var size = Math.max(8, Math.min(across * (cell.kind === "column" ? 0.3 : 0.36), along * 1.5 / Math.max(4, label.length), 19));
    var attrs = { class: "out-text", x: cx.toFixed(1), y: cy.toFixed(1), "font-size": size.toFixed(1) };
    if (rotate) attrs.transform = "rotate(-90 " + cx.toFixed(1) + " " + cy.toFixed(1) + ")";
    texts.appendChild(svgNode("text", attrs, label));
  }

  function anchorPoint(key) {
    var a = board.model.anchor(key);
    return board.model.toView(a.x, a.y, board.scale);
  }

  function renderChips(changedKeys) {
    if (!board.model || !board.scale) return;
    el.boardChips.innerHTML = "";
    var keys = Object.keys(state.bets);
    // Paint lower rows last so their stacks overlap the row above, like chips on felt.
    keys.sort(function (a, b) { return anchorPoint(a).y - anchorPoint(b).y; });
    keys.forEach(function (key) {
      var p = anchorPoint(key);
      var node = Chips.stack(document, state.bets[key], "bet-chip" + (changedKeys && changedKeys.indexOf(key) !== -1 ? " placed" : ""));
      node.style.left = p.x.toFixed(1) + "px";
      node.style.top = p.y.toFixed(1) + "px";
      node.setAttribute("data-key", key);
      el.boardChips.appendChild(node);
    });
  }

  function keyAtEvent(event) {
    if (!board.model || !board.scale) return null;
    var rect = el.board.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var vx = (event.clientX - rect.left) * board.scale.width / rect.width;
    var vy = (event.clientY - rect.top) * board.scale.height / rect.height;
    var p = board.model.fromView(vx, vy, board.scale);
    var tol = board.model.tolerance(board.scale, event.pointerType === "touch" ? 11 : 8);
    return board.model.hitTest(p.x, p.y, tol.tx, tol.ty);
  }

  function lightKeys(keys, on) {
    keys.forEach(function (key) {
      var bet = Engine.getBet(key);
      if (!bet) return;
      if (board.glows[key] && !bet.inside) board.glows[key].classList.toggle("lit", on);
      bet.numbers.forEach(function (n) {
        var glow = board.glows["straight:" + n];
        if (glow) glow.classList.toggle("lit", on);
      });
    });
  }

  function clearLit() {
    Object.keys(board.glows).forEach(function (key) { board.glows[key].classList.remove("lit"); });
    el.trackSvg.querySelectorAll(".lit").forEach(function (node) { node.classList.remove("lit"); });
  }

  function showGhost(key) {
    var p = anchorPoint(key);
    el.ghost.innerHTML = "";
    el.ghost.appendChild(Chips.face(document, Chips.label(state.chip), "chip-art"));
    Chips.paint(el.ghost, state.chip);
    el.ghost.style.left = p.x.toFixed(1) + "px";
    el.ghost.style.top = p.y.toFixed(1) + "px";
    el.ghost.hidden = false;
  }

  function tipText(key) {
    var bet = Engine.getBet(key);
    var stake = state.bets[key] ? t("chipsOnBet", { amount: money(state.bets[key]) }) : t("noChipsOnBet");
    return { name: betName(key), pays: t("payoutPays", { profit: bet.payout }), stake: stake, max: money(Store.betLimit(key)) };
  }

  function showTip(key, touch) {
    var info = tipText(key);
    el.tip.innerHTML = "";
    var name = document.createElement("b");
    name.textContent = info.name;
    var pays = document.createElement("span");
    pays.className = "tip-pay";
    pays.textContent = " · " + info.pays;
    el.tip.appendChild(name);
    el.tip.appendChild(pays);
    el.tip.appendChild(document.createElement("br"));
    el.tip.appendChild(document.createTextNode(info.stake + " · " + t("tableMaxLabel").toLowerCase() + " " + info.max));
    el.tip.hidden = false;
    var stageRect = el.boardStage.getBoundingClientRect();
    var boardRect = el.board.getBoundingClientRect();
    var p = anchorPoint(key);
    var x = boardRect.left - stageRect.left + p.x * boardRect.width / board.scale.width;
    var y = boardRect.top - stageRect.top + p.y * boardRect.height / board.scale.height;
    var tw = el.tip.offsetWidth;
    var th = el.tip.offsetHeight;
    var left = Math.max(2, Math.min(stageRect.width - tw - 2, x - tw / 2));
    var top = y - th - (touch ? 46 : 22);
    if (top < 2) top = y + (touch ? 40 : 22);
    el.tip.style.transform = "translate(" + left.toFixed(0) + "px, " + top.toFixed(0) + "px)";
  }

  function setHover(key, touch) {
    if (key === state.hoverKey && !touch) return;
    clearLit();
    state.hoverKey = key;
    if (!key) { hideHover(); return; }
    lightKeys([key], true);
    showGhost(key);
    showTip(key, touch);
  }

  function hideHover() {
    state.hoverKey = null;
    clearLit();
    el.ghost.hidden = true;
    el.tip.hidden = true;
  }

  var aiming = null;
  function bindBoard() {
    el.board.addEventListener("pointermove", function (event) {
      if (!canBet()) return;
      if (event.pointerType !== "mouse" && !aiming) return;
      setHover(keyAtEvent(event), event.pointerType !== "mouse");
    });
    el.board.addEventListener("pointerleave", function (event) {
      if (event.pointerType === "mouse" && !aiming) hideHover();
    });
    el.board.addEventListener("pointerdown", function (event) {
      if (!canBet() || event.button !== 0) return;
      Sound.unlock();
      aiming = { id: event.pointerId };
      try { el.board.setPointerCapture(event.pointerId); } catch (e) {}
      setHover(keyAtEvent(event), event.pointerType !== "mouse");
    });
    el.board.addEventListener("pointerup", function (event) {
      if (!aiming || aiming.id !== event.pointerId) return;
      aiming = null;
      var key = keyAtEvent(event);
      if (key && canBet()) placeChip(key);
      if (event.pointerType !== "mouse") hideHover();
      else if (key) setHover(key, false);
    });
    el.board.addEventListener("pointercancel", function () { aiming = null; hideHover(); });
    el.board.addEventListener("contextmenu", function (event) {
      event.preventDefault();
      var key = keyAtEvent(event);
      if (key) removeChip(key);
    });
    el.board.addEventListener("focus", function () {
      if (!state.focusKey) moveFocus(0, 0);
      else announceFocus();
      if (canBet()) setHover(state.focusKey, false);
    });
    el.board.addEventListener("blur", function () { if (!aiming) hideHover(); });
    el.board.addEventListener("keydown", onBoardKey);
  }

  /* ---------------- Keyboard betting ---------------- */
  // A half-cell lattice across the layout: arrow keys walk it until the
  // bet under the cursor changes, so every one of the 157 bets is reachable.
  function latticeX() {
    var xs = [-0.5];
    for (var x = 0; x <= 11.5; x += 0.5) xs.push(x);
    xs.push(12 + board.model.dims.columnWidth / 2);
    return xs;
  }
  function latticeY() {
    var d = board.model.dims;
    return [0.5, 1, 1.5, 2, 2.5, 3, 3 + d.dozenDepth / 2, 3 + d.dozenDepth + d.evenDepth / 2];
  }

  function moveFocus(dx, dy) {
    if (!board.model) return;
    var xs = latticeX();
    var ys = latticeY();
    var xi = nearestIndex(xs, state.focusPoint.x);
    var yi = nearestIndex(ys, state.focusPoint.y);
    var start = board.model.hitTest(xs[xi], ys[yi]);
    var key = start;
    for (var step = 0; step < 30 && (dx || dy); step++) {
      var nx = xi + dx;
      var ny = yi + dy;
      if (nx < 0 || nx >= xs.length || ny < 0 || ny >= ys.length) break;
      xi = nx;
      yi = ny;
      key = board.model.hitTest(xs[xi], ys[yi]);
      if (!key && ys[yi] > 3) {
        xi = nearestIndex(xs, Math.max(0.5, Math.min(11.5, xs[xi])));
        key = board.model.hitTest(xs[xi], ys[yi]);
      }
      if (key && key !== start) break;
    }
    if (!key) return;
    state.focusPoint = { x: xs[xi], y: ys[yi] };
    state.focusKey = key;
    if (canBet()) setHover(key, false);
    announceFocus();
  }

  function nearestIndex(list, value) {
    var best = 0;
    list.forEach(function (v, i) { if (Math.abs(v - value) < Math.abs(list[best] - value)) best = i; });
    return best;
  }

  // In the vertical layout the arrows follow the screen, not the table.
  function boardArrow(key) {
    var vertical = board.orientation === "vertical";
    switch (key) {
      case "ArrowLeft": return vertical ? [0, 1] : [-1, 0];
      case "ArrowRight": return vertical ? [0, -1] : [1, 0];
      case "ArrowUp": return vertical ? [-1, 0] : [0, -1];
      case "ArrowDown": return vertical ? [1, 0] : [0, 1];
    }
    return null;
  }

  function announceFocus() {
    if (!state.focusKey) return;
    var info = tipText(state.focusKey);
    el.focusLive.textContent = t("betFocus", { name: info.name, pays: info.pays, stake: info.stake });
  }

  function onBoardKey(event) {
    var arrow = boardArrow(event.key);
    if (arrow) {
      event.preventDefault();
      event.stopPropagation();
      moveFocus(arrow[0], arrow[1]);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      if (state.focusKey && canBet()) placeChip(state.focusKey);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      if (state.focusKey) removeChip(state.focusKey);
    }
  }

  /* ---------------- Racetrack ---------------- */
  var track = { model: null, orientation: null };

  function trackVisible() {
    if (state.trackMode === "inline") return state.settings.racetrack;
    if (state.trackMode === "swap") return state.view === "track";
    return false;
  }

  function trackPath(list, scale) {
    return list.map(function (p, i) {
      var v = track.model.toView(p.x, p.y, scale);
      return (i ? "L" : "M") + v.x.toFixed(1) + " " + v.y.toFixed(1);
    }).join(" ") + " Z";
  }

  function renderTrack() {
    if (!trackVisible()) return;
    var orientation = state.layout === "narrow" ? "vertical" : "horizontal";
    if (!track.model || track.orientation !== orientation) {
      track.model = Layout.createRacetrack(orientation);
      track.orientation = orientation;
    }
    var w = el.trackStage.clientWidth;
    var h = el.trackStage.clientHeight;
    if (w < 60 || h < 40) return;
    var scale = track.model.fit(w - 6, h - 6);
    el.track.style.width = scale.width.toFixed(1) + "px";
    el.track.style.height = scale.height.toFixed(1) + "px";
    var svg = el.trackSvg;
    svg.innerHTML = "";
    svg.setAttribute("viewBox", "0 0 " + scale.width.toFixed(1) + " " + scale.height.toFixed(1));
    var unit = Math.min(scale.sx, scale.sy);
    var vertical = orientation === "vertical";

    track.model.sections.forEach(function (section) {
      var g = svgNode("g", {
        class: "track-section", "data-section": section.name, role: "button", tabindex: 0,
        "aria-label": t("announcedLabel", { name: t(section.name), chips: Engine.announcedUnits(section.name), numbers: Engine.announcedNumbers(section.name).join(", ") })
      });
      g.appendChild(svgNode("path", { class: "section-fill", d: trackPath(section.points, scale) }));
      var label = track.model.toView(section.label.x, section.label.y, scale);
      var word = { voisins: "VOISINS", tiers: "TIERS", orphelins: "ORPHELINS", zero: "ZÉRO" }[section.name];
      // Labels read across the narrow inside of the track: its height on a
      // wide screen, its width on an upright phone.
      var across = vertical ? scale.sy * 2 : scale.sy * 2 * 0.42;
      var room = vertical ? scale.sy * 1.7 : scale.sx * 4.2;
      var size = Math.max(9, Math.min(across * (vertical ? 0.16 : 0.5), room / word.length * 1.45, 15));
      g.appendChild(svgNode("text", { x: label.x.toFixed(1), y: label.y.toFixed(1), "font-size": size.toFixed(1) }, word));
      svg.appendChild(g);
    });
    track.model.cells.forEach(function (cell) {
      var g = svgNode("g", {
        class: "track-cell " + Engine.colorOf(cell.number), "data-number": cell.number, role: "button", tabindex: 0,
        "aria-label": t("neighbourLabel", { number: cell.number, count: state.settings.neighbours })
      });
      g.appendChild(svgNode("path", { class: "cell-fill", d: trackPath(cell.points, scale) }));
      var label = track.model.toView(cell.label.x, cell.label.y, scale);
      g.appendChild(svgNode("text", { x: label.x.toFixed(1), y: label.y.toFixed(1), "font-size": Math.max(8, Math.min(unit * 0.5, 16)).toFixed(1) }, String(cell.number)));
      svg.appendChild(g);
    });
    svg.appendChild(svgNode("path", { class: "track-outline", d: trackPath(track.model.outline, scale) }));
    if (state.winning != null) markTrackWinner(state.winning);
  }

  function trackTarget(event) {
    var node = event.target.closest && event.target.closest(".track-cell, .track-section");
    return node && el.trackSvg.contains(node) ? node : null;
  }

  function lightTrack(node) {
    clearLit();
    if (!node) return;
    var numbers;
    if (node.classList.contains("track-section")) {
      var name = node.getAttribute("data-section");
      numbers = Engine.announcedNumbers(name);
      node.classList.add("lit");
      lightKeys(Engine.announcedBets(name, 1).map(function (b) { return b.key; }), true);
    } else {
      numbers = Engine.neighbours(Number(node.getAttribute("data-number")), state.settings.neighbours);
      lightKeys(numbers.map(function (n) { return "straight:" + n; }), true);
    }
    numbers.forEach(function (n) {
      var cell = el.trackSvg.querySelector('.track-cell[data-number="' + n + '"]');
      if (cell) cell.classList.add("lit");
    });
  }

  function activateTrack(node) {
    if (!node || !canBet()) return;
    Sound.unlock();
    if (node.classList.contains("track-section")) placeAnnounced(node.getAttribute("data-section"));
    else placeNeighbours(Number(node.getAttribute("data-number")));
  }

  function bindTrack() {
    el.trackSvg.addEventListener("pointermove", function (event) {
      if (canBet()) lightTrack(trackTarget(event));
    });
    el.trackSvg.addEventListener("pointerleave", clearLit);
    el.trackSvg.addEventListener("click", function (event) { activateTrack(trackTarget(event)); });
    el.trackSvg.addEventListener("focusin", function (event) { if (canBet()) lightTrack(trackTarget(event)); });
    el.trackSvg.addEventListener("focusout", clearLit);
    el.trackSvg.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      activateTrack(trackTarget(event));
    });
  }

  function toggleTrack() {
    if (state.trackMode === "hidden") return;
    if (state.trackMode === "swap") {
      state.view = state.view === "track" ? "board" : "track";
      body.setAttribute("data-view", state.view);
      hideHover();
    } else {
      state.settings.racetrack = !state.settings.racetrack;
      saveSettings();
    }
    layout();
  }

  /* ---------------- Screen layout ---------------- */
  function chooseLayout() {
    var w = global.innerWidth;
    var h = global.innerHeight;
    if (w > h) return "wide";
    return w >= 600 ? "stacked" : "narrow";
  }

  function px(value) { return parseFloat(value) || 0; }

  function layout() {
    var mode = chooseLayout();
    state.layout = mode;
    body.setAttribute("data-layout", mode);
    body.setAttribute("data-short", String(mode === "wide" && global.innerHeight < 560));

    var felt = el.felt;
    var cs = global.getComputedStyle(felt);
    var innerW = felt.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight);
    var innerH = felt.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom);
    var gapX = px(cs.columnGap);
    var gapY = px(cs.rowGap);
    var infoH = document.querySelector(".info-zone").offsetHeight;
    var wheelSize, trackMode = "swap", trackHeight = 0;

    // A horizontal layout is comfortable at about 0.36 of its width in height.
    if (mode === "wide") {
      wheelSize = Math.min(innerH, innerW * 0.37);
      var colW = innerW - wheelSize - gapX;
      var colH = innerH - infoH - gapY;
      trackHeight = Math.min(colW / 4.6, colH * 0.32);
      if (colH - trackHeight - gapY >= colW * 0.36 * 0.8 && trackHeight >= 88) trackMode = "inline";
    } else if (mode === "stacked") {
      wheelSize = Math.min(innerW * 0.44, innerH * 0.34);
      var restH = innerH - wheelSize - gapY;
      trackHeight = Math.min(innerW / 4.6, restH * 0.36);
      if (restH - trackHeight - gapY >= innerW * 0.36 * 0.85 && trackHeight >= 88) trackMode = "inline";
    } else {
      wheelSize = Math.max(92, Math.min(innerW * 0.34, innerH * 0.2, 150));
    }
    wheelSize = Math.max(80, Math.floor(wheelSize));
    state.trackMode = trackMode;
    if (trackMode === "inline") state.view = "board";
    body.setAttribute("data-track", trackMode === "inline" && !state.settings.racetrack ? "hidden" : trackMode);
    body.setAttribute("data-view", state.view);
    felt.style.setProperty("--wheel-size", wheelSize + "px");
    felt.style.setProperty("--track-height", trackMode === "inline" && state.settings.racetrack ? Math.floor(trackHeight) + "px" : "0px");

    // On phones the wheel is small until it spins, so paint it for its big size.
    var expanded = expandedWheel(wheelSize, innerW, innerH);
    wheel.setOverscale(mode === "narrow" ? expanded.scale : 1);
    // A phone turned sideways mid-spin already shows the wheel at full size.
    if (body.getAttribute("data-wheel") === "expanded") {
      if (mode === "narrow") applyWheelExpansion();
      else body.removeAttribute("data-wheel");
    }

    renderBoard();
    renderTrack();
    updateControls();
  }

  function expandedWheel(wheelSize, innerW, innerH) {
    var target = Math.min(innerW * 0.94, innerH * 0.74);
    return { scale: Math.max(1, target / wheelSize) };
  }

  function applyWheelExpansion() {
    var well = el.wheelWell;
    var size = well.offsetWidth;
    // Measure the resting position (offsetLeft/Top ignore the transform).
    var x = 0, y = 0, node = well;
    while (node && node !== el.felt) { x += node.offsetLeft; y += node.offsetTop; node = node.offsetParent; }
    var cs = global.getComputedStyle(el.felt);
    var innerW = el.felt.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight);
    var innerH = el.felt.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom);
    var scale = expandedWheel(size, innerW, innerH).scale;
    // Offsets are measured from the felt's padding edge, like the target.
    var cx = el.felt.clientWidth / 2;
    var cy = el.felt.clientHeight * 0.44;
    el.felt.style.setProperty("--wheel-dx", (cx - (x + size / 2)).toFixed(1) + "px");
    el.felt.style.setProperty("--wheel-dy", (cy - (y + size / 2)).toFixed(1) + "px");
    el.felt.style.setProperty("--wheel-scale", scale.toFixed(3));
  }

  function expandWheel(on) {
    if (state.layout !== "narrow") { body.removeAttribute("data-wheel"); return Promise.resolve(); }
    if (on) applyWheelExpansion();
    if (on) body.setAttribute("data-wheel", "expanded");
    else body.removeAttribute("data-wheel");
    return delay(on ? 380 : 520);
  }

  var layoutTimer = 0;
  function scheduleLayout() {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(layout, 60);
  }

  /* ---------------- The spin ---------------- */
  function spinPace() { return SPIN_PACE[state.settings.animationSpeed] || 1; }

  function onWheelEvent(type, info) {
    if (info.late) return;
    if (type === "launch") Sound.launch();
    else if (type === "deflector") Sound.deflector();
    else if (type === "land") Sound.bounce(1);
    else if (type === "hop") Sound.bounce(info.strength);
    else if (type === "pocket") Sound.drop();
  }

  function startSpin() {
    if (!canBet()) return;
    var stake = totalStake();
    if (!stake) { toast(t("minBet"), "lose"); return; }
    Sound.unlock();
    state.busy = true;
    hideHover();
    updateControls();
    var bets = Engine.normalizeBets(state.bets);
    var profile = state.settings.profile;
    account.run(function () {
      recoverRound();
      var elsewhere = account.roundsElsewhere();
      if (elsewhere.length) return { elsewhere: elsewhere[0] };
      var bankroll = Store.normalizeBankroll(account.read("bankroll", Store.START_BANKROLL));
      if (stake > bankroll) {
        state.bankroll = bankroll;
        return { insufficient: true };
      }
      var result = Engine.spin();
      var round = { id: Store.newRoundId(), bets: bets, stake: stake, result: result, profile: profile, at: Date.now() };
      // The result and the stake are saved before the ball is launched, so a
      // reload can neither re-roll this spin nor refund a losing bet.
      account.write("round", round);
      account.write("bankroll", bankroll - stake);
      state.bankroll = bankroll - stake;
      state.lastBets = bets;
      account.write("lastBets", bets);
      return playRound(round);
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

  function playRound(round) {
    setPhase("spinning");
    state.actions = [];
    clearWinner();
    hideMedal();
    renderBankroll();
    setBanner("noMoreBets", null, "", true);
    Sound.noMoreBets();
    if (state.trackMode === "swap" && state.view === "track") {
      state.view = "board";
      body.setAttribute("data-view", "board");
      renderBoard();
    }
    return expandWheel(true).then(function () {
      return wheel.spin(round.result, {
        pace: spinPace(),
        onEvent: onWheelEvent,
        onRoll: function (value) { Sound.roll(value); }
      });
    }).then(function (number) {
      Sound.roll(0);
      return announceResult(number).then(function () { return settleRound(round); });
    });
  }

  function announceResult(number) {
    state.winning = number;
    showMedal(number);
    setBanner(function () {
      var info = Engine.describe(number);
      if (number === 0) return { main: "0 · " + t("colorGreen"), sub: "" };
      return { main: resultText(number), sub: t(info.parity === "odd" ? "parityOdd" : "parityEven") + " · " + t(info.range === "low" ? "rangeLow" : "rangeHigh") };
    }, null, "", true);
    state.history.push(number);
    state.history = Store.normalizeHistory(state.history);
    renderHistory(true);
    return delay(state.layout === "narrow" ? 1250 : 350).then(function () {
      return expandWheel(false);
    }).then(function () {
      markWinner(number);
      placeDolly(number, true);
      return delay(650);
    });
  }

  function markWinner(number) {
    Object.keys(board.glows).forEach(function (key) { board.glows[key].classList.remove("win"); });
    var glow = board.glows["straight:" + number];
    if (glow) glow.classList.add("win");
    markTrackWinner(number);
  }

  function markTrackWinner(number) {
    el.trackSvg.querySelectorAll(".track-cell.win").forEach(function (node) { node.classList.remove("win"); });
    var cell = el.trackSvg.querySelector('.track-cell[data-number="' + number + '"]');
    if (cell) cell.classList.add("win");
  }

  function placeDolly(number, animate) {
    if (!board.model) return;
    var p = anchorPoint("straight:" + number);
    el.dolly.style.left = p.x.toFixed(1) + "px";
    el.dolly.style.top = p.y.toFixed(1) + "px";
    el.dolly.hidden = false;
    el.dolly.classList.remove("drop");
    if (animate && !reducedMotion) {
      void el.dolly.offsetWidth;
      el.dolly.classList.add("drop");
      Sound.chip(3);
    }
  }

  function settleRound(round) {
    setPhase("settling");
    var settlement = Engine.settle(round.bets, round.result, { laPartage: round.profile === "french" });
    var byKey = {};
    settlement.lines.forEach(function (line) { byKey[line.key] = line; });
    var wheelRect = el.wheelWell.getBoundingClientRect();
    var boardRect = el.board.getBoundingClientRect();
    var toWheelX = wheelRect.left + wheelRect.width / 2 - boardRect.left;
    var toWheelY = wheelRect.top + wheelRect.height / 2 - boardRect.top;

    // Losing chips are raked toward the wheel.
    var losing = false;
    el.boardChips.querySelectorAll(".bet-chip").forEach(function (node) {
      var line = byKey[node.getAttribute("data-key")];
      if (!line || line.outcome !== "lose") return;
      losing = true;
      var x = px(node.style.left);
      var y = px(node.style.top);
      node.style.setProperty("--sweep-x", ((toWheelX - x) * 0.35).toFixed(0) + "px");
      node.style.setProperty("--sweep-y", ((toWheelY - y) * 0.35).toFixed(0) + "px");
      node.classList.add("losing");
    });
    if (losing) Sound.chipsPush();

    return delay(losing ? 600 : 150).then(function () {
      // Winners are paid beside their bet; La Partage halves stay on the felt.
      var paid = false;
      settlement.lines.forEach(function (line) {
        var node = el.boardChips.querySelector('.bet-chip[data-key="' + cssEscape(line.key) + '"]');
        if (!node) return;
        if (line.outcome === "lose") { node.remove(); return; }
        var p = anchorPoint(line.key);
        if (line.outcome === "partage") {
          var half = Chips.stack(document, line.returned, "bet-chip");
          half.style.left = p.x.toFixed(1) + "px";
          half.style.top = p.y.toFixed(1) + "px";
          half.setAttribute("data-key", line.key);
          node.replaceWith(half);
          return;
        }
        paid = true;
        node.classList.add("winning");
        var payout = Chips.stack(document, line.returned - line.amount, "bet-chip payout");
        payout.style.left = (p.x + board.chipSize * 0.62).toFixed(1) + "px";
        payout.style.top = (p.y - board.chipSize * 0.18).toFixed(1) + "px";
        payout.style.setProperty("--from-x", ((toWheelX - p.x) * 0.4).toFixed(0) + "px");
        payout.style.setProperty("--from-y", ((toWheelY - p.y) * 0.4).toFixed(0) + "px");
        el.boardChips.appendChild(payout);
      });
      if (paid) Sound.payout();
      var partage = settlement.lines.some(function (line) { return line.outcome === "partage"; });
      announceSettlement(settlement, partage);
      return delay(settlement.returned ? 1150 : 500);
    }).then(function () {
      // Everything left on the felt goes back to the player.
      el.boardChips.querySelectorAll(".bet-chip").forEach(function (node) { node.classList.add("collect"); });
      commitSettlement(round, settlement);
      if (settlement.returned) {
        Sound.chipStack(3);
        flashBalance();
      }
      return delay(settlement.returned ? 650 : 0);
    }).then(function () {
      state.bets = {};
      state.actions = [];
      renderChips([]);
      setPhase("betting");
      restakeIfBroke();
      renderBankroll();
      updateControls();
      // The verdict stays readable; motion settings never shorten it.
      clearTimeout(bannerResetTimer);
      bannerResetTimer = setTimeout(function () {
        if (state.phase === "betting" && !totalStake()) setBanner("placeBets", null, "", false);
      }, 4000);
      return { settlement: settlement };
    });
  }

  function showWinDisplay(amount) {
    var box = el.winDisplay;
    box.querySelector(".win-amount").textContent = money(amount);
    box.querySelector(".win-label").textContent = t("winBadge");
    box.hidden = false;
    box.classList.remove("show");
    void box.offsetWidth;
    box.classList.add("show");
    clearTimeout(showWinDisplay.timer);
    showWinDisplay.timer = setTimeout(function () { box.classList.remove("show"); box.hidden = true; }, motionTime(2200) || 1600);
  }

  function announceSettlement(settlement, partage) {
    state.lastWin = settlement.returned;
    var net = settlement.net;
    if (settlement.returned > 0 && net > 0) showWinDisplay(settlement.returned);
    var tone = settlement.returned > 0 ? "flash-win" : "flash-lose";
    setBanner(function () {
      if (!settlement.returned) return t("noWin");
      return {
        main: net > 0 ? t("winLine", { amount: money(settlement.returned) }) : t("returnedLine", { amount: money(settlement.returned) }),
        sub: net > 0 ? t("netGain", { amount: money(net) }) : net < 0 ? t("netLoss", { amount: money(-net) }) : ""
      };
    }, null, tone, true);
    if (net > 0) {
      if (net >= settlement.stake * 10) Sound.bigWin();
      else Sound.win();
    } else if (!settlement.returned) {
      Sound.lose();
    }
    if (partage) toast(t("partageLine"));
  }

  // Credits the account, records the spin and closes the saved round.
  function commitSettlement(round, settlement) {
    var bankroll = Store.normalizeBankroll(account.read("bankroll", state.bankroll));
    bankroll = Math.min(Store.MAX_BANKROLL, bankroll + settlement.returned);
    var stats = Store.recordSpin(account.read("stats", state.stats), settlement);
    var history = Store.normalizeHistory(account.read("history", []).concat([round.result]));
    account.write("bankroll", bankroll);
    account.write("stats", stats);
    account.write("history", history);
    account.remove("round");
    state.bankroll = bankroll;
    state.stats = stats;
    state.history = history;
    renderBankroll();
    renderStats();
  }

  // Finishes a spin that a closed or crashed page left behind.
  function recoverRound() {
    var raw = account.read("round", null);
    if (raw == null) return null;
    var round = Store.normalizeRound(raw);
    var bankroll = Store.normalizeBankroll(account.read("bankroll", Store.START_BANKROLL));
    if (!round) {
      var refund = Engine.totalStake(Engine.normalizeBets(raw && raw.bets));
      account.write("bankroll", Math.min(Store.MAX_BANKROLL, bankroll + refund));
      account.remove("round");
      state.bankroll = Math.min(Store.MAX_BANKROLL, bankroll + refund);
      toast(t("roundVoided"), "lose");
      renderBankroll();
      return { voided: true };
    }
    var settlement = Engine.settle(round.bets, round.result, { laPartage: round.profile === "french" });
    commitSettlement(round, settlement);
    state.lastBets = round.bets;
    account.write("lastBets", round.bets);
    state.lastWin = settlement.returned;
    wheel.place(round.result);
    renderHistory(false);
    toast(t("roundRestored", { result: resultText(round.result) }), settlement.returned ? "win" : "");
    return { settlement: settlement };
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

  function cssEscape(value) {
    return global.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&");
  }

  /* ---------------- Statistics ---------------- */
  function renderStats() {
    var s = state.stats;
    $("stSpins").textContent = fmt(s.spins);
    $("stWinRate").textContent = I18n.percent(s.spins ? s.winningSpins / s.spins : 0);
    $("stWagered").textContent = money(s.wagered);
    $("stReturned").textContent = money(s.returned);
    var net = s.returned - s.wagered;
    var netEl = $("stNet");
    netEl.textContent = (net > 0 ? "+" : net < 0 ? "−" : "") + money(Math.abs(net));
    netEl.className = net > 0 ? "positive" : net < 0 ? "negative" : "";
    $("stBiggest").textContent = money(s.biggestWin);
  }

  function histItem(n, extra) {
    var li = document.createElement("li");
    var disc = document.createElement("span");
    disc.className = "hist " + Engine.colorOf(n);
    disc.textContent = String(n);
    li.appendChild(disc);
    if (extra) {
      var text = document.createElement("span");
      extra.forEach(function (part, i) {
        if (i) text.appendChild(document.createTextNode(" · "));
        var b = document.createElement(i === 0 ? "b" : "span");
        b.textContent = part;
        text.appendChild(b);
      });
      li.appendChild(text);
    }
    return li;
  }

  function distRow(title, parts, total) {
    var row = document.createElement("div");
    row.className = "dist-row";
    var head = document.createElement("div");
    head.className = "dist-head";
    var name = document.createElement("span");
    name.textContent = title;
    head.appendChild(name);
    row.appendChild(head);
    var bar = document.createElement("div");
    bar.className = "dist-bar";
    parts.forEach(function (part) {
      var span = document.createElement("span");
      span.className = part.cls;
      span.style.flexGrow = String(total ? part.value : 1);
      span.textContent = total ? I18n.percent(part.value / total) : "–";
      span.title = part.label + ": " + part.value;
      bar.appendChild(span);
    });
    row.appendChild(bar);
    return row;
  }

  function renderStatsDialog() {
    var summary = Engine.summarize(state.history, 500);
    $("statsSample").textContent = summary.spins ? t("statsSample", { count: fmt(summary.spins) }) : t("statsEmpty");
    var hot = $("hotNumbers");
    var cold = $("coldNumbers");
    hot.innerHTML = "";
    cold.innerHTML = "";
    if (summary.spins) {
      summary.hot.slice(0, 5).forEach(function (n) {
        hot.appendChild(histItem(n, [t("hitCount", { count: summary.counts[n] }), summary.lastSeen[n] === 0 ? resultText(n) : t("spinsAgo", { count: summary.lastSeen[n] })]));
      });
      summary.cold.slice(0, 5).forEach(function (n) {
        cold.appendChild(histItem(n, [t("hitCount", { count: summary.counts[n] }), summary.lastSeen[n] == null ? t("notSeen") : t("spinsAgo", { count: summary.lastSeen[n] })]));
      });
    }
    var tally = summary.tally;
    var dist = $("distribution");
    dist.innerHTML = "";
    dist.appendChild(distRow(t("distColors"), [
      { cls: "seg-red", value: tally.red, label: t("colorRed") },
      { cls: "seg-green", value: tally.green, label: t("colorGreen") },
      { cls: "seg-black", value: tally.black, label: t("colorBlack") }
    ], summary.spins));
    dist.appendChild(distRow(t("distParity"), [
      { cls: "seg-a", value: tally.odd, label: t("parityOdd") },
      { cls: "seg-b", value: tally.even, label: t("parityEven") }
    ], tally.odd + tally.even));
    dist.appendChild(distRow(t("distRange"), [
      { cls: "seg-a", value: tally.low, label: t("rangeLow") },
      { cls: "seg-b", value: tally.high, label: t("rangeHigh") }
    ], tally.low + tally.high));
    dist.appendChild(distRow(t("distDozens"), tally.dozens.map(function (value, i) {
      return { cls: ["seg-a", "seg-b", "seg-c"][i], value: value, label: (i * 12 + 1) + "–" + (i * 12 + 12) };
    }), tally.dozens[0] + tally.dozens[1] + tally.dozens[2]));
    dist.appendChild(distRow(t("distColumns"), tally.columns.map(function (value, i) {
      return { cls: ["seg-a", "seg-b", "seg-c"][i], value: value, label: String(i + 1) };
    }), tally.columns[0] + tally.columns[1] + tally.columns[2]));
    var grid = $("recentGrid");
    grid.innerHTML = "";
    state.history.slice(-60).reverse().forEach(function (n) {
      var li = document.createElement("li");
      li.className = "hist " + Engine.colorOf(n);
      li.textContent = String(n);
      grid.appendChild(li);
    });
  }

  /* ---------------- Settings ---------------- */
  function applyTheme() {
    body.setAttribute("data-theme", state.settings.theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", Pit.THEME_COLORS[state.settings.theme]);
    document.querySelectorAll("[data-set-theme]").forEach(function (b) {
      var on = b.getAttribute("data-set-theme") === state.settings.theme;
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }

  function applyProfile() {
    var french = state.settings.profile === "french";
    body.setAttribute("data-profile", state.settings.profile);
    el.subtitle.textContent = t(french ? "subtitleFrench" : "subtitle");
    el.tableProfile.textContent = t(french ? "profileShortFrench" : "profileShortEuropean");
    el.tableMin.textContent = money(MIN_CHIP);
    el.tableMax.textContent = money(Store.STRAIGHT_MAX);
    document.querySelectorAll(".rule-profile").forEach(function (b) {
      var on = b.getAttribute("data-profile") === state.settings.profile;
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }

  function applySpeed() {
    body.setAttribute("data-animation-speed", state.settings.animationSpeed);
    document.querySelectorAll("[data-set-animation]").forEach(function (b) {
      var on = b.getAttribute("data-set-animation") === state.settings.animationSpeed;
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }

  function applyNeighbours() {
    $("neighboursValue").textContent = String(state.settings.neighbours);
    $("neighboursDown").disabled = state.settings.neighbours <= 1;
    $("neighboursUp").disabled = state.settings.neighbours >= 9;
  }

  function applyLanguageUI() {
    document.querySelectorAll("[data-lang]").forEach(function (b) {
      var on = b.getAttribute("data-lang") === I18n.get();
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    document.querySelectorAll("[data-set-lang]").forEach(function (b) {
      var on = b.getAttribute("data-set-lang") === I18n.get();
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
  }

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
      account.write("stats", Store.normalizeStats(null));
      account.write("history", []);
      state.stats = Store.normalizeStats(null);
      state.history = [];
      renderStats();
      renderHistory(false);
      renderStatsDialog();
      toast(t("statsReset"));
    });
  }

  /* ---------------- Dialogs ---------------- */
  var openDialog = null;
  var dialogReturn = null;
  function focusables(modal) {
    return Array.prototype.filter.call(
      modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'),
      function (node) { return node.offsetParent !== null; }
    );
  }
  function openModal(modal) {
    if (openDialog) closeModal();
    dialogReturn = document.activeElement;
    openDialog = modal;
    modal.hidden = false;
    hideHover();
    var first = modal.querySelector(".modal-head [data-close]");
    if (first) first.focus();
  }
  function closeModal() {
    if (!openDialog) return;
    openDialog.hidden = true;
    openDialog = null;
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
    el.btn.undo.addEventListener("click", undo);
    el.btn.clear.addEventListener("click", clearBets);
    el.btn.double.addEventListener("click", doubleBets);
    el.btn.rebet.addEventListener("click", rebet);
    el.btn.track.addEventListener("click", toggleTrack);
    el.btn.spin.addEventListener("click", startSpin);
    el.btn.settings.addEventListener("click", function () { renderStats(); openModal($("settingsModal")); });
    el.btn.stats.addEventListener("click", function () { renderStatsDialog(); openModal($("statsModal")); });
    el.btn.sound.addEventListener("click", function () { setSound(!soundEnabled); });

    document.querySelectorAll(".modal").forEach(function (modal) {
      modal.addEventListener("click", function (event) {
        if (event.target.closest("[data-close]")) closeModal();
      });
      modal.addEventListener("keydown", function (event) {
        if (event.key !== "Tab") return;
        var items = focusables(modal);
        if (!items.length) return;
        var first = items[0];
        var last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      });
    });

    document.querySelectorAll("[data-lang], [data-set-lang]").forEach(function (b) {
      b.addEventListener("click", function () {
        I18n.setLanguage(b.getAttribute("data-lang") || b.getAttribute("data-set-lang"));
      });
    });
    var themePicker = document.querySelector(".theme-picker");
    themePicker.addEventListener("click", function (event) {
      var b = event.target.closest("[data-set-theme]");
      if (!b) return;
      state.settings.theme = b.getAttribute("data-set-theme");
      saveSettings();
      applyTheme();
    });
    radioKeys(themePicker, "[data-set-theme]", function (b) { b.click(); });
    var profilePicker = document.querySelector(".rule-profile-picker");
    profilePicker.addEventListener("click", function (event) {
      var b = event.target.closest(".rule-profile");
      if (!b || b.disabled || !canBet()) return;
      var next = b.getAttribute("data-profile");
      if (next === state.settings.profile) return;
      state.settings.profile = next;
      saveSettings();
      applyProfile();
      renderBoard();
      toast(t("profileApplied", { profile: t(next === "french" ? "profileFrench" : "profileEuropean") }));
    });
    radioKeys(profilePicker, ".rule-profile", function (b) { b.click(); });
    var speedSeg = document.querySelector(".animation-seg");
    speedSeg.addEventListener("click", function (event) {
      var b = event.target.closest("[data-set-animation]");
      if (!b) return;
      state.settings.animationSpeed = b.getAttribute("data-set-animation");
      saveSettings();
      applySpeed();
    });
    radioKeys(speedSeg, "[data-set-animation]", function (b) { b.click(); });
    $("neighboursDown").addEventListener("click", function () { changeNeighbours(-1); });
    $("neighboursUp").addEventListener("click", function () { changeNeighbours(1); });
    $("setSound").addEventListener("change", function (event) { setSound(event.target.checked); });
    document.querySelectorAll("[data-sound-level]").forEach(function (slider) {
      slider.addEventListener("input", function () {
        Sound.setVolume(slider.getAttribute("data-sound-level"), Number(slider.value) / 100);
        Store.writeJSON(safeStorage("localStorage"), Store.KEYS.audio, Sound.getVolumes());
        applySoundUI();
      });
      slider.addEventListener("change", function () { Sound.chip(1); });
    });
    el.btn.deposit.addEventListener("click", function () {
      var input = $("depositAmount");
      deposit(input.value);
      input.value = "";
    });
    $("depositAmount").addEventListener("keydown", function (event) {
      if (event.key === "Enter") { event.preventDefault(); el.btn.deposit.click(); }
    });
    document.querySelectorAll(".preset-btn").forEach(function (b) {
      b.addEventListener("click", function () { deposit(Number(b.getAttribute("data-deposit"))); });
    });
    el.btn.resetStats.addEventListener("click", resetStats);

    document.addEventListener("keydown", onGlobalKey);
    global.addEventListener("resize", scheduleLayout);
    if (typeof global.ResizeObserver === "function") new global.ResizeObserver(scheduleLayout).observe(el.felt);
    global.addEventListener("storage", function (event) {
      if (event.key === Pit.KEYS.theme) {
        state.settings.theme = Pit.readTheme(safeStorage("localStorage"));
        applyTheme();
      }
      if (Pit.isPitKey(event.key) && state.phase === "betting" && !state.busy && !account.isHeld()) {
        readAccountState();
        renderBankroll();
        renderHistory(false);
        renderStats();
        updateControls();
      }
    });
    if (motionPreference) {
      var onMotion = function (event) {
        reducedMotion = event.matches;
        wheel.setReducedMotion(reducedMotion);
      };
      if (motionPreference.addEventListener) motionPreference.addEventListener("change", onMotion);
      else if (motionPreference.addListener) motionPreference.addListener(onMotion);
    }
    // The first gesture anywhere unlocks audio on browsers that need it.
    document.addEventListener("pointerdown", function () { if (soundEnabled) Sound.unlock(); }, { once: true });
  }

  function changeNeighbours(step) {
    var next = Math.max(1, Math.min(9, state.settings.neighbours + step));
    if (next === state.settings.neighbours) return;
    state.settings.neighbours = next;
    saveSettings();
    applyNeighbours();
    renderTrack();
  }

  function onGlobalKey(event) {
    if (event.defaultPrevented || event.altKey || event.metaKey) return;
    if (openDialog) {
      if (event.key === "Escape") { event.preventDefault(); closeModal(); }
      return;
    }
    var target = event.target;
    var typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    if (typing) return;
    var onControl = target && target.closest && target.closest("button, a, summary, [role='button'], .board");
    var key = event.key;
    if (event.ctrlKey) {
      if (key.toLowerCase() === "z") { event.preventDefault(); undo(); }
      return;
    }
    if ((key === " " || key === "Enter") && !onControl) { event.preventDefault(); startSpin(); return; }
    if (key === "Escape") { hideHover(); return; }
    if (key === "Backspace" && !onControl) { event.preventDefault(); undo(); return; }
    var lower = key.length === 1 ? key.toLowerCase() : key;
    if (lower >= "1" && lower <= "6") { selectChip(TRAY[Number(lower) - 1]); return; }
    switch (lower) {
      case "z": undo(); break;
      case "c": clearBets(); break;
      case "d": doubleBets(); break;
      case "r": rebet(); break;
      case "t": toggleTrack(); break;
      case "m": setSound(!soundEnabled); break;
      case "i": renderStatsDialog(); openModal($("statsModal")); break;
    }
  }

  /* ---------------- Start ---------------- */
  function translateAll() {
    I18n.apply(document);
    applyLanguageUI();
    applyProfile();
    applySoundUI();
    renderBanner(false);
    renderHistory(false);
    renderStats();
    renderBankroll();
    renderBoard();
    renderTrack();
    if (openDialog && openDialog.id === "statsModal") renderStatsDialog();
    if (state.focusKey && document.activeElement === el.board) announceFocus();
  }

  function init() {
    readAccountState();
    var volumes = Store.readJSON(safeStorage("localStorage"), Store.KEYS.audio, null);
    if (volumes) Sound.setVolumes(volumes);
    Sound.setEnabled(soundEnabled);
    applyTheme();
    applySpeed();
    applyNeighbours();
    Chips.decorateTray(el.chipTray);
    selectChip(state.chip);
    I18n.onChange(translateAll);
    translateAll();
    bindBoard();
    bindTrack();
    bindControls();
    var last = state.history[state.history.length - 1];
    wheel.place(last == null ? Engine.WHEEL[Engine.randomInt(Engine.POCKETS)] : last);
    if (!account.shared) toast(t("temporaryAccount"));
    layout();
    if (global.document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(); });

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
    updateControls();
    renderBankroll();
  }

  init();
})();
