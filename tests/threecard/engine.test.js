/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../../games/threecard/js/engine.js");

// "AS KS QS" → three cards.
function hand(text) {
  return text.split(" ").map(function (code) {
    var c = Engine.fromCode(code);
    assert.ok(c, code);
    return c;
  });
}

function rank(text) {
  return Engine.evaluate(hand(text));
}

// Every three-card hand of one deck, with its ranking.
var DECK = Engine.buildDeck();
var ALL = [];
for (var a = 0; a < 52; a++) {
  for (var b = a + 1; b < 52; b++) {
    for (var c = b + 1; c < 52; c++) ALL.push({ cards: [a, b, c], hand: Engine.evaluate([DECK[a], DECK[b], DECK[c]]) });
  }
}

test("one deck of 52 different cards, shuffled without bias", function () {
  var deck = Engine.newDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map(Engine.code)).size, 52);
  var counts = [0, 0, 0];
  for (var i = 0; i < 30000; i++) counts[Engine.randomInt(3)]++;
  counts.forEach(function (count) { assert.ok(count > 9400 && count < 10600, String(count)); });
  assert.throws(function () { Engine.randomInt(0); }, RangeError);
  assert.deepEqual(Engine.newDeck(function () { return 0; }).slice(0, 3).map(Engine.code), ["3S", "4S", "5S"]);
});

test("cards are dealt one at a time, the player first", function () {
  var cards = hand("AS KS QS JS 10S 9S");
  var dealt = Engine.deal(function () { return cards.shift(); });
  assert.deepEqual(dealt.player.map(Engine.code), ["AS", "QS", "10S"]);
  assert.deepEqual(dealt.dealer.map(Engine.code), ["KS", "JS", "9S"]);
  assert.ok(Engine.isLegalDeal(dealt.player, dealt.dealer));
  assert.equal(Engine.isLegalDeal(hand("AS KS QS"), hand("AS 2D 3C")), false, "one deck has one ace of spades");
  assert.equal(Engine.isLegalDeal(hand("AS KS"), hand("2D 3C 4H")), false);
});

test("the six kinds of hand in three-card order: a straight beats a flush", function () {
  var order = ["KS 9D 4C", "4H 4D KC", "2H 7H JH", "4S 5D 6C", "3S 3H 3D", "9C 10C JC"];
  var hands = order.map(rank);
  assert.deepEqual(hands.map(function (h) { return h.category; }), Engine.CATEGORIES);
  for (var i = 1; i < hands.length; i++) assert.equal(Engine.compare(hands[i], hands[i - 1]), 1, order[i]);
});

test("A-2-3 is the lowest straight and Q-K-A the highest; K-A-2 is no straight", function () {
  assert.equal(rank("AS 2D 3C").category, "straight");
  assert.deepEqual(rank("AS 2D 3C").ranks, [3]);
  assert.equal(Engine.compare(rank("2S 3D 4C"), rank("AS 2D 3C")), 1);
  assert.equal(Engine.compare(rank("QS KD AC"), rank("JS QD KC")), 1);
  assert.equal(rank("KS AD 2C").category, "high");
  assert.equal(rank("AH 2H 3H").category, "straightFlush");
});

test("ties are broken by the deciding cards in order, never by suit", function () {
  assert.equal(Engine.compare(rank("KS KD 9C"), rank("KH KC 8D")), 1, "the kicker decides between equal pairs");
  assert.equal(Engine.compare(rank("QS QD 2C"), rank("JH JC AD")), 1, "the pair before the kicker");
  assert.equal(Engine.compare(rank("AS 9D 3C"), rank("AH 9C 2D")), 1, "the third card decides");
  assert.equal(Engine.compare(rank("AS 9D 3C"), rank("AH 9C 3D")), 0);
  assert.equal(Engine.compare(rank("2H 7H JH"), rank("2S 7S JS")), 0);
  assert.equal(Engine.compare(rank("3H 8H JH"), rank("2S 7S JS")), 1, "a flush compares like a high hand");
  assert.equal(Engine.compare(rank("3H 6H JH"), rank("2S 7S JS")), -1, "the second card before the third");
});

test("the dealer qualifies with Queen high or better, the strategy plays Queen-6-4 or better", function () {
  assert.equal(Engine.qualifies(rank("QS 3D 2C")), true);
  assert.equal(Engine.qualifies(rank("JS 10D 8C")), false);
  assert.equal(Engine.qualifies(rank("2S 2D 3C")), true);
  assert.equal(Engine.shouldPlay(rank("QS 6D 4C")), true);
  assert.equal(Engine.shouldPlay(rank("QS 6D 3C")), false);
  assert.equal(Engine.shouldPlay(rank("QS 5D 4C")), false);
  assert.equal(Engine.shouldPlay(rank("QS 7D 2C")), true);
  assert.equal(Engine.shouldPlay(rank("KS 3D 2C")), true);
});

test("a score names its hand again, and only real scores do", function () {
  ALL.forEach(function (entry) {
    var back = Engine.fromScore(entry.hand.score);
    assert.equal(back.category, entry.hand.category);
    assert.deepEqual(back.ranks, entry.hand.ranks);
  });
  [-1, 1.5, "x", 0, 3375 * 6].forEach(function (score) { assert.equal(Engine.fromScore(score), null, String(score)); });
});

test("every hand of one deck: 48 straight flushes, 52 trips, 720 straights, 1,096 flushes, 3,744 pairs", function () {
  var counts = {};
  ALL.forEach(function (entry) { counts[entry.hand.category] = (counts[entry.hand.category] || 0) + 1; });
  assert.equal(ALL.length, 22100);
  assert.deepEqual(counts, { straightFlush: 48, trips: 52, straight: 720, flush: 1096, pair: 3744, high: 16440 });
});

test("settlement: the dealer does not qualify, wins, loses or ties", function () {
  var bets = { ante: 100, pairPlus: 20 };
  var noQualify = Engine.settle(bets, hand("KS 9D 4C"), hand("JS 8D 3C"), "play");
  assert.equal(noQualify.outcome, "noQualify");
  assert.deepEqual(noQualify.lines.map(function (l) { return [l.key, l.amount, l.returned]; }), [["pairPlus", 20, 0], ["ante", 100, 200], ["play", 100, 100]]);
  assert.equal(noQualify.net, 80);

  var win = Engine.settle(bets, hand("KS KD 4C"), hand("QS 8D 3C"), "play");
  assert.equal(win.outcome, "win");
  assert.deepEqual(win.lines.map(function (l) { return [l.key, l.returned]; }), [["pairPlus", 40], ["ante", 200], ["play", 200]]);

  var lose = Engine.settle({ ante: 100 }, hand("QS 8D 3C"), hand("KS KD 4C"), "play");
  assert.equal(lose.outcome, "lose");
  assert.equal(lose.returned, 0);
  assert.equal(lose.net, -200);

  var tie = Engine.settle({ ante: 100 }, hand("AS 9D 3C"), hand("AH 9C 3D"), "play");
  assert.equal(tie.outcome, "tie");
  assert.equal(tie.returned, 200);
  assert.equal(tie.net, 0);
});

test("the Ante Bonus and the Pair Plus pay on the player's hand, whatever the dealer holds", function () {
  // A straight that loses to a higher straight still collects both.
  var settled = Engine.settle({ ante: 100, pairPlus: 10 }, hand("4S 5D 6C"), hand("9S 10D JC"), "play");
  assert.equal(settled.outcome, "lose");
  assert.deepEqual(settled.lines.map(function (l) { return [l.key, l.amount, l.returned, l.result]; }), [
    ["pairPlus", 10, 70, "win"], ["ante", 100, 0, "lose"], ["play", 100, 0, "lose"], ["anteBonus", 0, 100, "win"]
  ]);
  var royal = Engine.settle({ ante: 10, pairPlus: 10 }, hand("QH KH AH"), hand("2S 5D 9C"), "play");
  assert.equal(royal.lines.filter(function (l) { return l.key === "anteBonus"; })[0].returned, 50);
  assert.equal(royal.lines.filter(function (l) { return l.key === "pairPlus"; })[0].returned, 410);
  var trips = Engine.settle({ ante: 10 }, hand("7S 7D 7C"), hand("QS 5D 9C"), "play");
  assert.equal(trips.lines.filter(function (l) { return l.key === "anteBonus"; })[0].returned, 40);
});

test("folding gives up the Ante and the Pair Plus, and pays no bonus", function () {
  var folded = Engine.settle({ ante: 50, pairPlus: 10 }, hand("2S 2D 7C"), hand("JS 8D 3C"), "fold");
  assert.equal(folded.outcome, "fold");
  assert.equal(folded.played, false);
  assert.equal(folded.stake, 60);
  assert.equal(folded.returned, 0);
  assert.deepEqual(folded.lines.map(function (l) { return l.key; }), ["pairPlus", "ante"]);
});

test("bets keep only whole, positive amounts for the bets placed before the deal", function () {
  assert.deepEqual(Engine.normalizeBets({ ante: 25, pairPlus: "10", play: 25, other: 5 }), { pairPlus: 10, ante: 25 });
  assert.deepEqual(Engine.normalizeBets({ ante: 2.5, pairPlus: -5 }), {});
  assert.deepEqual(Engine.normalizeBets(null), {});
  assert.equal(Engine.totalStake({ ante: 25, pairPlus: 10 }), 35);
});

test("the two Pair Plus pay tables differ only in the flush", function () {
  assert.deepEqual(Engine.PAY_TABLES, ["standard", "lowFlush"]);
  assert.deepEqual(Engine.PAIR_PLUS.standard, { straightFlush: 40, trips: 30, straight: 6, flush: 4, pair: 1 });
  assert.deepEqual(Engine.PAIR_PLUS.lowFlush, Object.assign({}, Engine.PAIR_PLUS.standard, { flush: 3 }));
  assert.equal(Engine.pairPlusPays("other"), Engine.PAIR_PLUS.standard);
  assert.equal(Engine.pairPlusPays(undefined), Engine.PAIR_PLUS.standard);
});

test("a flush pays Pair Plus by the pay table the hand was dealt under; nothing else changes", function () {
  var bets = { ante: 100, pairPlus: 10 };
  var cards = [hand("2H 7H JH"), hand("QS 8D 3C")];
  var standard = Engine.settle(bets, cards[0], cards[1], "play", "standard");
  var lowFlush = Engine.settle(bets, cards[0], cards[1], "play", "lowFlush");
  assert.deepEqual(standard.lines.map(function (l) { return [l.key, l.returned]; }), [["pairPlus", 50], ["ante", 200], ["play", 200]]);
  assert.deepEqual(lowFlush.lines.map(function (l) { return [l.key, l.returned]; }), [["pairPlus", 40], ["ante", 200], ["play", 200]]);
  assert.deepEqual(Engine.settle(bets, cards[0], cards[1], "play"), standard, "no pay table means the standard one");
  // Every other hand settles the same under both.
  [["4S 5D 6C", "9S 10D JC"], ["7S 7D 7C", "QS 5D 9C"], ["QH KH AH", "2S 5D 9C"], ["KS KD 4C", "QS 8D 3C"]].forEach(function (deal) {
    assert.deepEqual(Engine.settle(bets, hand(deal[0]), hand(deal[1]), "play", "lowFlush"),
      Engine.settle(bets, hand(deal[0]), hand(deal[1]), "play", "standard"), deal[0]);
  });
});

// The house edge of one Pair Plus pay table over all 22,100 hands, in percent.
function pairPlusEdge(payTable) {
  var total = 0;
  ALL.forEach(function (entry) {
    var pays = Engine.pairPlusPays(payTable)[entry.hand.category] || 0;
    total += pays ? pays : -1;
  });
  return (-total / ALL.length * 100).toFixed(2);
}

test("an exhaustive count of all 22,100 hands gives Pair Plus its 2.32% house edge, and 7.28% with the flush at 3 to 1", function () {
  assert.equal(pairPlusEdge("standard"), "2.32");
  assert.equal(pairPlusEdge("lowFlush"), "7.28");
});

test("an exhaustive count of every deal gives Ante and Play their 3.37% house edge with the best strategy", function () {
  // Each hand's cards as two 26-bit masks, to skip dealer hands sharing a card.
  var low = new Int32Array(ALL.length), high = new Int32Array(ALL.length), score = new Int32Array(ALL.length);
  ALL.forEach(function (entry, i) {
    entry.cards.forEach(function (card) {
      if (card < 26) low[i] |= 1 << card;
      else high[i] |= 1 << (card - 26);
    });
    score[i] = entry.hand.score;
  });
  var net = 0, deals = 0;
  for (var i = 0; i < ALL.length; i++) {
    var mine = ALL[i].hand;
    var others = 18424; // three cards from the 49 left
    deals += others;
    if (!Engine.shouldPlay(mine)) { net -= others; continue; }
    var bonus = Engine.ANTE_BONUS[mine.category] || 0;
    var sum = 0;
    for (var j = 0; j < ALL.length; j++) {
      if ((low[i] & low[j]) || (high[i] & high[j])) continue;
      var theirs = score[j];
      if (theirs < Engine.QUALIFY_SCORE) sum += 1;
      else if (mine.score > theirs) sum += 2;
      else if (mine.score < theirs) sum -= 2;
    }
    net += sum + bonus * others;
  }
  assert.equal(deals, 22100 * 18424);
  assert.equal((-net / deals * 100).toFixed(2), "3.37");
});

/* ---------------- The 6-Card Bonus ---------------- */
// An independent judge of the best five of six cards, by rank counts and
// suit bits, fast enough to go through every six-card deal.
var RUNS = [0x100F];
for (var low = 0; low <= 8; low++) RUNS.push(0x1F << low);
function sixJudge(indexes) {
  var count = new Int8Array(13), suitBits = [0, 0, 0, 0], suitCount = [0, 0, 0, 0], bits = 0;
  indexes.forEach(function (index) {
    var r = index % 13, s = (index - r) / 13;
    count[r]++; suitBits[s] |= 1 << r; suitCount[s]++; bits |= 1 << r;
  });
  var run = function (b) { return RUNS.filter(function (w) { return (b & w) === w; }).pop() || 0; };
  var flush = suitCount.findIndex(function (n) { return n >= 5; });
  if (flush !== -1 && run(suitBits[flush])) return run(suitBits[flush]) === 0x1F << 8 ? "royalFlush" : "straightFlush";
  var sizes = Array.from(count).filter(Boolean).sort(function (a, b) { return b - a; });
  if (sizes[0] >= 4) return "quads";
  if (sizes[0] === 3 && sizes[1] >= 2) return "fullHouse";
  if (flush !== -1) return "flush";
  if (run(bits)) return "straight";
  return sizes[0] === 3 ? "trips" : "nothing";
}

test("the 6-Card Bonus names the best five of the six cards", function () {
  function six(text) { return Engine.sixCardHand(hand(text)); }
  assert.equal(six("AS KS QS JS 10S 2D"), "royalFlush");
  assert.equal(six("9S KS QS JS 10S AD"), "straightFlush", "a straight flush beats the ace-high straight beside it");
  assert.equal(six("AS 2S 3S 4S 5S KD"), "straightFlush", "the wheel");
  assert.equal(six("7S 7D 7C 7H 2S 3D"), "quads");
  assert.equal(six("7S 7D 7C 2H 2S 2D"), "fullHouse", "two threes of a kind make a full house");
  assert.equal(six("7S 7D 7C 2H 2S 3D"), "fullHouse");
  assert.equal(six("2S 5S 9S JS KS 3D"), "flush");
  assert.equal(six("2S 3D 4C 5H 6S KD"), "straight");
  assert.equal(six("QS KD AC 2H 3S 9D"), "nothing", "no straight round the corner");
  assert.equal(six("7S 7D 7C 2H 3S 5D"), "trips");
  assert.equal(six("7S 7D 2C 2H 3S 3D"), "nothing", "three pairs pay nothing");
  // The engine agrees with the independent judge on any deal.
  var deck = Engine.buildDeck();
  for (var n = 0; n < 4000; n++) {
    var cards = Engine.newDeck().slice(0, 6);
    assert.equal(Engine.sixCardHand(cards), sixJudge(cards.map(function (c) { return deck.findIndex(function (d) { return d.id === c.id; }); })));
  }
});

test("the 6-Card Bonus is paid on a folded hand too, and on its own stake", function () {
  var player = hand("7S 7D 2C"), dealer = hand("7C 7H 9D");
  var folded = Engine.settle({ ante: 10, sixCard: 5 }, player, dealer, "fold", "standard");
  assert.deepEqual(folded.lines.map(function (l) { return [l.key, l.amount, l.returned, l.result]; }), [
    ["ante", 10, 0, "lose"], ["sixCard", 5, 505, "win"]
  ]);
  assert.equal(folded.sixCard, "quads");
  assert.equal(folded.net, 505 - 15);
  var nothing = Engine.settle({ ante: 10, sixCard: 5 }, hand("2S 5D 9C"), hand("JC KH 4D"), "play", "standard");
  assert.deepEqual(nothing.lines.filter(function (l) { return l.key === "sixCard"; })[0], { key: "sixCard", amount: 5, returned: 0, result: "lose" });
  assert.equal(Engine.LIMITS.sixCard, 100);
});

test("every one of the 20,358,520 six-card deals gives the 6-Card Bonus its 8.56% house edge", function () {
  var tally = {}, total = 0;
  var h = [0, 0, 0, 0, 0, 0];
  for (h[0] = 0; h[0] < 52; h[0]++)
    for (h[1] = h[0] + 1; h[1] < 52; h[1]++)
      for (h[2] = h[1] + 1; h[2] < 52; h[2]++)
        for (h[3] = h[2] + 1; h[3] < 52; h[3]++)
          for (h[4] = h[3] + 1; h[4] < 52; h[4]++)
            for (h[5] = h[4] + 1; h[5] < 52; h[5]++) {
              var name = sixJudge(h);
              tally[name] = (tally[name] || 0) + 1;
              total++;
            }
  assert.equal(total, 20358520);
  assert.deepEqual(tally, {
    royalFlush: 188, straightFlush: 1656, quads: 14664, fullHouse: 165984,
    flush: 205792, straight: 361620, trips: 732160, nothing: 18876456
  });
  var expected = -1;
  Engine.SIX_CARD_HANDS.forEach(function (name) { expected += tally[name] / total * (Engine.SIX_CARD[name] + 1); });
  assert.equal((-expected * 100).toFixed(2), "8.56");
  var words = require("../helpers/i18n.js").loadI18n("games/threecard/js/strings.js").I18n._dict;
  assert.match(words.en.sixCardRules, /20,358,520 six-card deals the house keeps 8\.56%/);
  assert.match(words.tr.sixCardRules, /20\.358\.520 .*%8,56/);
});
