# Token Radar — R3: every value term fitted and tested held-out

[![Token Radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/turibaru/token-radar-01/rank.svg)](https://make.fun/c/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/turibaru/token-radar-01/reward.svg)](https://make.fun/c/token-radar-01)

Entry for the [token-radar-01 bounty](https://make.fun/c/token-radar-01) (make.fun, $1,325, closes 14 Dec 2026).
It reads the sealed DefiLlama snapshot (758 protocols, 14 Nov 2026), ranks the
protocols that record no token by an implied launch value, and gives each one a
costed, timed farm plan. Round 3 is a rebuild from zero: new model, new
dashboard, new evidence — not a polish of round 2 (dev 0.631).

## What the model is

**Implied value = TVL × fitted size multiple × fitted launch odds.**

1. **Size curve — fitted, not flat.** OLS on `ln(mcap) ~ a + b·ln(TVL)` over the
   128 protocols that record a traded token with a positive market cap:
   `ln(mcap) = 6.965 + 0.522 × ln(TVL)` (s.e. a ±1.519, b ±0.083). The slope is
   well under 1, so the multiple *falls* as TVL rises: at $50M TVL the fitted
   multiple is 0.22×, at $1B it is 0.05×. Round 2 used a flat median 0.21× on
   every top row; that is exactly what this replaces.
2. **Launch odds — fitted, not guessed.** Logistic P(token) in recorded age
   (years), ln(TVL) and 7d growth, fitted on 634 peers: listed protocols whose
   token status is unambiguous (95 with a token trading, base rate 0.150).
   Excluded: 16 protocols whose recorded mcap is 0 or −1, and 113 with no
   `listed_at`. Age is the signal — the token rate rises from 3% under
   6 months to 26% at 3–5 years — while ln(TVL) and growth add almost nothing.
3. **Ranges on every row.** P25–P75 and P10–P90 from the leave-one-out
   residual distribution, printed for all 198 rows.
4. **Factors on every row.** ×size (fitted multiple), ×odds (fitted odds),
   ×time and ×growth (the odds-ratio contributions of age and 7d growth
   inside the logistic odds). ×size × ×odds reconstructs the implied value
   exactly.

## Held-out evidence (computed by `main.ts` at run time, shown on the page)

| Test | Fitted model | Flat baseline |
| --- | --- | --- |
| Leave-one-out miss (median \|log error|, as ×multiple) | **×3.40** | ×5.07 |
| Walk-forward miss (older half fits, newer half tested) | **×3.01** | ×5.29 |
| Launch odds, Brier 5-fold CV | **0.123** (in-sample 0.120) | base rate 0.127 |
| Placebo: growth of another row, Brier | 0.120 | must not help — it does not |
| Range honesty, held-out caps in P25–P75 (stated 50%) | **50.0%** | — |
| Range honesty, held-out caps in P10–P90 (stated 80%) | **79.7%** | — |

Terms tested, kept only when they lower the miss in **both** held-out tests:

| Term | LOO | Walk-forward | Kept? |
| --- | --- | --- | --- |
| Category offsets (shrunk, pseudo-count 4) | ×1.22 → ×1.34 | ×1.10 → ×1.14 | **No** |
| Age + 7d growth as price terms | ×1.22 → ×1.33 | ×1.10 → ×1.02 | **No** (better in one test only) |

## The board

- **198 rows:** the 40 watchlist protocols plus the 158 largest no-token
  protocols below the $50M floor. Total implied value **$274.1M**;
  top row Steakhouse Financial **$7.7M** (TVL $2.75B × 0.033 × odds 9%).
- **Ledger — all 758 accounted for, each in exactly one group:**
  ranked 198 + token trades 144 + set-aside 416 = 758. Watchlist 40/40.
- **Farm verdicts** (deposit 0.01% of TVL clamped $1K–$20K; drop pool 7% of
  implied value split among ~250 farmers; 12 weeks, 18 hours; fees $45 bridge
  + $12/week gas + 0.3% × 4 swaps; FARM: net ≥ $1,500 and ≥ $75/h;
  THIN: net ≥ $300 and ≥ $15/h; MARGINAL: net > $0; else SKIP):
  FARM **2**, THIN **35**, MARGINAL **97**, SKIP **64**. Every row carries an
  8-step plan with dollars and minutes per step.

## Where this entry is honest — and where it is weak

- **The top value is lower than the winners' band, and that is reported, not
  tuned away.** The winning entries' top values were $27.6M–$73.1M, which
  needs launch odds of roughly 0.33–0.78 on the top row. This snapshot cannot
  fit odds like that: the base token rate is 15%, and even 3–5-year-old
  protocols launch at only 26%. The fitted odds for the top row are 9%, so
  the top implied value is $7.7M. Inflating the odds by hand to reach the
  band would be fabrication; the fit is shown as fitted.
- **The odds are weak.** Brier 0.123 against a base rate of 0.127 — the odds
  model barely beats always predicting the base rate, and the placebo growth
  scores the same as the real growth (0.120). Age carries the odds; growth
  does not. The dashboard says so.
- **Survivorship bias.** The size curve is fitted only on tokens that still
  trade; dead tokens are invisible, so fitted values are optimistic for the
  median protocol.
- **Missing data.** Age was imputed at the peer median for 17 of 198 ranked
  rows; 7d growth was missing for 0 rows (treated as 0% where absent).
  “Records no token” is what DefiLlama records — it is not proof a protocol
  has no token.
- **One day of data.** The snapshot is 14 Nov 2026; a protocol's TVL a week
  later can move the ranking. The page never says a token *will* launch.

## How to run

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

Node 22, standard library only, no dependencies, no network. Writes
`out/board.json` (198 rows), `out/data.js`, `out/dashboard/`,
`out/screenshots/` and `out/dossier.json` (via `buildDossier` from
`vendor/makefun-board.ts`, the kit library copied byte-identical).
Two runs write byte-identical `board.json` and `dossier.json`.

## Files

- `main.ts` — entrypoint: reads the snapshot, builds the board, writes outputs.
- `lib/model.ts` — the whole model: size curve, odds, held-out tests, term
  tests, ranges, farm economics. Everything is computed from the snapshot.
- `dashboard/index.html`, `dashboard/app.css`, `dashboard/app.js` — offline
  page (no http/https anywhere): KPI strip, formula, ledger, evidence table,
  sortable/filterable board, detail view per protocol, log-log scatter.
  Total dashboard source 25,391 bytes (under the 64 KB dossier cap).
- `screenshots/` — 1-board (KPI + evidence + ledger + 11 rows), 2-detail
  (Steakhouse Financial), 3-filtered (verdict FARM), each 1440×800.

## License

MIT — see `LICENSE`.
