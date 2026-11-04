# Changelog

All notable changes to ThePit are documented here. The project follows [Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

The first version of the pit: seven tables, a money wheel, a slot machine, a video poker machine and a keno machine, one wallet, one lobby.

- A lobby that shows the play-money balance and leads to each table, with the language, the table cloth and *Add play money* in its settings.
- Table 21, the blackjack table, and Table 37, the roulette table, brought in from their own projects at version 1.0.0, each with a way back to the lobby.
- Table 21's settings button shows the same gear as every other table.
- The lobby's *Your play*: every table's rounds, wagered, returned, net and return per dollar, with the pit's total. Table 21 now counts what it takes and pays back too, side bets and insurance included.
- A save on file: the whole pit downloaded to one JSON backup and restored from it after a confirmation, under the account lock.
- Table 21 pays a side bet won on the opening cards when the hand is then surrendered; it was lost before.
- Statistics at Table 18 and Wheel 54: the last 500 results charted against their exact chances, with the rounds since each last came.
- Keno 80 multi-race: one ticket for 1, 5, 10 or 20 draws in a row, every draw paid for, drawn and saved before the first ball, and the lot paid together.
- Slot 5 autoplay: 10 to 100 spins with stops at a loss limit, on a big win, when free spins start or at a press of Stop, never saved across a reload.
- Table 7 put, hop and Fire bets: a come bet put straight on a number once a point is on, seventeen one-roll hop bets at 15 or 30 to 1, and the Fire Bet on the different points a new shooter makes, paying up to 999 to 1 with a 20.76% house edge counted exactly, its points lit on the layout.
- Table 3 6-Card Bonus: up to $100 on the best five of the player's and the dealer's six cards, paid on a folded hand too, from 7 to 1 for three of a kind to 1000 to 1 for a royal flush, with its 8.56% house edge counted over all 20,358,520 six-card deals.
- Table 9 Dragon Bonus on the Player and on the Banker: a winning natural pays 1 to 1 and a tie of naturals is returned, other wins pay by their margin up to 30 to 1, with house edges of 2.65% and 9.37% counted over the whole shoe.
- Table 21 side bets: Perfect Pairs and 21+3 beside the main circle, each up to the main bet, settled on the opening cards and paid with the round, offered with six or eight decks and their house edges counted exactly over every draw of a full shoe.
- Table 21 card counting trainer: the Hi-Lo running and true count on the shoe, or a quiz between hands that keeps score, with the hole card counted only once it is turned.
- One play-money balance shared by every table, guarded by a single Web Lock across pages and tabs; without Web Locks each tab keeps its own session balance, as before.
- One round at a time across the pit: a hand or a spin left unfinished at one table is played out there before another table takes a bet, and the lobby marks that table.
- The cloth and the language chosen anywhere follow the player to every page.
- Table 9, a Punto Banco baccarat table: an eight-deck shoe with a burn and a cut card, the complete drawing tableau, Player, Banker, Tie and both pairs under Classic or No-commission rules, the bead plate and the big road, unfinished coups settled on the next visit.
- Table 3, a Three Card Poker table: Ante and Play against a dealer who qualifies with Queen high, the Ante Bonus and the Pair Plus under the Standard or Low flush pay table, a deck shuffled for every hand, an optional strategy hint, and a hand left waiting for its decision brought back with the same cards.
- Table 7, a craps table: Pass and Don't pass with odds, Come and Don't come, Place, the Field, the Hardways and the one-roll bets, the puck and the last rolls, under real table rules and with every house edge checked exactly.
- Table 2, a Casino Hold'em table: Ante and Call against a dealer who qualifies with a pair of fours, the board turned flop, turn and river, the AA Bonus, and a hand left waiting for its decision brought back with the same cards.
- Poker 11, a video poker machine: one to five coins of a chip's value, hold and draw once, Jacks or Better at 9/6 or 8/5, Double Bonus and Deuces Wild returning 99.54%, 97.30%, 99.11% and 99.73% with the best play, an exact strategy hint with the value of all 32 holds and a count of how often your hold was the best, and a hand left waiting for its hold brought back with the same cards.
- Table 18, a Sic Bo table: three dice deciding Small and Big, Odd and Even, the totals, the triples, the doubles, the two-dice combinations and the single numbers in one roll, the classic pay table with every house edge checked against all 216 rolls, the winning spots lit after each roll, and a roll left unfinished settled with the same dice.
- Wheel 54, a Big Six money wheel: 54 segments from $1 to $20 with a Joker and the pit's logo, seven bets paying their number to 1 and 40 to 1, every house edge checked against the whole wheel, and a spin left unfinished settled on the same segment.
- Keno 80, a keno machine: mark 1 to 10 of 80 numbers or quick pick, twenty balls drawn one by one, a pay table for every count of marks with its exact return, and a game left unfinished settled with the same balls.
- Slot 5, a five-reel slot machine with 20 lines, a wild, scattered stars and ten free spins at triple pay, five sevens as its top prize, returning exactly 95.82%, with the bet on each line set by the pit's chips, and a fruit set that dresses the card ranks as watermelons, grapes, lemons and cherries without changing a single pay.
- A lobby that lays its tables out in rows: one on a phone, two on a tablet, four on a wide screen, with a last row that is not full centred.
- Two new cloths, Onyx and Amethyst, beside Emerald, Midnight and Bordeaux; at Table 21 Onyx deals from green backs and Amethyst from antique gold.
- One language engine and one set of shared words, shared stylesheets, and shared cards, card sounds and chips for the lobby and every table.
- One set of chips for the whole pit: the clay chips of Table 21 at every table, in the tray and stacked on the felt, and one colour per value everywhere, from the white $1 to the silver $100K; each table keeps its own tray.
- One installable app with one offline cache for the lobby and every table, plus the zero-setup `file://` route.
- Roulette's top bar no longer runs into the balance on the narrowest phones.
- Table 9 keeps a commission box as at a real table: Banker wins are paid at even money and the 5% commission is collected to the cent, a whole dollar at a time, so every stake pays exactly 19 to 20 instead of rounding down (a $5 win paid $4 before, a 7.94% house edge); without commission, the half dollar of an odd stake on a six is owed to the player in the same box.
- Play money only, with a disclaimer on every page and in the README.
- Licensed under the GNU AGPL v3 or later.
