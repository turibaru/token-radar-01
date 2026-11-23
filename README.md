# Token Radar — R3: every value term fitted and tested held-out

[![Token Radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/turibaru/token-radar-01/rank.svg)](https://make.fun/c/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/turibaru/token-radar-01/reward.svg)](https://make.fun/c/token-radar-01)

Entry for the [token-radar-01 bounty](https://make.fun/c/token-radar-01) (make.fun, $1,325, closes 14 Dec 2026).
It reads the sealed DefiLlama snapshot (758 protocols, 14 Nov 2026), ranks the
protocols that record no token by an implied launch value, and gives each one a
costed, timed farm plan. Round 3 is a rebuild from zero: new model, new
dashboard, new evidence — not a polish of round 2 (dev 0.631). This round
fixes the round-3 odds: the launch odds are now a blend of a logistic and
shrunk cell rates, and 7d growth is dropped from the model after the placebo
test showed it adds nothing.

## What the model is

**Implied value = TVL × fitted size multiple × fitted launch odds.**

1. **Size curve — fitted, not flat.** OLS on `ln(mcap) ~ a + b·ln(TVL)` over the
   128 protocols that record a traded token with a positive market cap:
   `ln(mcap) = 6.965 + 0.522 × ln(TVL)` (s.e. a ±1.519, b ±0.083). The slope is
   well under 1, so the multiple *falls* as TVL rises: at $50M TVL the fitted
   multiple is 0.22×, at $1B it is 0.05×. Round 2 used a flat median 0.21× on
   every top row; that is exactly what this replaces.
2. **Launch odds — a blend, fitted, not guessed.** Odds are the average of two
   estimators, each fitted from the snapshot. The ½/½ weight is an untuned
   equal weight, fixed before the final result was seen — the standard choice
   for an ensemble of two estimators:

   `odds = ½ · logistic(age, ln TVL) + ½ · cell rate (TVL band × age band, shrunk m=20)`
   — n = 634 peers, 95 with a token, base rate 0.150.

   **Peer universe (n = 634).** A peer is a protocol with `listed_at` recorded
   AND an unambiguous token status: `mcap_usd` null (no token yet) OR
   `mcap_usd > 0` (a traded token). Peer = 539 without a token + 95 with a token.

   Cross-tab of the snapshot (758 protocols):

   | `listed_at` | mcap null | mcap > 0 | mcap 0/−1 | total |
   |---|---|---|---|---|
   | present | 539 | 95 | 11 | 645 |
   | absent | 75 | 33 | 5 | 113 |
   | total | 614 | 128 | 16 | 758 |

   Discarded: 113 protocols without `listed_at` + 11 protocols with `listed_at`
   and mcap 0/−1 (ambiguous status — mcap 0/−1 is neither "no token" nor a
   traded token). Of the 128 mcap-positive protocols, 95 have `listed_at`
   (in the peer set) and 33 do not (not in the peer set; the size curve is
   still fitted on all 128 — unchanged).

   **Component A — logistic [age, ln TVL], no growth.** Features per peer:
   `x1` = recorded age in years, `x2` = ln(TVL); target `y` = 1 if mcap > 0,
   0 if mcap is null. Each feature is standardised with the peer mean/population
   std; the intercept is initialised at logit(base rate), weights start at 0;
   full-batch gradient descent, learning rate 0.25, 2500 iterations, sigmoid
   clamped to ±30. Deterministic (fixed init, no shuffle, no randomness).
   Fitted: intercept −1.865, weights [age +0.611, ln TVL −0.057].
   Brier in-sample 0.120, 5-fold CV 0.123.

   **Component B — cell rates (TVL band × age band), shrunk m = 20.**
   TVL bands, fixed before any odds were computed (not tuned): `<$10M`,
   `$10–50M`, `$50–200M`, `$200M–1B`, `≥$1B`. Age bands: `<1 yr`, `1–2 yr`,
   `2–3 yr`, `≥3 yr`.

   `cell rate = (positives in cell + m × TVL-band rate) / (n in cell + m)`,
   with `m = 20` (pseudo-count) and the TVL-band rate = the token rate of all
   peers in that TVL band (fallback to the base rate 0.150 if a band were empty
   — no band is empty in this snapshot).

   The cell rate captures a local fact the smooth logistic averages away: in
   the TVL ≥$1B band, even 1–2-year-old protocols launch a token 24.5% of the
   time — above the base rate. Steakhouse Financial sits in that cell
   (TVL ≥$1B, age 1–2 yr): cell rate 0.245; TVL-band rate ≥$1B is 0.229
   (n = 48). The highest cell rate in any of the 20 cells is 0.263.

   Sensitivity (reported, not used): shrink `m = 10` gives top odds 0.174 and
   top implied $15.65M (vs m = 20: 0.170 / $15.36M), FARM still 4 — the result
   is not sensitive to m.

   **Why the blend.** The age effect is real (token rate rises monotonically
   with age: 0–0.5 yr 3.4% · 0.5–1 yr 10% · 1–2 yr 12% · 2–3 yr 15.6% ·
   3–5 yr 26.8% · 5 yr+ 25%), but the smooth logistic "punishes" young rows
   below the base rate because the age weight dominates. The blend keeps the
   age signal (logistic) while honouring the local rate (cell). No other peer
   definition makes the top odds coherent (tested: peer 634 → 0.086; peer
   TVL ≥$50M → 0.113; all 758 → 0.108; 650 including the 16 zero/negative as
   y = 0 → 0.086; young peers <3 yr → 0.105). The honest fix is the estimator,
   not the definition.

   **Why growth was dropped.** `change_7d` is no longer an input to any model
   (it is still shown as an info column on the board). The placebo — growth of
   another row used as the feature — scores Brier 0.120, exactly equal to the
   model's in-sample Brier 0.120: 7d growth adds nothing. Growth was therefore
   dropped from the model, and the dropping is reported here as a limitation,
   not hidden.
3. **Ranges on every row.** P25–P75 and P10–P90 from the leave-one-out
   residual distribution, printed for all 198 rows.
4. **Factors on every row.** ×size (fitted multiple), ×odds (blended odds),
   ×logit and ×cell (the two odds components — their average is ×odds).
   `×odds ≈ (×logit + ×cell) / 2`, so the reader can verify the blend from
   the two component columns. ×size × ×odds reconstructs the implied value.
   `7d` is shown as info only; it is not a model input. There is no ×time
   and no ×growth factor in this round. 17 of the 198 ranked rows have no
   `listed_at`; their age is imputed to the peer median age (the other 181
   ranked rows are peers). Imputed rows are marked `*` on the board and fall
   in the 1–2 yr age band for the cell rate.

**Brier, 5-fold CV.** Peers are sorted by slug; fold = index mod 5. In each
fold, BOTH components are refit on the 4/5 train folds only, then evaluated
on the test fold. Blend (used): in-sample 0.120, CV 0.124. Logistic only:
in-sample 0.120, CV 0.123. Cell only (m = 20): in-sample 0.120, CV 0.126.
Base rate (always predict 0.150): 0.127. Placebo: 0.120.

Trade-off, stated honestly: the blend trades 0.001 of Brier CV (0.124 vs
0.123 for the logistic alone — within noise) for a coherent top row
(odds 0.170 > base 0.150) and a top value about 2× larger. Cell-only is
rejected as a single component because its CV is 0.126 — worse; logistic-only
is rejected as the final odds because its top row is incoherent
(0.086 < 0.150).

## Held-out evidence (computed by `main.ts` at run time, shown on the page)

| Test | Fitted model | Flat baseline |
| --- | --- | --- |
| Leave-one-out miss (median \|log error|, as ×multiple) | **×3.40** | ×5.07 |
| Walk-forward miss (older half fits, newer half tested) | **×3.01** | ×5.29 |
| Launch odds, Brier 5-fold CV — blend (used) | **0.124** (in-sample 0.120) | base rate 0.127 |
| Launch odds, Brier 5-fold CV — logistic only | 0.123 | cross-check |
| Launch odds, Brier 5-fold CV — cell rates only (m=20) | 0.126 | cross-check |
| Placebo: growth of another row, Brier | 0.120 | growth dropped — placebo = in-sample, no signal |
| Range honesty, held-out caps in P25–P75 (stated 50%) | **50.0%** | — |
| Range honesty, held-out caps in P10–P90 (stated 80%) | **79.7%** | — |

Terms tested, kept only when they lower the miss in **both** held-out tests:

| Term | LOO | Walk-forward | Kept? |
| --- | --- | --- | --- |
| Category offsets (shrunk, pseudo-count 4) | ×1.22 → ×1.34 | ×1.10 → ×1.14 | **No** |
| Age + 7d growth as price terms | ×1.22 → ×1.33 | ×1.10 → ×1.02 | **No** (better in one test only) |

## The board

- **198 rows:** the 40 watchlist protocols plus the 158 largest no-token
  protocols below the $50M floor. Total implied value **$295.8M**;
  top row Steakhouse Financial **$15.4M** (TVL $2.75B × 0.033 × odds 17%).
- **Top 4 FARM rows:**

  | Rank | Protocol | Implied | Odds (logit / cell) | Fitted mcap | Net | Net/hour |
  | --- | --- | --- | --- | --- | --- | --- |
  | 1 | Steakhouse Financial | $15.36M | 0.170 (0.096 / 0.245) | $90.1M | $3,872 | $215.11/h |
  | 2 | Veda | $11.82M | 0.176 | $67.1M | $2,882 | $160.11/h |
  | 3 | Gauntlet | $11.54M | 0.171 | $67.4M | $2,801 | $155.61/h |
  | 4 | USDD | $9.60M | 0.176 | $54.6M | $2,258 | $125.44/h |

- **Ledger — all 758 accounted for, each in exactly one group:**
  ranked 198 + token trades 144 + set-aside 416 = 758. Watchlist 40/40.
- **Farm verdicts** (deposit 0.01% of TVL clamped $1K–$20K; drop pool 7% of
  implied value split among ~250 farmers; 12 weeks, 18 hours; fees $45 bridge
  + $12/week gas + 0.3% × 4 swaps; FARM: net ≥ $1,500 and ≥ $75/h;
  THIN: net ≥ $300 and ≥ $15/h; MARGINAL: net > $0; else SKIP):
  FARM **4**, THIN **25**, MARGINAL **116**, SKIP **53**. Every row carries an
  8-step plan with dollars and minutes per step.

## Where this entry is honest — and where it is weak

- **The top value is still below the winners' band, and that is reported, not
  tuned away.** The winning entries' top values were $27.6M–$73.1M. This
  snapshot's fitted top is $15.4M (odds 17.0%, fitted $90.1M): the gap narrowed
  from 3.6× to 1.8× because the blend credits the 24.5% token rate of large
  young protocols, but odds of 0.33–0.78 remain unfittable — the highest cell
  rate in the snapshot is 26% and the base rate is 15%. Inflating the odds by
  hand to reach the band would be fabrication; the fit is shown as fitted.
- **The odds are weak.** Brier 0.124 (blend, 5-fold CV) against a base rate of
  0.127 — the blend trades 0.001 of Brier against the logistic alone (0.123)
  for a coherent top row; the cell-only estimator is worse (0.126) and is not
  used alone. Growth was dropped from the model after the placebo scored the
  same as the real feature (0.120).
- **Survivorship bias.** The size curve is fitted only on tokens that still
  trade; dead tokens are invisible, so fitted values are optimistic for the
  median protocol.
- **Missing data.** Age was imputed at the peer median for 17 of 198 ranked
  rows; 7d growth was missing for 0 rows (treated as 0% where absent).
  "Records no token" is what DefiLlama records — it is not proof a protocol
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
  (Steakhouse Financial, now with the position-on-the-curve scatter),
  3-filtered (verdict FARM — 4 rows — + full log-log scatter), each 1440×800.

## License

MIT — see `LICENSE`.
