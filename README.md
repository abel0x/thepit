# ThePit

> [!IMPORTANT]
> **Disclaimer:** ThePit is a collection of casino table simulations made for entertainment and as a portfolio project. It uses play money only: there are no payments, deposits, withdrawals or prizes, and the chips have no cash value. It is not a gambling service, does not promote gambling and is not intended for any unlawful or harmful use. It is provided as is, without warranty, and the author accepts no liability for its use. Please read the full [disclaimer](#disclaimer).

A polished, **fully static & offline** casino of play-money table games. One lobby, one balance, every table on your own device. No build step, no runtime dependencies, no network. Open and play.

**[Enter ThePit in your browser](https://abel0x.github.io/thepit/)** · Version 0.1.0 · [GNU AGPL v3](LICENSE) · [![Tests](https://github.com/abel0x/thepit/actions/workflows/tests.yml/badge.svg)](https://github.com/abel0x/thepit/actions/workflows/tests.yml)

![The lobby of ThePit with Table 21, Table 37, Table 9 and Table 3 on green felt](assets/social-preview.jpg)

## Play

- **Online:** open https://abel0x.github.io/thepit/ and pick a table. Install it from the browser menu (or *Add to Home Screen* on iOS) to keep a copy of the whole pit that works offline.
- **Locally:** clone the repository and double‑click `index.html`. Every table works straight from `file://`, completely offline:
  ```bash
  git clone https://github.com/abel0x/thepit.git
  ```
- **Local server**, for PWA install and service‑worker offline caching:
  ```bash
  cd thepit
  python3 -m http.server 8000   # or: npm run serve
  # open http://localhost:8000
  ```

## The tables

### Table 21 · Blackjack

- **Three real table profiles**: Las Vegas (6 decks, H17), Atlantic City (8 decks, S17 and late surrender) and European (6 decks, S17 and no hole card), each with its own dealing, peek, double, surrender and split rules; advanced deck and H17 edits make a custom table.
- **Full action set**: hit, stand, double down, split up to four hands, late surrender, insurance and even money. Blackjack pays **3:2**.
- **Truly random cards**: a multi‑deck shoe shuffled with **Fisher–Yates using `crypto.getRandomValues`**, reshuffled at 75% penetration.
- **Physical table flow**: cards leave the shoe and settle into the discard tray, every split hand owns its own wager, and winnings arrive as denomination‑correct chips.
- **Strategy coach**: optional basic‑strategy feedback or hints for the active rules, with a strategy‑accuracy statistic.
- **Keyboard shortcuts**: `D` deal/double · `H` hit · `S` stand · `P` split · `X` surrender · `R` rebet · `C` clear · `Y/N` insurance · `Esc` decline/close.

### Table 37 · Roulette

- **A single‑zero wheel with two rule sets**: *European*, where every bet loses on zero (house edge 2.70%), and *French*, where La Partage returns half of each even‑money bet on zero (1.35% on those bets).
- **Every bet on the table**: all 157 standard bets, placed on the cell, line or crossing they belong to, plus the French racetrack with Voisins du Zéro, Tiers du Cylindre, Orphelins, Jeu Zéro and neighbour bets.
- **Fair, unbiased results**: every number is drawn with `crypto.getRandomValues` and rejection sampling before the ball is launched; the wheel is then choreographed to land on it.
- **A wheel that behaves like one**: a locally painted mahogany wheel whose ball slows on the track, strikes a deflector, hops across the frets and rocks to rest in its pocket.
- **Results and statistics**: recent numbers, hot and cold numbers and distributions over the last 500 spins.
- **Keyboard shortcuts**: `Space`/`Enter` spin · `1`–`6` chips · `Z` or `Backspace` undo · `C` clear · `D` double · `R` rebet · `T` racetrack · `I` statistics · `M` sound · `Esc` close.

### Table 9 · Baccarat

- **Punto Banco from an eight-deck shoe**: shuffled with `crypto.getRandomValues`, a fresh shoe burns as many cards as its first card counts, and the cut card sits fourteen cards from the end.
- **The complete tableau**: naturals stop the coup, the Player draws on 0 to 5, and the Banker's third card follows its total and the Player's third card, exactly as at a real table. An exhaustive check of every coup an eight-deck shoe can deal gives the published odds: Banker 45.86%, Player 44.62%, Tie 9.52%.
- **Every bet**: Player 1:1, Banker 19:20 (*Classic*, 5% commission) or 1:1 with a six paying 1:2 (*No commission*), Tie 8:1 and both pairs 11:1. A tie returns the Player and Banker bets.
- **Dealt as the croupier does**: four cards face down, the Player's hand turned, then the Banker's, and any third card laid sideways; losing chips are swept away and winnings paid beside the stake.
- **The scoreboards**: the bead plate and the big road, with its dragon tails and tie marks, follow the shoe and start again with every new one.
- **Keyboard shortcuts**: `Space`/`Enter` deal · `1`–`6` chips · `P` Player · `B` Banker · `T` Tie · `Z` or `Backspace` undo · `C` clear · `D` double · `R` rebet · `M` sound.

### Table 3 · Three Card Poker

- **Ante and Play against the dealer**: one deck, shuffled with `crypto.getRandomValues` for every hand. See your three cards, then play by matching the Ante or fold.
- **The dealer qualifies with Queen high**: if not, the Ante pays 1:1 and the Play bet is returned; if so, the better hand wins both at 1:1 and a tie returns both. A straight beats a flush, and A-2-3 is the lowest straight.
- **Ante Bonus and Pair Plus**: straight flush 5:1, three of a kind 4:1 and straight 1:1 on every hand played; Pair Plus pays 40, 30, 6, 4 and 1 to 1 on the player's hand alone. An exhaustive check of all 407,170,400 deals gives the published house edges: 3.37% of the Ante with the best strategy, 2.32% on Pair Plus.
- **An optional strategy hint**: play Queen-6-4 or better, fold anything less, shown on the banner and on the button it picks.
- **Saved at every step**: the hand and its stake before the first card, the decision and the Play bet before the dealer's cards. A reload brings the same cards back to the decision, or settles a decided hand.
- **Keyboard shortcuts**: `Space`/`Enter` deal or play · `1`–`6` chips · `A` Ante · `S` Pair Plus · `P` play · `F` fold · `Z` or `Backspace` undo · `C` clear · `D` double · `R` rebet · `M` sound.

### Table 7 · Craps

- **The whole layout**: Pass and Don't pass with odds up to 3, 4 and 5 times, Come and Don't come travelling to their numbers with their own odds, Place 4 to 10, the Field (2 pays double, 12 triple), the four Hardways and the one-roll bets in the middle.
- **Real table rules**: line bets before a point, come bets after; Place bets, Hardways and the odds behind a come bet are off on the come-out; a pass or come bet with a point plays until it is decided, other bets come down with a right-click.
- **Dice from `crypto.getRandomValues`**, the puck on the point and the last rolls beside the dice. Every bet's house edge, worked out exactly from the 36 rolls, matches the published one: Pass 1.41%, Don't pass 1.36%, odds 0%.
- **One round at a time**: while bets stand on the layout the round stays open and the other tables wait; the bets, the new money and the dice are saved before the dice are shown.
- **Keyboard shortcuts**: `Space`/`Enter` roll · `1`–`6` chips · `P` Pass line · `F` Field · `Z` or `Backspace` undo · `C` clear · `R` rebet · `M` sound.

### Table 2 · Casino Hold'em

- **Two cards against the dealer's**: one deck shuffled for every hand; see your two cards and the flop, then call with twice the Ante or fold.
- **The dealer qualifies with a pair of fours**: if not, the Ante pays by your hand and the Call is returned; if so, the best five of seven win the Ante by your hand (up to 100 to 1 for a royal flush) and the Call at 1 to 1.
- **The AA Bonus**: a pair of aces or better among your two cards and the flop pays up to 100 to 1, call or fold. Counting all 2,598,960 five-card hands confirms its 6.26% house edge.
- **Saved at every step**: all nine cards and the stake before the first card, the decision and the Call before the turn; a reload brings the same flop back to the decision, or settles a decided hand.
- **Keyboard shortcuts**: `Space`/`Enter` deal or call · `1`–`6` chips · `A` Ante · `B` AA Bonus · `L` call · `F` fold · `Z` or `Backspace` undo · `C` clear · `D` double · `R` rebet · `M` sound.

### Slot 5 · Slot machine

- **Five reels, three rows, 20 lines**: an original machine with sevens, diamonds, bells, horseshoes and card ranks, every reel stopped with `crypto.getRandomValues`.
- **Wild and stars**: the wild stands in for every symbol but the star; stars pay anywhere and three or more bring ten free spins at triple pay, drawn with the paid spin.
- **A return worked out exactly**: the reel strips and pays give 95.80% over the long run, confirmed by counting all 33,554,432 stops of the reels; free spins come about once in 140 paid spins.
- **Chips for the bet**: a chip from $1 to $100 sets the bet on each of the 20 lines, and the total stands on the bet plate as the pit's chips.
- **Saved before the reels turn**: the spin, its free spins and the stake; a reload settles the very same spin.
- **Keyboard shortcuts**: `Space`/`Enter` spin · `1`–`6` bet per line · `M` sound.

## One pit

- **One balance for every table**: chips won at Table 37 can be played at Table 21. Supporting browsers guard the balance with a single Web Lock across every page and tab, so a hand at one table and a spin at another can never overwrite each other; without that API, each tab plays a separate session balance and says so.
- **One round at a time**: a hand or a spin left unfinished is saved before it is played, so a reload, a crash, a closed tab or a trip back to the lobby resumes it with the same cards or the same result. Until it is played out, its stake stays on that table: the lobby marks the table, and the other tables wait instead of spending it.
- **One set of chips**: every table bets with the same clay chips, and every value keeps one colour wherever it appears, in a tray, on the felt or in a payout: $1 white, $5 red, $10 brown, $25 green, $50 orange, $100 black, $500 purple, $1K yellow, $5K blue, $25K pink, $100K silver, and All-in bordeaux. Each table offers its own tray of them: Table 21 from $100, Table 37 and Table 9 from $5, Table 3 from $10, Table 7 and Table 2 from $5, and Slot 5 a chip for each line from $1.
- **The lobby**: the balance, every table with its rules and limits, and the settings the whole pit shares. *Add play money* only adds free chips.
- **Five cloths, one language**: Emerald, Midnight, Bordeaux, Onyx and Amethyst, each with its own card back at the blackjack table, and the English or Turkish language follow the player from the lobby to every table and back.
- **One installable app**: one manifest and one offline cache for the lobby and every table. Updates wait until no round is in play and do not force another open tab to reload.
- **Built for every screen**: from 320 px phones to large desktops, with keyboard play, contained dialog focus, available zoom and reduced motion.
- **Local sound and typography**: Ogg Vorbis samples with AAC (`.m4a`) twins for Safari, and a locally bundled OFL‑licensed WOFF2 font family.

## Privacy

ThePit has no accounts, analytics, cookies or trackers, and it talks to no server beyond loading its own files. Settings, statistics, results history, the play-money balance and any unfinished round are kept in your browser's `localStorage` and never leave your device; clearing the site's data resets them. The online version is hosted on GitHub Pages, which may log visits as described in [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

## Verify

The core test suite uses only Node's built-in test runner (Node.js 22.12 or newer); there is nothing to install:

```bash
npm test                 # node --test "tests/**/*.test.js" "tests/**/*.test.cjs"
```

The suite currently executes **747 deterministic cases**. It covers every table's engine, rules, payouts and strategy charts (baccarat's odds against an exhaustive count of every coup an eight-deck shoe can deal, Three Card Poker's against every one of its 407,170,400 deals, the slot machine's against all 33,554,432 stops of its reels, every craps bet against the 36 rolls of two dice, and the AA Bonus against all 2,598,960 five-card hands), the shared wallet and its Web Locks, the one-round-at-a-time rule, saved-state validation, translation parity on every page, the service worker and its safe updates, and the complete offline shell of the lobby and every table. GitHub Actions runs it on Node 22, 24 and 26 for every push and pull request.

The optional real-browser suite adds **282 Chromium tests**: `file://` play, the shared balance between the lobby and every table, rounds resumed after reloads and closed tabs, offline PWA reloads, multiple tabs, keyboard use, both languages and screen sizes from 320 px to 1920 px. Puppeteer is declared as a development-only dependency in `package.json`; the pit itself never loads it:

```bash
npm install              # also downloads the Chrome build Puppeteer drives
npm run test:browser
```

## Development

There is no build step: edit a file and reload the page. Whenever a change touches a file the pit ships, bump `CACHE_VERSION` in `sw.js` so that installed copies pick up the new version; the update waits until no round is in play. `tools/generate-card-audio.sh` rebuilds the card-table samples in `shared/audio/` and `tools/generate-roulette-audio.sh` the roulette ones, with ffmpeg.

A new table lives in its own folder under `games/`. It loads `shared/css/pit.css` and `shared/css/table.css` before its own stylesheet, `shared/js/pit.js` and `shared/js/i18n.js` first and `shared/js/pwa.js` last, adds its own words with `I18n.define()` (a word the pit already has can never be redefined), keeps its own data under `pit.<table>.*`, and joins `Pit.TABLES`, the lobby and the cache list in `sw.js`.

## Files

```
index.html                 the lobby
lobby/                     lobby look, its own words (EN/TR) and behaviour
shared/js/pit.js           what every page shares: the wallet, its lock, the cloth
shared/js/i18n.js          the language engine and the words every page shares (EN/TR)
shared/css/pit.css         the look every page shares: font, cloths, top bar, dialogs
shared/css/table.css       the look every table shares: sound, mixer, rule profiles, chips, buttons
shared/css/cards.css       the look of a playing card, with a back for every cloth
shared/js/cards.js         the card maker every card table draws its cards with
shared/js/card-sound.js    card, chip and shuffle sounds with Web Audio cues for card tables
shared/js/chips.js         the pit's one chip palette and the clay chip drawn at every table
shared/css/chip-tables.css the look the chip tables share: frame, dialogs, tray, stacks, bet tools
shared/audio/              the card-table samples (Ogg + AAC)
shared/js/pwa.js           optional service-worker registration and safe updates
shared/fonts/              local WOFF2 interface font + OFL license
games/blackjack/           Table 21: page, look, engine, rules, strategy coach
games/roulette/            Table 37: page, look, engine, layout, wheel, sounds
games/baccarat/            Table 9: page, look, engine, saved state
games/threecard/           Table 3: page, look, engine, saved state
games/slot/                Slot 5: page, look, engine, saved state
games/craps/               Table 7: page, look, engine, saved state
games/holdem/              Table 2: page, look, engine, saved state
manifest.json              installable PWA metadata
sw.js                      offline cache for the whole pit (only used over http)
icon.svg                   app icon (apple-touch-icon.png: iOS home-screen PNG)
assets/icons/              PNG install icons (192, 512 and a maskable 512)
assets/social-preview.jpg  1200×630 link-preview image
tools/                     reproducible local audio generators
tests/                     dependency-free tests for every table, the lobby and the site
tests/browser/             optional real-browser suites (Puppeteer, development only)
.github/workflows/         continuous integration for the core suite
package.json               test scripts + dev-only Puppeteer (not needed to play)
CHANGELOG.md               release notes
LICENSE                    GNU Affero General Public License v3
```

## Disclaimer

ThePit is a free collection of casino table simulations built for entertainment, for practising basic strategy and as a portfolio project.

- **Play money only.** Chips and balances have no cash value. They cannot be bought, sold or exchanged for money or prizes, and *Add play money* only adds free chips.
- **Not gambling.** ThePit is not a gambling service, offers no real-money play, does not promote gambling and is not intended for any unlawful or harmful use.
- **No real-money advice.** The strategy coach teaches textbook basic strategy for learning purposes, and every spin and every hand is independent. Neither the coach, the statistics nor any result is a guide to real-money play.
- **Intended for adults.** Like other simulated casino games, ThePit is not aimed at minors.
- **No affiliation.** ThePit is not affiliated with any casino. The Las Vegas, Atlantic City, European and French rules only describe common rule sets.
- **No warranty, no liability.** The software is provided as is, without warranty of any kind, and the author accepts no liability for its use; see sections 15 and 16 of the [license](LICENSE). You are responsible for complying with the laws that apply where you live.

If gambling is causing problems for you or someone close to you, please seek help.

## License

Copyright (C) 2026 abel0x

ThePit is free software: you can redistribute it and/or modify it under the terms of the [GNU Affero General Public License](LICENSE) as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

The bundled interface font is licensed separately under the SIL Open Font License 1.1 ([`shared/fonts/OFL.txt`](shared/fonts/OFL.txt)).
