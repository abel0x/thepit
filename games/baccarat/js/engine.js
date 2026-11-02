/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 9 — pure Punto Banco engine
   The shoe, the drawing rules, every bet's settlement, the Dragon
   Bonus and the two scoreboards. No DOM, storage, network, or third-party dependencies.
   Exposed as window.BaccaratEngine and CommonJS for tests.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory(root && root.crypto);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BaccaratEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (cryptoSource) {
  "use strict";

  var RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  var SUITS = ["♠", "♥", "♦", "♣"];
  var SUIT_CODES = { "♠": "S", "♥": "H", "♦": "D", "♣": "C" };
  var DECKS = 8;
  // The cut card: a fresh shoe is brought in before a coup once fewer cards remain.
  var CUT_CARD = 14;
  var UINT32_RANGE = 0x100000000;

  var BETS = ["playerDragon", "playerPair", "player", "tie", "banker", "bankerPair", "bankerDragon"];
  var RULES = ["classic", "noCommission"];
  // Table maximum for each bet; the minimum is the smallest chip.
  var LIMITS = { player: 5000, banker: 5000, tie: 1000, playerPair: 500, bankerPair: 500, playerDragon: 500, bankerDragon: 500 };
  // The Dragon Bonus on a hand that wins without a natural pays by how many
  // points it wins by; by three or fewer it loses.
  var DRAGON_PAYS = { 4: 1, 5: 2, 6: 4, 7: 6, 8: 10, 9: 30 };

  /* ---------------- Cards ---------------- */
  function colorOf(suit) {
    return suit === "♥" || suit === "♦" ? "red" : "black";
  }

  function card(rank, suit, deck) {
    return { rank: rank, suit: suit, color: colorOf(suit), id: rank + SUIT_CODES[suit] + (deck == null ? "" : "-" + deck) };
  }

  // Compact form for saving a shoe: "AS", "10H", "QD".
  function code(c) {
    return c.rank + SUIT_CODES[c.suit];
  }

  function fromCode(text, deck) {
    var match = /^(A|[2-9]|10|J|Q|K)([SHDC])$/.exec(String(text));
    if (!match) return null;
    var suit = Object.keys(SUIT_CODES).filter(function (s) { return SUIT_CODES[s] === match[2]; })[0];
    return card(match[1], suit, deck);
  }

  // Baccarat counts aces as one and tens and court cards as nothing.
  function value(c) {
    if (c.rank === "A") return 1;
    if (c.rank === "10" || c.rank === "J" || c.rank === "Q" || c.rank === "K") return 0;
    return Number(c.rank);
  }

  // Only the last digit of a hand counts.
  function total(cards) {
    return cards.reduce(function (sum, c) { return sum + value(c); }, 0) % 10;
  }

  function isNatural(cards) {
    return cards.length === 2 && total(cards) >= 8;
  }

  function isPair(cards) {
    return cards.length >= 2 && cards[0].rank === cards[1].rank;
  }

  /* ---------------- Randomness and the shoe ---------------- */
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

  // Fisher–Yates, in place.
  function shuffle(cards, source) {
    for (var i = cards.length - 1; i > 0; i--) {
      var j = randomInt(i + 1, source);
      var swap = cards[i];
      cards[i] = cards[j];
      cards[j] = swap;
    }
    return cards;
  }

  function buildShoe(decks) {
    var cards = [];
    for (var d = 0; d < (decks || DECKS); d++) {
      SUITS.forEach(function (suit) {
        RANKS.forEach(function (rank) { cards.push(card(rank, suit, d)); });
      });
    }
    return cards;
  }

  // A fresh, shuffled shoe. The first card is turned over and as many cards
  // as it counts (ten for a ten or a court card) are burned with it.
  function newShoe(source, decks) {
    var cards = shuffle(buildShoe(decks), source);
    var first = cards.shift();
    var count = value(first) || 10;
    var burned = [first].concat(cards.splice(0, count));
    return { cards: cards, burned: burned };
  }

  function needsNewShoe(cards) {
    return !cards || cards.length < CUT_CARD;
  }

  /* ---------------- Drawing rules ---------------- */
  // The Player draws on 0 to 5 and stands on 6 and 7.
  function playerDraws(playerTotal) {
    return playerTotal <= 5;
  }

  // The Banker's third card depends on its total and on the Player's third
  // card; without one, the Banker draws on 0 to 5 like the Player.
  function bankerDraws(bankerTotal, playerThird) {
    if (!playerThird) return bankerTotal <= 5;
    var p = value(playerThird);
    switch (bankerTotal) {
      case 0: case 1: case 2: return true;
      case 3: return p !== 8;
      case 4: return p >= 2 && p <= 7;
      case 5: return p >= 4 && p <= 7;
      case 6: return p === 6 || p === 7;
      default: return false;
    }
  }

  // Plays one coup, taking each card from draw(): Player, Banker, Player,
  // Banker, then the third cards the rules call for. The cards in the order
  // they were dealt come back too, so the table can show them that way.
  function playCoup(draw) {
    var order = [];
    function deal(hand, side) {
      var c = draw();
      hand.push(c);
      order.push({ side: side, card: c });
      return c;
    }
    var player = [], banker = [];
    deal(player, "player"); deal(banker, "banker"); deal(player, "player"); deal(banker, "banker");
    var natural = isNatural(player) || isNatural(banker);
    var playerThird = null;
    if (!natural) {
      if (playerDraws(total(player))) playerThird = deal(player, "player");
      if (bankerDraws(total(banker), playerThird)) deal(banker, "banker");
    }
    return describe(player, banker, order);
  }

  function describe(player, banker, order) {
    var pt = total(player), bt = total(banker);
    return {
      player: player,
      banker: banker,
      order: order,
      playerTotal: pt,
      bankerTotal: bt,
      winner: pt > bt ? "player" : bt > pt ? "banker" : "tie",
      natural: isNatural(player) || isNatural(banker),
      playerPair: isPair(player),
      bankerPair: isPair(banker)
    };
  }

  // True when two hands could only have come from the rules above.
  function isLegalCoup(player, banker) {
    if (player.length < 2 || player.length > 3 || banker.length < 2 || banker.length > 3) return false;
    var natural = isNatural(player.slice(0, 2)) || isNatural(banker.slice(0, 2));
    if (natural) return player.length === 2 && banker.length === 2;
    var playerShouldDraw = playerDraws(total(player.slice(0, 2)));
    if ((player.length === 3) !== playerShouldDraw) return false;
    var bankerShouldDraw = bankerDraws(total(banker.slice(0, 2)), player[2] || null);
    return (banker.length === 3) === bankerShouldDraw;
  }

  /* ---------------- Settlement ---------------- */
  // The Dragon Bonus on one side: a natural that wins pays even money and a
  // tie of naturals is a push; a win without a natural pays by its margin.
  function dragonReturn(side, amount, coup) {
    if (coup.natural) {
      if (coup.winner === side) return amount * 2;
      return coup.winner === "tie" ? amount : 0;
    }
    if (coup.winner !== side) return 0;
    var margin = side === "player" ? coup.playerTotal - coup.bankerTotal : coup.bankerTotal - coup.playerTotal;
    var pays = DRAGON_PAYS[margin];
    return pays ? amount * (pays + 1) : 0;
  }

  // Whole play-money dollars returned on one bet, stake included. A Banker
  // win is paid at even money; what it owes or is owed in cents goes in the
  // commission box (see boxCents).
  function returnFor(key, amount, coup, rules) {
    switch (key) {
      case "player":
        return coup.winner === "player" ? amount * 2 : coup.winner === "tie" ? amount : 0;
      case "banker":
        if (coup.winner === "tie") return amount;
        if (coup.winner !== "banker") return 0;
        if (rules === "noCommission") return coup.bankerTotal === 6 ? amount + Math.floor(amount / 2) : amount * 2;
        return amount * 2;
      case "tie":
        return coup.winner === "tie" ? amount * 9 : 0;
      case "playerPair":
        return coup.playerPair ? amount * 12 : 0;
      case "bankerPair":
        return coup.bankerPair ? amount * 12 : 0;
      case "playerDragon":
        return dragonReturn("player", amount, coup);
      case "bankerDragon":
        return dragonReturn("banker", amount, coup);
      default:
        throw new RangeError("Not a baccarat bet: " + key);
    }
  }

  function wholeAmount(value) {
    value = Number(value);
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  }

  // Keeps only real bets with whole, positive amounts, in table order.
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

  // The cents one bet leaves in the commission box, as at a real table where
  // the 5% is not taken from the payout but owed beside it: a Banker win owes
  // its commission under classic rules, and a Banker six without commission
  // is owed the half dollar of an odd stake, as a negative amount.
  function boxCents(key, amount, coup, rules) {
    if (key !== "banker" || coup.winner !== "banker") return 0;
    if (rules === "noCommission") return coup.bankerTotal === 6 && amount % 2 ? -50 : 0;
    return amount * 5;
  }

  // What the box holds between coups: whole cents, less than a dollar either way.
  function normalizeBox(value) {
    value = Number(value);
    return Number.isInteger(value) && value > -100 && value < 100 ? value : 0;
  }

  // Settles a coup against the commission box. `returned` is what the bets
  // pay, stake included; every whole dollar the box then holds is taken from
  // the payout (`collected`), or added to it when the box owes the player, and
  // the cents left stay in the box for the next coup. `paid` is what reaches
  // the balance, so over any run of coups the player pays exactly 5%.
  function settle(bets, coup, rules, box) {
    bets = normalizeBets(bets);
    var commission = 0;
    var lines = Object.keys(bets).map(function (key) {
      var amount = bets[key];
      var returned = returnFor(key, amount, coup, rules);
      commission += boxCents(key, amount, coup, rules);
      return { key: key, amount: amount, returned: returned, result: returned > amount ? "win" : returned === amount ? "push" : "lose" };
    });
    var stake = totalStake(bets);
    var returned = lines.reduce(function (sum, line) { return sum + line.returned; }, 0);
    var held = normalizeBox(box) + commission;
    var collected = held >= 0 ? Math.floor(held / 100) : -Math.floor(-held / 100);
    var paid = returned - collected;
    return {
      lines: lines,
      stake: stake,
      returned: returned,
      commission: commission,
      collected: collected + 0,
      box: held - collected * 100,
      paid: paid,
      net: paid - stake
    };
  }

  /* ---------------- Scoreboards ---------------- */
  // A coup as the scoreboards remember it.
  function result(coup) {
    return {
      winner: coup.winner,
      player: coup.playerTotal,
      banker: coup.bankerTotal,
      natural: coup.natural,
      playerPair: coup.playerPair,
      bankerPair: coup.bankerPair
    };
  }

  // The bead plate: every coup in order, six to a column.
  function beadPlate(results) {
    return results.map(function (r, index) {
      return { col: Math.floor(index / 6), row: index % 6, result: r };
    });
  }

  // The big road: a column for each run of Player or Banker wins, six rows
  // deep. A run that reaches the bottom, or a cell already taken, turns right
  // and keeps going right (the dragon tail). Ties are not placed but marked
  // on the win before them.
  function bigRoad(results) {
    var cells = [];
    var taken = {};
    var leadingTies = 0;
    var column = -1, col = 0, row = 0, last = null, turned = false;
    results.forEach(function (r) {
      if (r.winner === "tie") {
        if (cells.length) cells[cells.length - 1].ties++;
        else leadingTies++;
        return;
      }
      if (r.winner !== last) {
        do { column++; } while (taken[column + ":0"]);
        col = column;
        row = 0;
        turned = false;
      } else if (!turned && row < 5 && !taken[col + ":" + (row + 1)]) {
        row++;
      } else {
        col++;
        turned = true;
      }
      taken[col + ":" + row] = true;
      cells.push({ col: col, row: row, winner: r.winner, ties: 0, result: r });
      last = r.winner;
    });
    if (cells.length && leadingTies) cells[0].ties += leadingTies;
    return { cells: cells, leadingTies: cells.length ? 0 : leadingTies };
  }

  function tally(results) {
    var counts = { player: 0, banker: 0, tie: 0, natural: 0, playerPair: 0, bankerPair: 0 };
    results.forEach(function (r) {
      counts[r.winner]++;
      if (r.natural) counts.natural++;
      if (r.playerPair) counts.playerPair++;
      if (r.bankerPair) counts.bankerPair++;
    });
    return counts;
  }

  return {
    RANKS: RANKS,
    SUITS: SUITS,
    DECKS: DECKS,
    CUT_CARD: CUT_CARD,
    BETS: BETS,
    RULES: RULES,
    LIMITS: LIMITS,
    DRAGON_PAYS: DRAGON_PAYS,
    card: card,
    code: code,
    fromCode: fromCode,
    value: value,
    total: total,
    isNatural: isNatural,
    isPair: isPair,
    randomInt: randomInt,
    shuffle: shuffle,
    buildShoe: buildShoe,
    newShoe: newShoe,
    needsNewShoe: needsNewShoe,
    playerDraws: playerDraws,
    bankerDraws: bankerDraws,
    playCoup: playCoup,
    describe: describe,
    isLegalCoup: isLegalCoup,
    returnFor: returnFor,
    dragonReturn: dragonReturn,
    boxCents: boxCents,
    normalizeBox: normalizeBox,
    wholeAmount: wholeAmount,
    normalizeBets: normalizeBets,
    totalStake: totalStake,
    settle: settle,
    result: result,
    beadPlate: beadPlate,
    bigRoad: bigRoad,
    tally: tally
  };
});
