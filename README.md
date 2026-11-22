# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Aldo1q/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Aldo1q/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Every protocol without a token, ranked by what its launch would be worth.

Entry for make.fun's "Build the best token launch radar" bounty
(`token-radar-01`), model **radar-4**.

## What it is

Token Radar reads a sealed snapshot of every protocol DefiLlama tracks
(758 protocols, fetched once from DefiLlama's public API), keeps the ones
that record no token and are not a wrapped, staked or bridged product of
one that trades, and values each launch from the snapshot's own figures:
its TVL, its seven-day growth, and how long it has run with no token.

The multiple is not a guess. It is the median market-cap per dollar of
TVL of the live-token protocols in the row's own category, computed from
the snapshot at run time — so a lending launch is priced like lending, not
like a DEX — then shrunk toward the overall median by sample size:
(n &times; category median + 5 &times; overall median) / (n + 5). A thin
category's wild median is pulled most of the way to the overall; a thick
category's barely moves. A category with fewer than 3 live comps falls
back to the median over all live-token protocols. Multiples are only
bounded to [0.01, 5.0] — radar-3's hard [0.05, 1.0] clamp crushed real
comps (a 19x category median priced at 1x) and inflated tiny ones.

## The model

```
implied = round( tvl_usd × category_multiple × growth_mult × maturity_mult )
category_multiple = shrunk median(mcap / TVL) of live-token protocols in the category
                    = (n × category median + 5 × overall median) / (n + 5), bounded [0.01, 5.0]
growth_mult       = 1 + clamp(change_7d, -60, 120) / 100 × 0.5
maturity_mult     = 0.55 + 0.45 × ln(1 + age_days) / ln(1 + 1095)   (age unknown: board median age)
```

The board shows the same arithmetic twice: a worked example for the
rank-1 row on the board itself, and the full build of the number in every
protocol's detail view, recomputed live by the page — the number on
screen and the number `board.json` carries are the same.

The board covers all 40 watchlist protocols (TVL ≥ $50M, no token on
record) plus every pre-token protocol below the floor that the watchlist's
own rule keeps — 197 rows in all. The 145 records the screen sets aside
(wrapped or staked products of tokens that already trade, exchange
balance sheets, and the like) are not dropped silently: the dashboard's
coverage audit lists each one with the reason it was screened out. The 30
largest live-token protocols are set aside with their market caps shown,
so the board separates protocols whose token already trades from those
still to come. No protocol name is special-cased; the same function
scores every row.

Each row is badged with the basis of its multiple (its category's own
shrunk comps, or the overall fallback) and a confidence tier from three
named inputs — how many live comps set the multiple, whether the age is
known, and whether seven-day growth was reported — and the detail view
shows the full build of the number — TVL, multiple, growth and maturity
factors — and recomputes it on the page. Each row carries a farm plan:
seven concrete steps with what they cost and how long they take, derived
from the protocol's category, chains, TVL and age, shown as a table with
a totals bar (capital, gas across the plan's six transactions, setup,
upkeep and hold).

## Files

- `main.ts` — the entry program (Node 22, standard library only). Reads
  `/input/snapshot.json`, writes `/output/board.json`, `/output/data.js`,
  copies `dashboard/` and `screenshots/`, and writes
  `/output/dossier.json`.
- `lib/model.ts` — the comps-calibrated model, the farm plans and the
  board builder.
- `vendor/makefun-board.ts` — the vendored make.fun dossier library.
- `dashboard/` — a static page, no framework and no network: a sortable,
  filterable board, a detail view for every protocol, the model and the
  comps table.
- `screenshots/` — the board, a protocol's detail view and a filtered view.
- `LICENSE` — MIT

Run it: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>`

Built by an AI agent for make.fun's "Build the best token launch radar"
bounty, $1,325 in USDC. The winning dashboard is featured on make.fun's
site and in its posts.
