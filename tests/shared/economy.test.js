/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// The economy of the whole pit, table by table: every settlement is whole
// dollars and accounts for every dollar staked, long runs of play return
// what the exact odds say, whole-dollar rounding costs exactly what the
// rules texts say, and the returns the lobby prints are the engines'.
var test = require("node:test");
var assert = require("node:assert/strict");
var loadI18n = require("../helpers/i18n.js").loadI18n;
var enumerateShoe = require("../helpers/baccarat.js").enumerateShoe;

var Blackjack = require("../../games/blackjack/js/engine.js");
var Roulette = require("../../games/roulette/js/engine.js");
var Baccarat = require("../../games/baccarat/js/engine.js");
var ThreeCard = require("../../games/threecard/js/engine.js");
var Craps = require("../../games/craps/js/engine.js");
var Holdem = require("../../games/holdem/js/engine.js");
var Slot = require("../../games/slot/js/engine.js");
var VideoPoker = require("../../games/videopoker/js/engine.js");
var SicBo = require("../../games/sicbo/js/engine.js");
var Keno = require("../../games/keno/js/engine.js");
var BigSix = require("../../games/bigsix/js/engine.js");

// A small seeded generator (mulberry32), so every run plays the same rounds.
function seeded(seed) {
  var state = seed >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    var t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(random, list) { return list[Math.floor(random() * list.length)]; }

// A stake built from the chips a table offers, one to four of them.
function chipStake(random, chips) {
  var stake = 0;
  var count = 1 + Math.floor(random() * 4);
  for (var i = 0; i < count; i++) stake += pick(random, chips);
  return stake;
}

function whole(value) { return Number.isSafeInteger(value) && value >= 0; }

// What every settlement must satisfy: whole dollars, a stake that is the
// sum of the bets, nothing returned below zero or above the best pay, and
// a net that is exactly what came back less what went down.
function checkSettlement(name, result, stake, maxTimes) {
  assert.ok(whole(result.stake) && result.stake > 0, name + ": stake " + result.stake);
  assert.equal(result.stake, stake, name + ": the stake is the sum of the bets");
  assert.ok(whole(result.returned), name + ": returned " + result.returned);
  assert.ok(result.returned <= result.stake * maxTimes, name + ": " + result.returned + " back on " + result.stake);
  // Table 9 settles against its commission box: what reaches the balance is
  // what the bets return less the whole dollars of commission collected.
  var paid = result.paid !== undefined ? result.paid : result.returned;
  if (result.paid !== undefined) {
    assert.equal(result.paid, result.returned - result.collected, name + ": paid");
    assert.ok(whole(result.paid), name + ": paid " + result.paid);
  }
  if (result.net !== undefined) assert.equal(result.net, paid - result.stake, name + ": net");
  if (result.lines) {
    result.lines.forEach(function (line) {
      assert.ok(whole(line.amount) && whole(line.returned), name + ": a line in whole dollars");
    });
    var sum = result.lines.reduce(function (total, line) { return total + line.returned; }, 0);
    assert.equal(sum, result.returned, name + ": the lines add up to what comes back");
  }
}

var ROUNDS = 1500;

/* ---------------- Every settlement, at every table ---------------- */
test("every table settles in whole dollars and accounts for every dollar staked", function () {
  var random = seeded(2026);
  var played = {};
  function count(name) { played[name] = (played[name] || 0) + 1; }

  // Table 21: one to four hands, doubles, surrenders and insurance, with any
  // whole stake an All-in could make.
  var shoe = Blackjack.shuffle(Blackjack.buildShoe(6), function (n) { return Math.floor(random() * n); });
  for (var round = 0; round < ROUNDS; round++) {
    if (shoe.length < 40) shoe = Blackjack.shuffle(Blackjack.buildShoe(6), function (n) { return Math.floor(random() * n); });
    var hands = [];
    var handCount = 1 + Math.floor(random() * 4);
    var stake = 0;
    for (var h = 0; h < handCount; h++) {
      var bet = random() < 0.2 ? 1 + Math.floor(random() * 9999) : chipStake(random, [100, 500, 1000, 5000]);
      if (random() < 0.15) bet *= 2;
      var cards = [shoe.pop(), shoe.pop()];
      while (Blackjack.handValue(cards).total < 15 && random() < 0.7) cards.push(shoe.pop());
      var hand = { cards: cards, bet: bet, fromSplit: handCount > 1 };
      if (handCount === 1 && cards.length === 2 && random() < 0.05) hand.result = "surrender";
      hands.push(hand);
      stake += bet;
    }
    var dealer = [shoe.pop(), shoe.pop()];
    while (Blackjack.handValue(dealer).total < 17) dealer.push(shoe.pop());
    var insurance = random() < 0.1 ? Math.floor(hands[0].bet / 2) : 0;
    var settled = Blackjack.settleRound(hands, dealer, { insuranceStake: insurance });
    checkSettlement("Table 21", { stake: settled.totalStake, returned: settled.totalReturn, net: settled.profit }, stake + insurance, 3);
    assert.ok(settled.mainReturn <= Math.floor(settled.mainStake * 2.5));
    count("blackjack");
  }

  // Table 37: up to six bets anywhere on the layout, under both rules.
  var keys = Object.keys(Roulette.BETS);
  for (round = 0; round < ROUNDS; round++) {
    var bets = {};
    for (var b = 0; b < 1 + Math.floor(random() * 6); b++) bets[pick(random, keys)] = chipStake(random, [5, 25, 100, 500]);
    var spun = Roulette.settle(bets, Math.floor(random() * 37), { laPartage: random() < 0.5 });
    checkSettlement("Table 37", spun, Roulette.totalStake(Roulette.normalizeBets(bets)), 36);
    count("roulette");
  }

  // Table 9: real coups from a shuffled shoe, under both rules, with the
  // commission box carried from coup to coup and never above a dollar.
  var baccaratShoe = Baccarat.newShoe(random).cards;
  var box = 0;
  for (round = 0; round < ROUNDS; round++) {
    if (Baccarat.needsNewShoe(baccaratShoe)) baccaratShoe = Baccarat.newShoe(random).cards;
    var coup = Baccarat.playCoup(function () { return baccaratShoe.shift(); });
    bets = {};
    Baccarat.BETS.forEach(function (key) { if (random() < 0.5) bets[key] = chipStake(random, [5, 25, 100]); });
    if (!Object.keys(bets).length) bets.banker = 5;
    var rules = pick(random, Baccarat.RULES);
    var coupSettled = Baccarat.settle(bets, coup, rules, box);
    checkSettlement("Table 9", coupSettled, Baccarat.totalStake(bets), 12);
    assert.equal(coupSettled.box + coupSettled.collected * 100, box + coupSettled.commission, "Table 9: no cent leaves the box unaccounted");
    box = coupSettled.box;
    assert.ok(box > -100 && box < 100);
    count("baccarat");
  }

  // Table 3: the Ante, the Pair Plus or both, played or folded, both pay tables.
  for (round = 0; round < ROUNDS; round++) {
    var deck = ThreeCard.newDeck(random);
    var dealt = ThreeCard.deal(function () { return deck.pop(); });
    bets = {};
    if (random() < 0.85) bets.ante = chipStake(random, [10, 25, 100]);
    if (random() < 0.5 || !bets.ante) bets.pairPlus = chipStake(random, [10, 25]);
    var decision = bets.ante && random() < 0.7 ? "play" : "fold";
    var threeCard = ThreeCard.settle(bets, dealt.player, dealt.dealer, decision, pick(random, ThreeCard.PAY_TABLES));
    var threeStake = (bets.ante || 0) * (decision === "play" ? 2 : 1) + (bets.pairPlus || 0);
    checkSettlement("Table 3", threeCard, threeStake, 41);
    count("threecard");
  }

  // Table 2: the Ante with or without the AA Bonus, called or folded.
  for (round = 0; round < ROUNDS; round++) {
    var holdemDeck = Holdem.newDeck(random);
    var holdemHands = Holdem.deal(function () { return holdemDeck.pop(); });
    bets = { ante: chipStake(random, [5, 25, 100]) };
    if (random() < 0.5) bets.aaBonus = chipStake(random, [5, 25]);
    var call = random() < 0.75 ? "call" : "fold";
    var holdem = Holdem.settle(bets, holdemHands, call);
    var holdemStake = bets.ante * (call === "call" ? 1 + Holdem.CALL_TIMES : 1) + (bets.aaBonus || 0);
    checkSettlement("Table 2", holdem, holdemStake, 101);
    count("holdem");
  }

  // Table 7: one roll of whatever stands on the layout, with odds behind
  // line bets of every size; no roll creates or loses a dollar unaccounted.
  for (round = 0; round < ROUNDS; round++) {
    var point = random() < 0.5 ? null : pick(random, Craps.POINTS);
    bets = {};
    Craps.BETS.forEach(function (key) {
      if (random() < 0.12 && !Craps.canAdd(key, point, bets)) bets[key] = Math.min(chipStake(random, [5, 25, 100]), Craps.maxBet(key, point, bets));
    });
    if (point && random() < 0.5) { bets.pass = 10 + Math.floor(random() * 50); bets.passOdds = Math.floor(random() * bets.pass * Craps.ODDS_TIMES[point]) || 1; }
    if (!Object.keys(bets).length) bets.field = 5;
    var before = Craps.totalStake(Craps.normalizeBets(bets));
    var rolled = Craps.resolve({ point: point, bets: bets }, Craps.rollDice(random));
    var standing = Craps.totalStake(rolled.bets);
    // Every dollar is still on the layout, back in the balance or lost; winnings come on top.
    var paidBack = rolled.lines.reduce(function (sum, line) { return sum + (line.result === "win" ? line.returned - line.profit : line.returned); }, 0);
    assert.equal(standing + paidBack + rolled.lost, before, "Table 7: every staked dollar is accounted for");
    assert.ok(rolled.lines.every(function (line) { return whole(line.amount) && whole(line.profit) && whole(line.returned); }));
    assert.ok(rolled.profit <= before * 30);
    count("craps");
  }

  // Slot 5: paid spins with their free spins, every line bet.
  for (round = 0; round < 400; round++) {
    var lineBet = pick(random, Slot.LINE_BETS);
    var slotSpin = Slot.play(random);
    var slotResult = Slot.settle(slotSpin, lineBet);
    checkSettlement("Slot 5", slotResult, Slot.totalBet(lineBet), 50000);
    count("slot");
  }

  // Poker 11: any hold of any deal, every coin count and coin value, both tables.
  for (round = 0; round < ROUNDS; round++) {
    var vpDeal = VideoPoker.deal(VideoPoker.newDeck(random));
    var held = [0, 1, 2, 3, 4].map(function () { return random() < 0.5; });
    var vpBet = { denomination: pick(random, VideoPoker.DENOMINATIONS), coins: 1 + Math.floor(random() * VideoPoker.MAX_COINS) };
    var vp = VideoPoker.settle(vpBet, VideoPoker.draw(vpDeal.hand, held, vpDeal.draws), pick(random, VideoPoker.PAY_TABLES));
    checkSettlement("Poker 11", vp, VideoPoker.stakeOf(vpBet), VideoPoker.ROYAL_MAX_COINS);
    count("videopoker");
  }

  // Table 18, Keno 80 and Wheel 54.
  for (round = 0; round < ROUNDS; round++) {
    bets = {};
    for (var s = 0; s < 1 + Math.floor(random() * 6); s++) {
      var key = pick(random, SicBo.BETS);
      bets[key] = Math.min((bets[key] || 0) + chipStake(random, [5, 25, 100]), SicBo.maxBet(key));
    }
    checkSettlement("Table 18", SicBo.resolve(bets, SicBo.rollDice(random)), SicBo.totalStake(bets), 181);

    var picks = Keno.quickPick(1 + Math.floor(random() * 10), random);
    var kenoBet = pick(random, Keno.BETS);
    checkSettlement("Keno 80", Keno.settle(picks, Keno.draw(random), kenoBet), kenoBet, 10000);

    bets = {};
    BigSix.BETS.forEach(function (key) { if (random() < 0.4) bets[key] = Math.min(chipStake(random, [5, 25, 100]), BigSix.maxBet(key)); });
    if (!Object.keys(bets).length) bets.one = 5;
    checkSettlement("Wheel 54", BigSix.resolve(bets, BigSix.spin(random)), BigSix.totalStake(bets), 41);
    count("sicbo"); count("keno"); count("bigsix");
  }

  assert.deepEqual(Object.keys(played).sort(), ["baccarat", "bigsix", "blackjack", "craps", "holdem", "keno", "roulette", "sicbo", "slot", "threecard", "videopoker"]);
});

/* ---------------- Long runs return what the odds say ---------------- */
// Plays `rounds` rounds of one bet and checks the money returned per dollar
// against the exact return, within five standard errors.
function converges(name, exact, rounds, playOne) {
  var total = 0, squares = 0;
  for (var i = 0; i < rounds; i++) {
    var ratio = playOne();
    total += ratio;
    squares += ratio * ratio;
  }
  var mean = total / rounds;
  var spread = Math.sqrt(Math.max(0, squares / rounds - mean * mean) / rounds);
  assert.ok(Math.abs(mean - exact) <= 5 * spread + 1e-9, name + ": " + mean.toFixed(5) + " against " + exact.toFixed(5) + " ± " + (5 * spread).toFixed(5));
}

test("long seeded runs of every one-round game return what the exact odds say", function () {
  var random = seeded(54);
  converges("Table 37 red", 36 / 37, 200000, function () {
    return Roulette.settle({ red: 10 }, Math.floor(random() * 37)).returned / 10;
  });
  converges("Table 37 straight up", 36 / 37, 200000, function () {
    return Roulette.settle({ "straight:17": 10 }, Math.floor(random() * 37)).returned / 10;
  });
  converges("Table 18 Small", 1 - SicBo.houseEdge("small"), 200000, function () {
    return SicBo.resolve({ small: 10 }, SicBo.rollDice(random)).returned / 10;
  });
  converges("Table 18 single number", 1 - SicBo.houseEdge("single3"), 200000, function () {
    return SicBo.resolve({ single3: 10 }, SicBo.rollDice(random)).returned / 10;
  });
  converges("Wheel 54 $1", 1 - BigSix.houseEdge("one"), 200000, function () {
    return BigSix.resolve({ one: 10 }, BigSix.spin(random)).returned / 10;
  });
  converges("Wheel 54 $5", 1 - BigSix.houseEdge("five"), 200000, function () {
    return BigSix.resolve({ five: 10 }, BigSix.spin(random)).returned / 10;
  });
  var picks = [7, 18, 29, 40];
  converges("Keno 80 four marks", Keno.returnFor(4), 60000, function () {
    return Keno.settle(picks, Keno.draw(random), 1).returned;
  });
  converges("Table 7 Field", 1 - 1 / 36, 200000, function () {
    var rolled = Craps.resolve({ point: null, bets: { field: 36 } }, Craps.rollDice(random));
    return rolled.lines[0].result === "win" ? (36 + rolled.lines[0].profit) / 36 : 0;
  });
});

/* ---------------- Whole-dollar rounding ---------------- */
test("whole-dollar rounding: which stakes are paid in full, and what the others cost", function () {
  var odds = enumerateShoe();
  var bankerCoup = { winner: "banker", bankerTotal: 7 };
  var bankerSix = { winner: "banker", bankerTotal: 6 };
  for (var amount = 1; amount <= 200; amount++) {
    // Table 9: with the commission box every stake is paid exactly. Twenty
    // Banker wins put exactly the stake in commission through the box, and
    // two wins on six without commission pay exactly three stakes.
    var box = 0, paid = 0;
    for (var win = 0; win < 20; win++) {
      var settled = Baccarat.settle({ banker: amount }, bankerCoup, "classic", box);
      paid += settled.paid;
      box = settled.box;
    }
    assert.equal(paid, amount * 20 * 1.95, "banker " + amount);
    assert.equal(box, 0);
    paid = 0;
    for (win = 0; win < 2; win++) {
      settled = Baccarat.settle({ banker: amount }, bankerSix, "noCommission", box);
      paid += settled.paid;
      box = settled.box;
    }
    assert.equal(paid, amount * 2 * 1.5, "banker six " + amount);
    assert.equal(box, 0);
    // Table 37: La Partage returns half in full on even amounts.
    assert.equal(Roulette.settle({ red: amount }, 0, { laPartage: true }).returned === amount / 2, amount % 2 === 0, "partage " + amount);
    // Table 21: a blackjack's 3 to 2 and a surrender's half in full on even amounts.
    assert.equal(Blackjack.payoutFor("blackjack", amount) === amount * 2.5, amount % 2 === 0, "blackjack " + amount);
    assert.equal(Blackjack.payoutFor("surrender", amount) === amount / 2, amount % 2 === 0, "surrender " + amount);
    // Table 7: place and odds bets in full on the multiples the rules name.
    [[6, [7, 6]], [5, [7, 5]], [4, [9, 5]]].forEach(function (place) {
      var unit = place[1][1];
      assert.equal(Craps.pay(amount, place[1]) === amount * place[1][0] / unit, amount % unit === 0, "place " + place[0] + " " + amount);
    });
  }
  // Every other table pays whole multiples of the stake, so nothing rounds.
  Object.keys(ThreeCard.PAIR_PLUS).forEach(function (table) {
    Object.keys(ThreeCard.PAIR_PLUS[table]).forEach(function (hand) { assert.ok(Number.isInteger(ThreeCard.PAIR_PLUS[table][hand])); });
  });
  Object.keys(Holdem.ANTE_PAYS).concat(Object.keys(Holdem.AA_PAYS)).forEach(function (hand) {
    assert.ok(Number.isInteger(Holdem.ANTE_PAYS[hand] || 1) && Number.isInteger(Holdem.AA_PAYS[hand] || 1));
  });

  // So the Banker's house edge is the published 1.06% at every stake: a win
  // earns the stake less exactly 5%, through the box, whatever its size.
  function bankerEdge(stake) {
    var win = Baccarat.returnFor("banker", stake, bankerCoup, "classic") - stake - Baccarat.boxCents("banker", stake, bankerCoup, "classic") / 100;
    return -(odds.banker * win - odds.player * stake) / stake;
  }
  [5, 10, 15, 20, 25, 40, 50, 100].forEach(function (stake) { assert.equal((bankerEdge(stake) * 100).toFixed(2), "1.06", "$" + stake); });
});

test("the rules texts tell the player how every fraction of a dollar is settled", function () {
  var baccarat = loadI18n("games/baccarat/js/strings.js").I18n._dict;
  assert.match(baccarat.en.rulesHint, /commission box, to the cent/);
  assert.match(baccarat.tr.rulesHint, /komisyon kutusuna/);
  var craps = loadI18n("games/craps/js/strings.js").I18n._dict;
  assert.match(craps.en.rulesWhole, /Place 6 and 8 in sixes and Place 5 and 9 in fives/);
  var roulette = loadI18n("games/roulette/js/strings.js").I18n._dict;
  assert.match(roulette.en.profileHint, /half of an odd stake rounds down/);
  var blackjack = loadI18n("games/blackjack/js/strings.js").I18n._dict;
  assert.match(blackjack.en.roundingHint, /Fractional payouts are rounded down/);
});

/* ---------------- What the lobby promises ---------------- */
test("the returns the lobby prints are the engines' exact returns", function () {
  var lobby = loadI18n("lobby/js/strings.js").I18n._dict;
  function percent(fraction, lang) {
    var text = (fraction * 100).toFixed(2);
    return lang === "tr" ? "%" + text.replace(".", ",") : text + "%";
  }
  var slot = Slot.returnToPlayer().total;
  var poker = VideoPoker.RETURN_PERCENT[VideoPoker.PAY_TABLES[0]] / 100;
  var keno = Math.max.apply(null, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(Keno.returnFor));
  ["en", "tr"].forEach(function (lang) {
    assert.ok(lobby[lang].slotSummary.indexOf(percent(slot, lang)) !== -1, lang + " slot");
    assert.ok(lobby[lang].videopokerSummary.indexOf(percent(poker, lang)) !== -1, lang + " video poker");
    assert.ok(lobby[lang].kenoSummary.indexOf(percent(keno, lang)) !== -1, lang + " keno");
  });
  // Every game the house plays keeps an edge; only the craps odds are fair.
  assert.ok(slot < 1 && poker < 1 && keno < 1);
  BigSix.BETS.forEach(function (key) { assert.ok(BigSix.houseEdge(key) > 0, key); });
  SicBo.BETS.forEach(function (key) { assert.ok(SicBo.houseEdge(key) > 0, key); });
});
