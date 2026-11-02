/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 7 — pure craps engine
   The dice, the point, the points the shooter has made, and every bet
   on the layout: what may be bet when, what each roll does to it and
   what it pays. No DOM, storage,
   network, or third-party dependencies.
   Exposed as window.CrapsEngine and CommonJS for tests.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory(root && root.crypto);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrapsEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (cryptoSource) {
  "use strict";

  var UINT32_RANGE = 0x100000000;
  var POINTS = [4, 5, 6, 8, 9, 10];
  var HARDS = [4, 6, 8, 10];

  // What a winning bet pays, as [win, for]: 7:6 pays 7 for every 6.
  var PLACE_PAYS = { 4: [9, 5], 5: [7, 5], 6: [7, 6], 8: [7, 6], 9: [7, 5], 10: [9, 5] };
  // Odds behind a line bet pay the true odds of the point against the seven.
  var TRUE_ODDS = { 4: [2, 1], 5: [3, 2], 6: [6, 5], 8: [6, 5], 9: [3, 2], 10: [2, 1] };
  // Laying odds against a point: the inverse of the true odds.
  var LAY_ODDS = { 4: [1, 2], 5: [2, 3], 6: [5, 6], 8: [5, 6], 9: [2, 3], 10: [1, 2] };
  var HARD_PAYS = { 4: [7, 1], 6: [9, 1], 8: [9, 1], 10: [7, 1] };
  // One-roll bets in the middle of the table: the totals they win on and what they pay.
  var PROPS = {
    any7: { totals: [7], pays: [4, 1] },
    anyCraps: { totals: [2, 3, 12], pays: [7, 1] },
    two: { totals: [2], pays: [30, 1] },
    three: { totals: [3], pays: [15, 1] },
    eleven: { totals: [11], pays: [15, 1] },
    twelve: { totals: [12], pays: [30, 1] }
  };
  // Hop bets: one roll on one pair of dice, 30 to 1 for a pair and 15 to 1
  // for two different faces. The 2, 3, 11 and 12 have spots of their own.
  var HOPS = [];
  for (var first = 1; first <= 6; first++) {
    for (var second = first; second <= 6; second++) {
      var key = "hop" + first + second;
      if (key !== "hop11" && key !== "hop12" && key !== "hop56" && key !== "hop66") HOPS.push(key);
    }
  }
  var HOP_PAYS = { pair: [30, 1], mixed: [15, 1] };
  // The Fire Bet pays on how many different points the shooter makes before
  // the seven: four or five when the seven comes, six the moment the last
  // one is made.
  var FIRE_PAYS = { 4: [24, 1], 5: [249, 1], 6: [999, 1] };
  // The field wins on 2, 3, 4, 9, 10, 11 and 12; the 2 pays double, the 12 triple.
  var FIELD = { 2: 2, 3: 1, 4: 1, 9: 1, 10: 1, 11: 1, 12: 3 };
  // Odds up to 3, 4 and 5 times the line bet on 4 and 10, 5 and 9, 6 and 8;
  // laying odds up to six times the line bet, so a win never pays more.
  var ODDS_TIMES = { 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3 };
  var LAY_TIMES = 6;

  // Every bet on the layout, by the key the table and its saved state use.
  var BETS = ["pass", "dontPass", "passOdds", "dontOdds", "come", "dontCome", "field"]
    .concat(POINTS.map(function (n) { return "come" + n; }))
    .concat(POINTS.map(function (n) { return "comeOdds" + n; }))
    .concat(POINTS.map(function (n) { return "dontCome" + n; }))
    .concat(POINTS.map(function (n) { return "dontComeOdds" + n; }))
    .concat(POINTS.map(function (n) { return "place" + n; }))
    .concat(HARDS.map(function (n) { return "hard" + n; }))
    .concat(Object.keys(PROPS))
    .concat(HOPS)
    .concat(["fire"]);

  // Table maximum for the flat bets; odds follow their line bet.
  var LIMITS = { line: 5000, place: 5000, field: 5000, hard: 500, prop: 500, fire: 25 };

  /* ---------------- Dice ---------------- */
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

  function rollDice(source) {
    return [randomInt(6, source) + 1, randomInt(6, source) + 1];
  }

  function isDice(dice) {
    return Array.isArray(dice) && dice.length === 2 && dice.every(function (die) { return Number.isInteger(die) && die >= 1 && die <= 6; });
  }

  function isPoint(value) {
    return POINTS.indexOf(value) !== -1;
  }

  // The different points the shooter has made, in the order made; anything
  // else is dropped.
  function normalizeMade(made) {
    if (!Array.isArray(made)) return [];
    return made.filter(function (point, index) { return isPoint(point) && made.indexOf(point) === index; });
  }

  /* ---------------- The bets ---------------- */
  // The number a bet stands on (come6 → 6), or null. A hop names dice,
  // not a number.
  function numberOf(key) {
    if (/^hop/.test(key)) return null;
    var match = /(\d+)$/.exec(key);
    return match ? Number(match[1]) : null;
  }

  // The two faces of a hop bet (hop24 → [2, 4]).
  function hopDice(key) {
    return [Number(key.charAt(3)), Number(key.charAt(4))];
  }

  // What kind of bet a key is.
  function kindOf(key) {
    if (key === "pass" || key === "dontPass") return "line";
    if (key === "passOdds" || key === "dontOdds") return "lineOdds";
    if (key === "come" || key === "dontCome") return "comeBox";
    if (/^come\d+$/.test(key) || /^dontCome\d+$/.test(key)) return "comePoint";
    if (/^comeOdds\d+$/.test(key) || /^dontComeOdds\d+$/.test(key)) return "comeOdds";
    if (/^place\d+$/.test(key)) return "place";
    if (/^hard\d+$/.test(key)) return "hard";
    if (key === "field") return "field";
    if (PROPS[key]) return "prop";
    if (HOPS.indexOf(key) !== -1) return "hop";
    if (key === "fire") return "fire";
    return null;
  }

  // Whole dollars won on `amount` at `ratio` ([win, for]), rounded down.
  function pay(amount, ratio) {
    return Math.floor(amount * ratio[0] / ratio[1]);
  }

  function wholeAmount(value) {
    value = Number(value);
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  }

  // Keeps only real bets with whole, positive amounts, in layout order.
  function normalizeBets(bets) {
    var out = {};
    if (!bets || typeof bets !== "object") return out;
    BETS.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(bets, key)) {
        var amount = wholeAmount(bets[key]);
        if (amount) out[key] = amount;
      }
    });
    return out;
  }

  function totalStake(bets) {
    return Object.keys(bets).reduce(function (sum, key) { return sum + bets[key]; }, 0);
  }

  // The largest amount a bet may hold, given the point and the bets around it.
  function maxBet(key, point, bets) {
    bets = bets || {};
    var n = numberOf(key);
    switch (key) {
      case "passOdds": return point ? (bets.pass || 0) * ODDS_TIMES[point] : 0;
      case "dontOdds": return point ? (bets.dontPass || 0) * LAY_TIMES : 0;
    }
    switch (kindOf(key)) {
      case "line": case "comeBox": case "comePoint": return LIMITS.line;
      case "comeOdds": return /^dont/.test(key) ? (bets["dontCome" + n] || 0) * LAY_TIMES : (bets["come" + n] || 0) * ODDS_TIMES[n];
      case "place": return LIMITS.place;
      case "field": return LIMITS.field;
      case "hard": return LIMITS.hard;
      case "prop": case "hop": return LIMITS.prop;
      case "fire": return LIMITS.fire;
      default: return 0;
    }
  }

  // Why a bet cannot take more chips now, or null when it can. Line bets go
  // down before a point; come bets once there is one; odds need their line
  // or come bet standing on a number. A come bet gets to a number by
  // travelling from the come box, or, once there is a point, is put there
  // straight away (a put bet); don't come bets only travel. The Fire Bet
  // goes down for a new shooter: no point on and none made yet. made lists
  // the points the shooter has made.
  function canAdd(key, point, bets, made) {
    var kind = kindOf(key);
    if (!kind) return "unknown";
    if (kind === "comePoint" && (!point || /^dont/.test(key))) return "travels";
    if (kind === "fire" && (point || normalizeMade(made).length)) return "fireNewShooter";
    if (kind === "line" && point) return "comeOutOnly";
    if (kind === "comeBox" && !point) return "pointOnly";
    if (kind === "lineOdds" || kind === "comeOdds") {
      if (maxBet(key, point, bets) === 0) return "oddsNeedBet";
    }
    if ((bets[key] || 0) >= maxBet(key, point, bets)) return "limit";
    return null;
  }

  // Whether a bet already on the layout may be taken down. A pass or come
  // bet with a point is a contract and plays until it is decided.
  function canRemove(key, point, made) {
    if (key === "pass") return !point;
    if (/^come\d+$/.test(key)) return false;
    if (key === "fire") return !point && !normalizeMade(made).length;
    return !!kindOf(key);
  }

  /* ---------------- A roll ---------------- */
  // Everything one roll does. state is { point, bets } with the bets that are
  // on the layout for this roll. Each line says what happened to one bet:
  //   win  – it won `profit`; `returned` goes back to the balance (the stake
  //          too when the bet comes down) and `stays` tells whether the stake
  //          stays on the layout;
  //   lose – the stake is gone;
  //   push – the stake comes back;
  //   move – a come bet travels to the number rolled (`to`);
  //   off  – the bet does not work on this roll and stays;
  //   bar  – a don't pass bet ties on a come-out twelve and stays.
  // Bets with nothing to do are left out.
  function resolve(state, dice) {
    var point = state.point || null;
    var bets = normalizeBets(state.bets);
    var made = normalizeMade(state.made);
    var total = dice[0] + dice[1];
    var hard = dice[0] === dice[1];
    var comeOut = !point;
    var pointMade = !comeOut && total === point;
    var sevenOut = !comeOut && total === 7;
    // The points made by this shooter after the roll.
    var nextMade = sevenOut ? [] : pointMade && made.indexOf(point) === -1 ? made.concat([point]) : made;
    var low = Math.min(dice[0], dice[1]), high = Math.max(dice[0], dice[1]);
    var lines = [];
    var next = {};

    function keep(key, amount) { next[key] = (next[key] || 0) + amount; }
    function win(key, amount, profit, stays) {
      lines.push({ key: key, amount: amount, result: "win", profit: profit, returned: profit + (stays ? 0 : amount), stays: stays });
      if (stays) keep(key, amount);
    }
    function lose(key, amount) { lines.push({ key: key, amount: amount, result: "lose", profit: 0, returned: 0, stays: false }); }
    function push(key, amount) { lines.push({ key: key, amount: amount, result: "push", profit: 0, returned: amount, stays: false }); }
    function off(key, amount) { lines.push({ key: key, amount: amount, result: "off", profit: 0, returned: 0, stays: true }); keep(key, amount); }
    function bar(key, amount) { lines.push({ key: key, amount: amount, result: "bar", profit: 0, returned: 0, stays: true }); keep(key, amount); }
    function move(key, amount, to) { lines.push({ key: key, amount: amount, result: "move", profit: 0, returned: 0, stays: true, to: to }); keep(to, amount); }

    Object.keys(bets).forEach(function (key) {
      var a = bets[key];
      var n = numberOf(key);
      switch (kindOf(key)) {
        case "line":
          if (key === "pass") {
            if (comeOut) {
              if (total === 7 || total === 11) win(key, a, a, true);
              else if (total === 2 || total === 3 || total === 12) lose(key, a);
              else keep(key, a);
            } else if (total === point) win(key, a, a, true);
            else if (total === 7) lose(key, a);
            else keep(key, a);
          } else {
            if (comeOut) {
              if (total === 2 || total === 3) win(key, a, a, true);
              else if (total === 12) bar(key, a);
              else if (total === 7 || total === 11) lose(key, a);
              else keep(key, a);
            } else if (total === 7) win(key, a, a, true);
            else if (total === point) lose(key, a);
            else keep(key, a);
          }
          break;
        case "lineOdds":
          // Odds never stand without a point; any found are given back.
          if (!point) push(key, a);
          else if (key === "passOdds") {
            if (total === point) win(key, a, pay(a, TRUE_ODDS[point]), false);
            else if (total === 7) lose(key, a);
            else keep(key, a);
          } else {
            if (total === 7) win(key, a, pay(a, LAY_ODDS[point]), false);
            else if (total === point) lose(key, a);
            else keep(key, a);
          }
          break;
        case "comeBox":
          if (key === "come") {
            if (total === 7 || total === 11) win(key, a, a, false);
            else if (total === 2 || total === 3 || total === 12) lose(key, a);
            else move(key, a, "come" + total);
          } else {
            if (total === 2 || total === 3) win(key, a, a, false);
            else if (total === 12) push(key, a);
            else if (total === 7 || total === 11) lose(key, a);
            else move(key, a, "dontCome" + total);
          }
          break;
        case "comePoint":
          if (/^come/.test(key)) {
            if (total === n) win(key, a, a, false);
            else if (total === 7) lose(key, a);
            else keep(key, a);
          } else {
            if (total === 7) win(key, a, a, false);
            else if (total === n) lose(key, a);
            else keep(key, a);
          }
          break;
        case "comeOdds":
          if (/^dont/.test(key)) {
            if (total === 7) win(key, a, pay(a, LAY_ODDS[n]), false);
            else if (total === n) lose(key, a);
            else keep(key, a);
          } else if (total === n) {
            // Odds behind a come bet are off on the come-out roll.
            if (comeOut) push(key, a);
            else win(key, a, pay(a, TRUE_ODDS[n]), false);
          } else if (total === 7) {
            if (comeOut) push(key, a);
            else lose(key, a);
          } else keep(key, a);
          break;
        case "place":
          if (comeOut) off(key, a);
          else if (total === n) win(key, a, pay(a, PLACE_PAYS[n]), true);
          else if (total === 7) lose(key, a);
          else keep(key, a);
          break;
        case "hard":
          if (comeOut) off(key, a);
          else if (total === n && hard) win(key, a, pay(a, HARD_PAYS[n]), true);
          else if (total === n || total === 7) lose(key, a);
          else keep(key, a);
          break;
        case "field":
          if (FIELD[total]) win(key, a, a * FIELD[total], true);
          else lose(key, a);
          break;
        case "prop":
          if (PROPS[key].totals.indexOf(total) !== -1) win(key, a, pay(a, PROPS[key].pays), true);
          else lose(key, a);
          break;
        case "hop":
          var faces = hopDice(key);
          if (faces[0] === low && faces[1] === high) win(key, a, pay(a, faces[0] === faces[1] ? HOP_PAYS.pair : HOP_PAYS.mixed), true);
          else lose(key, a);
          break;
        case "fire":
          if (pointMade && nextMade.length === 6 && made.length === 5) win(key, a, pay(a, FIRE_PAYS[6]), false);
          else if (sevenOut) {
            if (FIRE_PAYS[made.length]) win(key, a, pay(a, FIRE_PAYS[made.length]), false);
            else lose(key, a);
          } else keep(key, a);
          break;
      }
    });

    var nextPoint = point;
    if (comeOut && isPoint(total)) nextPoint = total;
    else if (!comeOut && (total === point || total === 7)) nextPoint = null;
    // Line odds come down with their line bet; they never outlive the point.
    if (!nextPoint) {
      ["passOdds", "dontOdds"].forEach(function (key) {
        if (next[key]) {
          push(key, next[key]);
          delete next[key];
        }
      });
    }

    var returned = lines.reduce(function (sum, line) { return sum + line.returned; }, 0);
    var profit = lines.reduce(function (sum, line) { return sum + line.profit; }, 0);
    var lost = lines.reduce(function (sum, line) { return sum + (line.result === "lose" ? line.amount : 0); }, 0);
    return {
      dice: dice,
      total: total,
      hard: hard,
      comeOut: comeOut,
      point: nextPoint,
      made: nextMade,
      pointMade: pointMade,
      sevenOut: sevenOut,
      bets: normalizeBets(next),
      lines: lines,
      returned: returned,
      profit: profit,
      lost: lost
    };
  }

  return {
    POINTS: POINTS,
    HARDS: HARDS,
    BETS: BETS,
    LIMITS: LIMITS,
    PLACE_PAYS: PLACE_PAYS,
    TRUE_ODDS: TRUE_ODDS,
    LAY_ODDS: LAY_ODDS,
    HARD_PAYS: HARD_PAYS,
    PROPS: PROPS,
    HOPS: HOPS,
    HOP_PAYS: HOP_PAYS,
    FIRE_PAYS: FIRE_PAYS,
    FIELD: FIELD,
    ODDS_TIMES: ODDS_TIMES,
    LAY_TIMES: LAY_TIMES,
    randomInt: randomInt,
    rollDice: rollDice,
    isDice: isDice,
    isPoint: isPoint,
    normalizeMade: normalizeMade,
    numberOf: numberOf,
    hopDice: hopDice,
    kindOf: kindOf,
    pay: pay,
    wholeAmount: wholeAmount,
    normalizeBets: normalizeBets,
    totalStake: totalStake,
    maxBet: maxBet,
    canAdd: canAdd,
    canRemove: canRemove,
    resolve: resolve
  };
});
