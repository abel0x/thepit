# Changelog

All notable changes to ThePit are documented here. The project follows [Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

The first version of the pit: four tables and a slot machine, one wallet, one lobby.

- A lobby that shows the play-money balance and leads to each table, with the language, the table cloth and *Add play money* in its settings.
- Table 21, the blackjack table, and Table 37, the roulette table, brought in from their own projects at version 1.0.0, each with a way back to the lobby.
- One play-money balance shared by every table, guarded by a single Web Lock across pages and tabs; without Web Locks each tab keeps its own session balance, as before.
- One round at a time across the pit: a hand or a spin left unfinished at one table is played out there before another table takes a bet, and the lobby marks that table.
- The cloth and the language chosen anywhere follow the player to every page.
- Table 9, a Punto Banco baccarat table: an eight-deck shoe with a burn and a cut card, the complete drawing tableau, Player, Banker, Tie and both pairs under Classic or No-commission rules, the bead plate and the big road, unfinished coups settled on the next visit.
- Table 3, a Three Card Poker table: Ante and Play against a dealer who qualifies with Queen high, the Ante Bonus and the Pair Plus, a deck shuffled for every hand, an optional strategy hint, and a hand left waiting for its decision brought back with the same cards.
- Slot 5, a five-reel slot machine with 20 lines, a wild, scattered stars and ten free spins at triple pay, returning exactly 95.80%, with the bet on each line set by the pit's chips.
- A lobby that lays its tables out in rows: one on a phone, two on a tablet, four on a wide screen, with a last row that is not full centred.
- Two new cloths, Onyx and Amethyst, beside Emerald, Midnight and Bordeaux; at Table 21 Onyx deals from green backs and Amethyst from antique gold.
- One language engine and one set of shared words, shared stylesheets, and shared cards, card sounds and chips for the lobby and every table.
- One set of chips for the whole pit: the clay chips of Table 21 at every table, in the tray and stacked on the felt, and one colour per value everywhere, from the white $1 to the silver $100K; each table keeps its own tray.
- One installable app with one offline cache for the lobby and every table, plus the zero-setup `file://` route.
- Roulette's top bar no longer runs into the balance on the narrowest phones.
- Play money only, with a disclaimer on every page and in the README.
- Licensed under the GNU AGPL v3 or later.
