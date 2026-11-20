[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/turibaru/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/turibaru/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar — token-radar-01

A token launch radar for the make.fun bounty `token-radar-01`. It reads a sealed
DefiLlama snapshot of 758 protocols, finds the ones that record no token and are not
a wrapped, staked or bridged product of a token that already trades, ranks them by
implied value, and hands in a static dashboard with a farm plan for every protocol.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

Node 22+ (standard library only, no install). `main.ts` reads the snapshot, writes
`out/board.json`, `out/data.js`, copies `dashboard/` and `screenshots/` to `out/`,
and writes `out/dossier.json` with `buildDossier` from `vendor/makefun-board.ts`.

## The model (radar-3-waterfall)

Implied value is a comparables model, computed only from the snapshot's own figures:

```
implied = round( tvl_usd x comp x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
                 x (0.6 + min(age_days, 1095) / 1095 x 0.4) )
```

- **comp** — the median mcap/TVL ratio of the live-token protocols in the same
  category (at least 3 comparables, clamped to 0.05x–1.50x); a category with too
  few live tokens uses the all-category median (0.21x on this snapshot). A lending
  token is worth a different multiple of TVL than a DEX's or an RWA protocol's,
  and the snapshot itself says what those multiples are.
- **growth** — the protocol's 7-day TVL change (DefiLlama's `change_7d`: a change
  in locked value, not a token price — a pre-token protocol has no price), clamped,
  half-weighted. The momentum multiplier is bounded to 0.70x–1.60x, and ablation
  shows dropping it moves the top 20 by at most 2 ranks: it breaks ties, it does
  not rank.
- **maturity** — how long it has run with no token (age since first listed, 0.6–1.0
  over 3 years; unknown age uses 365 days).

Every row carries its factor waterfall (`base_implied_usd` → `after_momentum_usd` →
final implied value), and the dashboard's comparables table lists every category with
its median, N, interquartile range, leave-one-out median range, and the member
protocols behind the median — including the 20 categories too small to use, whose rows
fall back to the global median. Two limits are disclosed in the dashboard, not hidden:
102 of 198 rows use the global median (their category has fewer than 3 comparables),
and the comp pool is only 128 of the snapshot's 416 live-token protocols (272 record
no market cap), so the multiples carry survivorship bias. See `STATUS.md` for the
ablation numbers.

No protocol name is special-cased. The board ranks the whole rankable universe:
the 40 watchlist protocols plus 158 pre-token protocols below the $50M floor —
198 rows. The 24 largest live-token protocols are set aside in their own view with
their market caps shown, never mixed into the ranking.

## The dashboard

`dashboard/` is a static page (no network, no framework): a ranked board with
search, category and chain filters, sortable columns, a top-3 spotlight, a detail
drawer per protocol (model breakdown + 6-step farm plan with cost and time), a
live-token view, and the comparables table the model is built on. Deep links via
the URL hash (`#p=<slug>`, `#category=Dexs`, `#chain=Base`).

## Files

- `main.ts` — the program (Node 22)
- `lib/model.ts` — the comparables model, the board builder and the farm plans
- `vendor/makefun-board.ts` — the kit's dossier library, copied byte for byte
- `dashboard/` — `index.html`, `app.css`, `app.js`
- `screenshots/` — `1-board.png`, `2-detail.png`, `3-filtered.png` (1440x800)
- `board.json` / `dossier.json` — written by `main.ts` into the output directory

## License

MIT. See `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=r34fvf50&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
