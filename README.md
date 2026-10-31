# ThePit

> [!IMPORTANT]
> **Disclaimer:** ThePit is a collection of casino table simulations made for entertainment and as a portfolio project. It uses play money only: there are no payments, deposits, withdrawals or prizes, and the chips have no cash value. It is not a gambling service, does not promote gambling and is not intended for any unlawful or harmful use. It is provided as is, without warranty, and the author accepts no liability for its use. Please read the full [disclaimer](#disclaimer).

A polished, **fully static & offline** casino of play-money table games. One lobby, one balance, every table on your own device. No build step, no runtime dependencies, no network. Open and play.

**[Enter ThePit in your browser](https://abel0x.github.io/thepit/)** · Version 0.1.0 · [GNU AGPL v3](LICENSE) · [![Tests](https://github.com/abel0x/thepit/actions/workflows/tests.yml/badge.svg)](https://github.com/abel0x/thepit/actions/workflows/tests.yml)

![The lobby of ThePit with Table 21 and Table 37 on green felt](assets/social-preview.jpg)

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

## One pit

- **One balance for every table**: chips won at Table 37 can be played at Table 21. Supporting browsers guard the balance with a single Web Lock across every page and tab, so a hand at one table and a spin at another can never overwrite each other; without that API, each tab plays a separate session balance and says so.
- **One round at a time**: a hand or a spin left unfinished is saved before it is played, so a reload, a crash, a closed tab or a trip back to the lobby resumes it with the same cards or the same result. Until it is played out, its stake stays on that table: the lobby marks the table, and the other tables wait instead of spending it.
- **The lobby**: the balance, every table with its rules and limits, and the settings the whole pit shares. *Add play money* only adds free chips.
- **Shared look and language**: Emerald, Midnight and Bordeaux cloths and the English or Turkish language follow the player from the lobby to every table and back.
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

The suite currently executes **639 deterministic cases**. It covers both tables' engines, rules, payouts and strategy charts, the shared wallet and its Web Locks, the one-round-at-a-time rule, saved-state validation, translation parity on every page, the service worker and its safe updates, and the complete offline shell of the lobby and every table. GitHub Actions runs it on Node 22, 24 and 26 for every push and pull request.

The optional real-browser suite adds **198 Chromium tests**: `file://` play, the shared balance between the lobby and both tables, rounds resumed after reloads and closed tabs, offline PWA reloads, multiple tabs, keyboard use, both languages and screen sizes from 320 px to 1920 px. Puppeteer is declared as a development-only dependency in `package.json`; the pit itself never loads it:

```bash
npm install              # also downloads the Chrome build Puppeteer drives
npm run test:browser
```

## Development

There is no build step: edit a file and reload the page. Whenever a change touches a file the pit ships, bump `CACHE_VERSION` in `sw.js` so that installed copies pick up the new version; the update waits until no round is in play. `tools/generate-blackjack-audio.sh` and `tools/generate-roulette-audio.sh` rebuild each table's sound samples with ffmpeg.

A new table lives in its own folder under `games/`, loads `shared/js/pit.js` first and `shared/js/pwa.js` last, keeps its own data under `pit.<table>.*`, and joins `Pit.TABLES`, the lobby and the cache list in `sw.js`.

## Files

```
index.html                 the lobby
lobby/                     lobby look, translations (EN/TR) and behaviour
shared/js/pit.js           what every page shares: the wallet, its lock, the cloth
shared/js/pwa.js           optional service-worker registration and safe updates
shared/fonts/              local WOFF2 interface font + OFL license
games/blackjack/           Table 21: page, look, engine, rules, strategy coach, sounds
games/roulette/            Table 37: page, look, engine, layout, wheel, sounds
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
