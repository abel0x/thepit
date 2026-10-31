# Changelog

All notable changes to ThePit are documented here. The project follows [Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

The first version of the pit: two tables, one wallet, one lobby.

- A lobby that shows the play-money balance and leads to each table, with the language, the table cloth and *Add play money* in its settings.
- Table 21, the blackjack table, and Table 37, the roulette table, brought in from their own projects at version 1.0.0, each with a way back to the lobby.
- One play-money balance shared by every table, guarded by a single Web Lock across pages and tabs; without Web Locks each tab keeps its own session balance, as before.
- One round at a time across the pit: a hand or a spin left unfinished at one table is played out there before another table takes a bet, and the lobby marks that table.
- The cloth and the language chosen anywhere follow the player to every page.
- One installable app with one offline cache for the lobby and both tables, plus the zero-setup `file://` route.
- Roulette's top bar no longer runs into the balance on the narrowest phones.
- Play money only, with a disclaimer on every page and in the README.
- Licensed under the GNU AGPL v3 or later.
