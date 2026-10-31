/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Engine = require("../../games/blackjack/js/engine.js");
const read = file => fs.readFileSync(path.join(__dirname, "../../games/blackjack", file), "utf8");

for (const wager of [Engine.MAX_WAGER, Engine.MAX_WAGER - 1, 1000000001, 101]) {
  for (const [result, multiplier, divisor] of [["blackjack", 5n, 2n], ["win", 2n, 1n], ["surrender", 1n, 2n]]) {
    test("safe payout matches integer oracle: " + result + "/" + wager, () => {
      const actual = Engine.payoutFor(result, wager);
      assert.ok(Number.isSafeInteger(actual));
      assert.equal(BigInt(actual), BigInt(wager) * multiplier / divisor);
    });
  }
}

for (const amount of [Engine.MAX_WAGER + 1, Number.MAX_SAFE_INTEGER, 1e20]) {
  test("oversized wager is rejected before payout arithmetic: " + amount, () => {
    assert.throws(() => Engine.payoutFor("blackjack", amount), /safe table limit/);
    assert.throws(() => Engine.settleRound([], [], { insuranceStake: amount }), /safe table limit/);
  });
}

test("four maximum stakes and insurance stay inside the safe ledger range", () => {
  for (const dealer of [[{ rank: "9" }, { rank: "8" }], [{ rank: "A" }, { rank: "K" }]]) {
    const hands = Array.from({ length: 4 }, () => ({ cards: [{ rank: "K" }, { rank: "Q" }], bet: Engine.MAX_WAGER, fromSplit: true }));
    const round = Engine.settleRound(hands, dealer, { insuranceStake: Engine.MAX_WAGER });
    for (const key of ["mainStake", "mainReturn", "insuranceStake", "insuranceReturn", "totalStake", "totalReturn", "profit"]) assert.ok(Number.isSafeInteger(round[key]), key);
    assert.equal(round.totalReturn - round.totalStake, round.profit);
  }
});

test("an unbounded hand list cannot overflow the settlement ledger", () => {
  assert.throws(() => Engine.settleRound(Array(5).fill({ bet: Engine.MAX_WAGER, cards: [] }), []), /at most four hands/);
});

test("the insurance offer lives in the controls so it never covers either hand", () => {
  const html = read("index.html");
  const controls = html.slice(html.indexOf('<section class="controls"'), html.indexOf("</section>", html.indexOf('<section class="controls"')));
  assert.match(controls, /id="insuranceOverlay"/);
  assert.doesNotMatch(html.slice(html.indexOf('<div class="table-felt">'), html.indexOf('<section class="controls"')), /insuranceOverlay/);
});

test("hidden controls under the insurance offer return instantly, not via a transition", () => {
  const css = read("css/styles.css");
  const rule = css.match(/body\[data-phase="insurance"\] \.controls > :not\(\.ins-overlay\) \{([^}]*)\}/);
  assert.ok(rule, "insurance-phase controls rule");
  assert.doesNotMatch(rule[1], /visibility/);
  assert.match(rule[1], /pointer-events:\s*none/);
});

test("settlement shows one verdict: no money toast or dealer echo alongside the badge", () => {
  const game = read("js/game.js");
  const settle = game.slice(game.indexOf("function settle()"), game.indexOf("function prepareHandSettlements"));
  assert.doesNotMatch(settle, /moneyToast|toastKey|dealerSay/);
  assert.match(settle, /showResult\("win", "youWin", profit\)/);
});
