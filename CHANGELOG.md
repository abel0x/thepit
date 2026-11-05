# Changelog

All notable changes to ThePit are documented here. The project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-05

The first release of the pit: nine tables, a money wheel, a slot machine, a video poker machine, a keno machine and a peg board, one wallet, one lobby.

### The pit

- A lobby that shows the play-money balance and leads to each table, with the language, the table cloth and *Add play money* in its settings, its tables laid out in rows: one on a phone, two on a tablet, four on a wide screen, with a last row that is not full centred.
- The lobby's *Your play*: every table's rounds, wagered, returned, net and return per dollar, with the pit's total.
- One play-money balance shared by every table, guarded by a single Web Lock across pages and tabs; without Web Locks each tab keeps its own session balance.
- One round at a time across the pit: a hand or a spin left unfinished at one table is played out there before another table takes a bet, and the lobby marks that table.
- A save on file: the whole pit downloaded to one JSON backup and restored from it after a confirmation, under the account lock.
- The cloth and the language chosen anywhere follow the player to every page. Five cloths: Emerald, Midnight, Bordeaux, Onyx and Amethyst.
- English and Turkish throughout, with shares written the Turkish way in Turkish, the sign first (%97,11).
- One set of chips for the whole pit: the clay chips of Table 21 at every table, in the tray and stacked on the felt, and one colour per value everywhere, from the white $1 to the silver $100K; each table keeps its own tray.
- One language engine and one set of shared words, shared stylesheets, and shared cards, card sounds and chips for the lobby and every table.
- Every button within reach from wide screens down to the smallest phones, upright or on their side: where space is short the tray takes a row of its own or the chips and tools grow slimmer, so Deal, Spin, Roll and Play are never cut off by the edge of the table. A walk through twelve screen sizes checks each table while betting and in play.
- One installable app with one offline cache for the lobby and every table, plus the zero-setup `file://` route.
- Play money only, with a disclaimer on every page and in the README.
- Licensed under the GNU AGPL v3 or later.

### The tables

- Table 21, the blackjack table, brought in from its own project at version 1.0.0 with a way back to the lobby and the settings gear of every other table, and grown in the pit:
  - Perfect Pairs and 21+3 beside the main circle, each up to the main bet, settled on the opening cards and paid with the round, offered with six or eight decks and their house edges counted exactly over every draw of a full shoe.
  - A Hi-Lo card counting trainer: the running and true count on the shoe, or a quiz between hands that keeps score, with the hole card counted only once it is turned.
  - What it takes and pays back counted for *Your play*, side bets and insurance included.
- Table 37, the roulette table, brought in from its own project at version 1.0.0 with a way back to the lobby; its top bar no longer runs into the balance on the narrowest phones.
- Table 2, a Casino Hold'em table: Ante and Call against a dealer who qualifies with a pair of fours, the board turned flop, turn and river, the AA Bonus, and a hand left waiting for its decision brought back with the same cards.
- Table 3, a Three Card Poker table: Ante and Play against a dealer who qualifies with Queen high, the Ante Bonus and the Pair Plus under the Standard or Low flush pay table, a deck shuffled for every hand, an optional strategy hint, and a hand left waiting for its decision brought back with the same cards. Its 6-Card Bonus takes up to $100 on the best five of the player's and the dealer's six cards, is paid on a folded hand too, from 7 to 1 for three of a kind to 1000 to 1 for a royal flush, with its 8.56% house edge counted over all 20,358,520 six-card deals.
- Table 4, a Fan-Tan table: a pile of 41 to 104 beads counted off in fours, thirty-eight bets from Fan at 3 to 1 to Sheh Sam Hong at 1 to 3, every win paid its odds less 5% with the change kept in a box to the cent, house edges from 1.25% to 3.75% checked over every result, and the last results in the colour of each number.
- Table 7, a craps table: Pass and Don't pass with odds, Come and Don't come, Place, the Field, the Hardways and the one-roll bets, the puck and the last rolls, under real table rules and with every house edge checked exactly. Put bets go straight on a number once a point is on, seventeen one-roll hop bets pay 15 or 30 to 1, and the Fire Bet on the different points a new shooter makes pays up to 999 to 1 with a 20.76% house edge counted exactly, its points lit on the layout.
- Table 9, a Punto Banco baccarat table: an eight-deck shoe with a burn and a cut card, the complete drawing tableau, Player, Banker, Tie and both pairs under Classic or No-commission rules, the bead plate and the big road, and unfinished coups settled on the next visit.
  - A commission box as at a real table: Banker wins are paid at even money and the 5% commission is collected to the cent, a whole dollar at a time, so every stake pays exactly 19 to 20; without commission, the half dollar of an odd stake on a six is owed to the player in the same box.
  - The Dragon Bonus on the Player and on the Banker: a winning natural pays 1 to 1 and a tie of naturals is returned, other wins pay by their margin up to 30 to 1, with house edges of 2.65% and 9.37% counted over the whole shoe.
- Table 13, a Red Dog table: two cards from an eight-deck shoe set the spread, a Raise that doubles the Ante, the third card paid 5, 4, 2 or 1 to 1 by the spread and three of a kind 11 to 1, a ladder of the ranks between, an optional strategy hint, and a house edge of 2.75% counted over every deal of the shoe.
- Table 18, a Sic Bo table: three dice deciding Small and Big, Odd and Even, the totals, the triples, the doubles, the two-dice combinations and the single numbers in one roll, the classic pay table with every house edge checked against all 216 rolls, the winning spots lit after each roll, and a roll left unfinished settled with the same dice. Its statistics chart the last 500 results against their exact chances, with the rounds since each last came.
- Wheel 54, a Big Six money wheel: 54 segments from $1 to $20 with a Joker and the pit's logo, seven bets paying their number to 1 and 40 to 1, every house edge checked against the whole wheel, and a spin left unfinished settled on the same segment. Its statistics chart the last 500 results against their exact chances, with the spins since each last came.

### The machines

- Slot 5, a five-reel slot machine with 20 lines, a wild, scattered stars and ten free spins at triple pay, five sevens as its top prize, returning exactly 95.82%, with the bet on each line set by the pit's chips, and a fruit set that dresses the card ranks as watermelons, grapes, lemons and cherries without changing a single pay. Autoplay runs 10 to 100 spins with stops at a loss limit, on a big win, when free spins start or at a press of Stop, and is never saved across a reload.
- Poker 11, a video poker machine: one to five coins of a chip's value, hold and draw once, Jacks or Better at 9/6 or 8/5, Double Bonus and Deuces Wild returning 99.54%, 97.30%, 99.11% and 99.73% with the best play, an exact strategy hint with the value of all 32 holds and a count of how often your hold was the best, and a hand left waiting for its hold brought back with the same cards.
- Keno 80, a keno machine: mark 1 to 10 of 80 numbers or quick pick, twenty balls drawn one by one, a pay table for every count of marks with its exact return, and a game left unfinished settled with the same balls. One ticket plays 1, 5, 10 or 20 draws in a row, every draw paid for, drawn and saved before the first ball, and the lot paid together.
- Drop 16, a peg board machine: balls bounce down 8, 12 or 16 rows of pegs into slots that pay up to 1000 times the bet, under three risks with pay tables of its own and returns from 96.88% to 97.25% counted over every way down, with 1, 5, 10 or 20 balls a drop, all saved before the first one falls.

[1.0.0]: https://github.com/abel0x/thepit/releases/tag/v1.0.0
