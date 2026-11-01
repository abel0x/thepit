# Changelog

All notable changes to ThePit are documented here. The project follows [Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

The first version of the pit: six tables, a slot machine and a video poker machine, one wallet, one lobby.

- A lobby that shows the play-money balance and leads to each table, with the language, the table cloth and *Add play money* in its settings.
- Table 21, the blackjack table, and Table 37, the roulette table, brought in from their own projects at version 1.0.0, each with a way back to the lobby.
- One play-money balance shared by every table, guarded by a single Web Lock across pages and tabs; without Web Locks each tab keeps its own session balance, as before.
- One round at a time across the pit: a hand or a spin left unfinished at one table is played out there before another table takes a bet, and the lobby marks that table.
- The cloth and the language chosen anywhere follow the player to every page.
- Table 9, a Punto Banco baccarat table: an eight-deck shoe with a burn and a cut card, the complete drawing tableau, Player, Banker, Tie and both pairs under Classic or No-commission rules, the bead plate and the big road, unfinished coups settled on the next visit.
- Table 3, a Three Card Poker table: Ante and Play against a dealer who qualifies with Queen high, the Ante Bonus and the Pair Plus under the Standard or Low flush pay table, a deck shuffled for every hand, an optional strategy hint, and a hand left waiting for its decision brought back with the same cards.
- Table 7, a craps table: Pass and Don't pass with odds, Come and Don't come, Place, the Field, the Hardways and the one-roll bets, the puck and the last rolls, under real table rules and with every house edge checked exactly.
- Table 2, a Casino Hold'em table: Ante and Call against a dealer who qualifies with a pair of fours, the board turned flop, turn and river, the AA Bonus, and a hand left waiting for its decision brought back with the same cards.
- Poker 11, a Jacks or Better video poker machine: one to five coins of a chip's value, hold and draw once, the 9/6 or 8/5 pay table returning 99.54% or 97.30% with the best play, an exact strategy hint, and a hand left waiting for its hold brought back with the same cards.
- Slot 5, a five-reel slot machine with 20 lines, a wild, scattered stars and ten free spins at triple pay, five sevens as its top prize, returning exactly 95.82%, with the bet on each line set by the pit's chips, and a fruit set that dresses the card ranks as watermelons, grapes, lemons and cherries without changing a single pay.
- A lobby that lays its tables out in rows: one on a phone, two on a tablet, four on a wide screen, with a last row that is not full centred.
- Two new cloths, Onyx and Amethyst, beside Emerald, Midnight and Bordeaux; at Table 21 Onyx deals from green backs and Amethyst from antique gold.
- One language engine and one set of shared words, shared stylesheets, and shared cards, card sounds and chips for the lobby and every table.
- One set of chips for the whole pit: the clay chips of Table 21 at every table, in the tray and stacked on the felt, and one colour per value everywhere, from the white $1 to the silver $100K; each table keeps its own tray.
- One installable app with one offline cache for the lobby and every table, plus the zero-setup `file://` route.
- Roulette's top bar no longer runs into the balance on the narrowest phones.
- Play money only, with a disclaimer on every page and in the README.
- Licensed under the GNU AGPL v3 or later.
