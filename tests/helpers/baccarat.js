/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// The exact odds of a coup from a full eight-deck shoe, counted card by card
// through the complete tableau. Shared by the baccarat and economy tests.
var Engine = require("../../games/baccarat/js/engine.js");

function c(rank) { return Engine.card(rank, "♠"); }

function enumerateShoe() {
  var counts = [128, 32, 32, 32, 32, 32, 32, 32, 32, 32];   // tens and court cards count nothing
  var left = 416;
  // outcomes: the chance of every way a coup can end, keyed
  // "natural|player total|banker total", for bets that pay by the totals.
  var odds = { player: 0, banker: 0, tie: 0, bankerSix: 0, outcomes: {} };
  var card = function (v) { return c(v === 0 ? "K" : v === 1 ? "A" : String(v)); };
  function draw(weight, next) {
    for (var v = 0; v <= 9; v++) {
      if (!counts[v]) continue;
      var p = weight * counts[v] / left;
      counts[v]--; left--;
      next(p, card(v));
      counts[v]++; left++;
    }
  }
  draw(1, function (w1, p1) {
    draw(w1, function (w2, b1) {
      draw(w2, function (w3, p2) {
        draw(w3, function (w4, b2) {
          var player = [p1, p2], banker = [b1, b2];
          function finish(w) {
            var pt = Engine.total(player), bt = Engine.total(banker);
            var natural = player.length === 2 && banker.length === 2 && (Engine.isNatural(player) || Engine.isNatural(banker));
            var key = (natural ? 1 : 0) + "|" + pt + "|" + bt;
            odds.outcomes[key] = (odds.outcomes[key] || 0) + w;
            if (pt > bt) odds.player += w;
            else if (bt > pt) { odds.banker += w; if (bt === 6) odds.bankerSix += w; }
            else odds.tie += w;
          }
          function bankerTurn(w, third) {
            if (Engine.bankerDraws(Engine.total(banker), third)) {
              draw(w, function (w6, b3) { banker.push(b3); finish(w6); banker.pop(); });
            } else {
              finish(w);
            }
          }
          if (Engine.isNatural(player) || Engine.isNatural(banker)) finish(w4);
          else if (Engine.playerDraws(Engine.total(player))) {
            draw(w4, function (w5, p3) { player.push(p3); bankerTurn(w5, p3); player.pop(); });
          } else {
            bankerTurn(w4, null);
          }
        });
      });
    });
  });
  return odds;
}

// The return of one unit on a bet that pays by the totals, over the whole shoe.
function expectedReturn(odds, key, rules) {
  var sum = 0;
  Object.keys(odds.outcomes).forEach(function (outcome) {
    var parts = outcome.split("|").map(Number);
    var coup = {
      natural: parts[0] === 1, playerTotal: parts[1], bankerTotal: parts[2],
      winner: parts[1] > parts[2] ? "player" : parts[2] > parts[1] ? "banker" : "tie"
    };
    sum += odds.outcomes[outcome] * Engine.returnFor(key, 1, coup, rules || "classic");
  });
  return sum;
}

module.exports = { enumerateShoe: enumerateShoe, expectedReturn: expectedReturn };
