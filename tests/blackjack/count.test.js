/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var CardCount = require("../../games/blackjack/js/count.js");
var Engine = require("../../games/blackjack/js/engine.js");

test("Hi-Lo values: twos to sixes +1, sevens to nines 0, tens, faces and aces -1", function () {
  var values = Engine.RANKS.map(CardCount.hiLo);
  assert.deepEqual(values, [-1, 1, 1, 1, 1, 1, 0, 0, 0, -1, -1, -1, -1]);
});

test("every full shoe counts to zero, so the cards not seen give the count of those seen", function () {
  [1, 2, 6, 8].forEach(function (decks) {
    assert.equal(CardCount.runningCount(Engine.buildShoe(decks)), 0, decks + " decks");
  });
  var shoe = Engine.shuffle(Engine.buildShoe(6));
  var seen = 0;
  for (var dealt = 0; dealt < 200; dealt++) {
    seen += CardCount.hiLo(shoe.pop().rank);
    assert.equal(CardCount.runningCount(shoe), seen);
  }
});

test("the true count divides by the decks not seen yet, to one decimal", function () {
  assert.equal(CardCount.trueCount(6, 156), 2);
  assert.equal(CardCount.trueCount(-5, 260), -1);
  assert.equal(CardCount.trueCount(4, 300), 0.7);
  assert.equal(CardCount.trueCount(0, 300), 0);
  assert.ok(Object.is(CardCount.trueCount(-0.01, 300), 0), "never a negative zero");
  assert.equal(CardCount.trueCount(3, 0), 0);
});

test("answers are whole numbers with an optional sign", function () {
  assert.equal(CardCount.parseAnswer("3"), 3);
  assert.equal(CardCount.parseAnswer(" +3 "), 3);
  assert.equal(CardCount.parseAnswer("-2"), -2);
  assert.equal(CardCount.parseAnswer("−2"), -2, "the typographic minus too");
  assert.equal(CardCount.parseAnswer("0"), 0);
  ["", "two", "1.5", "3-", null, "12345"].forEach(function (text) {
    assert.equal(CardCount.parseAnswer(text), null, String(text));
  });
});

test("counts are shown signed", function () {
  assert.equal(CardCount.signed(3), "+3");
  assert.equal(CardCount.signed(-2), "−2");
  assert.equal(CardCount.signed(0), "0");
  assert.equal(CardCount.signed(0.7, 1), "+0.7");
  assert.equal(CardCount.signed(-0.04, 1), "0.0");
  assert.deepEqual(CardCount.MODES, ["off", "show", "check"]);
});
