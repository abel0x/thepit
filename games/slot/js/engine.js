/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Slot 5 — pure slot machine engine
   Five reels of thirty-two stops, three rows, twenty fixed lines, a
   wild, a scattered star and ten free spins at triple pay. Every spin
   picks one stop per reel at random; the return of the machine follows
   exactly from its reel strips and pays. No DOM, storage, network, or
   third-party dependencies.
   Exposed as window.SlotEngine and CommonJS for tests.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory(root && root.crypto);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SlotEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (cryptoSource) {
  "use strict";

  var REELS = 5;
  var ROWS = 3;
  var UINT32_RANGE = 0x100000000;

  // The wild stands in for every symbol but the star, and pays on its own.
  var WILD = "wild";
  // The star pays wherever it lands and three or more start the free spins.
  var SCATTER = "star";
  var SYMBOLS = ["wild", "star", "seven", "diamond", "bell", "horseshoe", "ace", "king", "queen", "jack"];

  // What three, four and five of a symbol pay on a line, from the left, in
  // line bets.
  var PAYS = {
    wild:      { 3: 50, 4: 250, 5: 1000 },
    seven:     { 3: 40, 4: 150, 5: 750 },
    diamond:   { 3: 25, 4: 100, 5: 400 },
    bell:      { 3: 15, 4: 60, 5: 250 },
    horseshoe: { 3: 10, 4: 40, 5: 150 },
    ace:       { 3: 8, 4: 25, 5: 100 },
    king:      { 3: 6, 4: 20, 5: 80 },
    queen:     { 3: 5, 4: 15, 5: 60 },
    jack:      { 3: 5, 4: 12, 5: 50 }
  };
  // What three, four and five stars pay anywhere, in total bets.
  var SCATTER_PAYS = { 3: 4, 4: 20, 5: 100 };
  var FREE_SPINS = 10;
  var FREE_MULTIPLIER = 3;

  // The bet on each line is chosen with a chip; every line is always played.
  var LINE_BETS = [1, 5, 10, 25, 50, 100];

  // The twenty lines, as the row (0 top, 1 middle, 2 bottom) on each reel.
  var LINES = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1],
    [1, 2, 1, 0, 1], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
    [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 2, 0, 0], [2, 2, 0, 2, 2], [0, 2, 2, 2, 0]
  ];

  // The reel strips, top to bottom. The outer reels carry one wild, the
  // inner reels two or three; each reel carries a single star.
  var STRIPS = [
    ["seven", "jack", "bell", "queen", "horseshoe", "king", "diamond", "ace", "jack", "star", "queen", "horseshoe", "king", "bell", "ace", "jack",
     "diamond", "queen", "wild", "king", "horseshoe", "ace", "jack", "seven", "queen", "bell", "king", "diamond", "ace", "horseshoe", "queen", "jack"],
    ["jack", "diamond", "queen", "wild", "king", "horseshoe", "ace", "bell", "jack", "seven", "queen", "horseshoe", "star", "king", "ace", "diamond",
     "jack", "wild", "bell", "queen", "horseshoe", "king", "ace", "seven", "jack", "diamond", "queen", "bell", "king", "horseshoe", "ace", "jack"],
    ["queen", "wild", "jack", "bell", "king", "diamond", "ace", "horseshoe", "queen", "seven", "jack", "wild", "king", "bell", "ace", "star",
     "horseshoe", "queen", "diamond", "jack", "king", "wild", "ace", "seven", "horseshoe", "queen", "bell", "jack", "king", "diamond", "ace", "horseshoe"],
    ["king", "jack", "diamond", "queen", "wild", "ace", "horseshoe", "bell", "jack", "seven", "king", "queen", "horseshoe", "ace", "star", "diamond",
     "jack", "bell", "king", "wild", "queen", "ace", "horseshoe", "seven", "jack", "diamond", "king", "bell", "queen", "horseshoe", "ace", "jack"],
    ["ace", "queen", "bell", "jack", "diamond", "king", "horseshoe", "seven", "queen", "jack", "ace", "star", "bell", "king", "horseshoe", "queen",
     "diamond", "jack", "ace", "wild", "king", "bell", "queen", "seven", "horseshoe", "jack", "diamond", "king", "ace", "queen", "horseshoe", "jack"]
  ];

  /* ---------------- Randomness ---------------- */
  // An unbiased integer in [0, n) from crypto.getRandomValues, with rejection
  // sampling so that no value is favoured by the 2^32 range.
  function randomInt(n, source) {
    if (!(n >= 1) || n > UINT32_RANGE || Math.floor(n) !== n) throw new RangeError("Bad range: " + n);
    if (typeof source === "function") {
      var sample = source();
      if (!(sample >= 0 && sample < 1)) throw new RangeError("Bad random source value");
      return Math.floor(sample * n);
    }
    var crypto = cryptoSource;
    if (!crypto || typeof crypto.getRandomValues !== "function") throw new Error("No secure random source");
    var limit = UINT32_RANGE - (UINT32_RANGE % n);
    var buffer = new Uint32Array(1);
    do { crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
    return buffer[0] % n;
  }

  // One stop per reel: the index of the strip's symbol in the top row.
  function spinStops(source) {
    return STRIPS.map(function (strip) { return randomInt(strip.length, source); });
  }

  function isStops(stops) {
    return Array.isArray(stops) && stops.length === REELS && stops.every(function (stop, reel) {
      return Number.isSafeInteger(stop) && stop >= 0 && stop < STRIPS[reel].length;
    });
  }

  // The symbols in sight, by reel and row.
  function windowAt(stops) {
    return stops.map(function (stop, reel) {
      var strip = STRIPS[reel];
      var column = [];
      for (var row = 0; row < ROWS; row++) column.push(strip[(stop + row) % strip.length]);
      return column;
    });
  }

  /* ---------------- Pays ---------------- */
  // What five symbols on a line pay, in line bets, counted from the left. A
  // line of wilds pays as wilds unless standing in for a symbol pays more;
  // a star ends the line.
  function lineWin(symbols) {
    var wilds = 0;
    while (wilds < REELS && symbols[wilds] === WILD) wilds++;
    var best = { symbol: WILD, count: wilds, pay: PAYS[WILD][wilds] || 0 };
    var target = null;
    for (var i = 0; i < REELS; i++) {
      if (symbols[i] !== WILD) { target = symbols[i]; break; }
    }
    if (target && target !== SCATTER) {
      var count = 0;
      while (count < REELS && (symbols[count] === target || symbols[count] === WILD)) count++;
      var pay = PAYS[target][count] || 0;
      if (pay > best.pay) best = { symbol: target, count: count, pay: pay };
    }
    return best.pay ? best : { symbol: null, count: 0, pay: 0 };
  }

  // Everything one spin pays. multiplier is 1 in the base game and
  // FREE_MULTIPLIER in the free spins. Wins are whole dollars.
  function evaluate(stops, lineBet, multiplier) {
    multiplier = multiplier || 1;
    var grid = windowAt(stops);
    var lines = [];
    LINES.forEach(function (rows, index) {
      var symbols = rows.map(function (row, reel) { return grid[reel][row]; });
      var won = lineWin(symbols);
      if (!won.pay) return;
      lines.push({
        line: index,
        symbol: won.symbol,
        count: won.count,
        win: won.pay * lineBet * multiplier,
        cells: rows.slice(0, won.count).map(function (row, reel) { return [reel, row]; })
      });
    });
    var stars = [];
    grid.forEach(function (column, reel) {
      column.forEach(function (symbol, row) { if (symbol === SCATTER) stars.push([reel, row]); });
    });
    var scatterWin = (SCATTER_PAYS[stars.length] || 0) * lineBet * LINES.length * multiplier;
    var lineTotal = lines.reduce(function (sum, line) { return sum + line.win; }, 0);
    return {
      stops: stops,
      grid: grid,
      lines: lines,
      scatter: { count: stars.length, win: scatterWin, cells: scatterWin ? stars : [] },
      multiplier: multiplier,
      win: lineTotal + scatterWin,
      trigger: stars.length >= 3
    };
  }

  function totalBet(lineBet) {
    return lineBet * LINES.length;
  }

  function isLineBet(value) {
    return LINE_BETS.indexOf(value) !== -1;
  }

  /* ---------------- A paid spin ---------------- */
  // Draws a paid spin and, when it brings three stars or more, the ten free
  // spins with it, all before anything is shown. The free spins never start
  // the feature again.
  function play(source) {
    var stops = spinStops(source);
    var free = null;
    if (evaluate(stops, 1).trigger) {
      free = [];
      for (var i = 0; i < FREE_SPINS; i++) free.push(spinStops(source));
    }
    return { stops: stops, free: free };
  }

  // True when a saved spin is one the machine could have drawn: real stops,
  // and free spins exactly when the paid spin started them.
  function isLegalSpin(spin) {
    if (!spin || !isStops(spin.stops)) return false;
    var trigger = evaluate(spin.stops, 1).trigger;
    if (!trigger) return spin.free == null;
    return Array.isArray(spin.free) && spin.free.length === FREE_SPINS && spin.free.every(isStops);
  }

  // The whole result of a paid spin: the paid spin itself, each free spin,
  // and what they return together.
  function settle(spin, lineBet) {
    var base = evaluate(spin.stops, lineBet, 1);
    var free = (spin.free || []).map(function (stops) { return evaluate(stops, lineBet, FREE_MULTIPLIER); });
    var freeWin = free.reduce(function (sum, result) { return sum + result.win; }, 0);
    var stake = totalBet(lineBet);
    var returned = base.win + freeWin;
    return { base: base, free: free, freeWin: freeWin, stake: stake, returned: returned, net: returned - stake };
  }

  /* ---------------- The machine's return ---------------- */
  // The exact long-run return of the machine, from its strips and pays: a
  // line sees one uniformly random stop on each reel, and a reel shows a star
  // in one of three rows wherever it stops within three stops of it.
  function returnToPlayer() {
    var counts = STRIPS.map(function (strip) {
      var c = {};
      strip.forEach(function (symbol) { c[symbol] = (c[symbol] || 0) + 1; });
      return c;
    });
    var lineReturn = 0;
    var symbols = [];
    (function walk(reel, probability) {
      if (reel === REELS) {
        lineReturn += probability * lineWin(symbols).pay;
        return;
      }
      Object.keys(counts[reel]).forEach(function (symbol) {
        symbols[reel] = symbol;
        walk(reel + 1, probability * counts[reel][symbol] / STRIPS[reel].length);
      });
    })(0, 1);

    // How many stars show, from each reel's share of stops that show one.
    var stars = [1];
    STRIPS.forEach(function (strip, reel) {
      var showing = 0;
      for (var stop = 0; stop < strip.length; stop++) {
        if (windowAt(stopsWith(reel, stop))[reel].indexOf(SCATTER) !== -1) showing++;
      }
      var p = showing / strip.length;
      var next = new Array(stars.length + 1).fill(0);
      stars.forEach(function (value, k) {
        next[k] += value * (1 - p);
        next[k + 1] += value * p;
      });
      stars = next;
    });
    var scatterReturn = stars.reduce(function (sum, p, k) { return sum + p * (SCATTER_PAYS[k] || 0); }, 0);
    var trigger = stars.slice(3).reduce(function (sum, p) { return sum + p; }, 0);
    var base = lineReturn + scatterReturn;
    var feature = trigger * FREE_SPINS * FREE_MULTIPLIER * base;
    return { line: lineReturn, scatter: scatterReturn, trigger: trigger, feature: feature, total: base + feature, stars: stars };
  }

  function stopsWith(reel, stop) {
    var stops = [0, 0, 0, 0, 0];
    stops[reel] = stop;
    return stops;
  }

  return {
    REELS: REELS,
    ROWS: ROWS,
    WILD: WILD,
    SCATTER: SCATTER,
    SYMBOLS: SYMBOLS,
    PAYS: PAYS,
    SCATTER_PAYS: SCATTER_PAYS,
    FREE_SPINS: FREE_SPINS,
    FREE_MULTIPLIER: FREE_MULTIPLIER,
    LINE_BETS: LINE_BETS,
    LINES: LINES,
    STRIPS: STRIPS,
    randomInt: randomInt,
    spinStops: spinStops,
    isStops: isStops,
    windowAt: windowAt,
    lineWin: lineWin,
    evaluate: evaluate,
    totalBet: totalBet,
    isLineBet: isLineBet,
    play: play,
    isLegalSpin: isLegalSpin,
    settle: settle,
    returnToPlayer: returnToPlayer
  };
});
