// token-radar-01 R3 — value model, fitted from the snapshot alone.
// Written fresh for round 3 (round3-fitted). No numbers are copied from
// any other entry: every coefficient below is computed at runtime from
// /input/snapshot.json. Node 22, standard library only.
//
// Model in one paragraph: (1) a size curve, ln(mcap) ~ a + b*ln(TVL),
// fitted by OLS on the protocols that record a traded token with a
// positive market cap; (2) launch odds, a logistic P(token) in recorded
// age, ln(TVL) and 7d growth, fitted on the peer set defined below;
// (3) implied value = fitted mcap x odds. Both parts are tested
// held-out (leave-one-out and walk-forward) inside this file, and the
// tests decide which extra terms survive: a term is kept only when it
// lowers the typical miss in BOTH held-out tests.

export interface Proto {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source?: string;
  floor_usd: number;
  protocols: Proto[];
  watchlist: string[];
}

// ---------------------------------------------------------------- helpers

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  return n % 2 === 1 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

/** Quantile with linear interpolation (type-7 style). q in [0, 1]. */
export function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const pos = q * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo]!;
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function sigmoid(z: number): number {
  const c = clamp(z, -30, 30);
  return 1 / (1 + Math.exp(-c));
}

/** Years from a listed_at date (YYYY-MM-DD) to the snapshot date. */
export function ageYears(listedAt: string | null, asOf: string): number | null {
  if (!listedAt) return null;
  const t0 = Date.parse(listedAt.slice(0, 10) + 'T00:00:00Z');
  const t1 = Date.parse(asOf.slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  return (t1 - t0) / (365.25 * 24 * 3600 * 1000);
}

// ------------------------------------------------------------- linear fits

export interface Ols1 { a: number; b: number; n: number }

export function ols1(xs: number[], ys: number[]): Ols1 {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return { a: my - b * mx, b, n };
}

/** OLS with several features. rows: [1, x1, x2, ...]. Solves the normal
 *  equations by Gaussian elimination with partial pivoting. */
export function olsMulti(rows: number[][], ys: number[]): number[] {
  const k = rows[0]!.length;
  const a: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const v: number[] = new Array<number>(k).fill(0);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    for (let j = 0; j < k; j++) {
      v[j] += r[j]! * ys[i]!;
      for (let m = 0; m < k; m++) a[j]![m] += r[j]! * r[m]!;
    }
  }
  // tiny ridge (1e-8) so a singular design still solves deterministically
  for (let j = 0; j < k; j++) a[j]![j] += 1e-8;
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[piv]![col]!)) piv = r;
    [a[col], a[piv]] = [a[piv]!, a[col]!];
    [v[col], v[piv]] = [v[piv]!, v[col]!];
    const d = a[col]![col]!;
    for (let r = col + 1; r < k; r++) {
      const f = a[r]![col]! / d;
      for (let c = col; c < k; c++) a[r]![c] -= f * a[col]![c]!;
      v[r] -= f * v[col]!;
    }
  }
  const beta = new Array<number>(k).fill(0);
  for (let r = k - 1; r >= 0; r--) {
    let s = v[r]!;
    for (let c = r + 1; c < k; c++) s -= a[r]![c]! * beta[c]!;
    beta[r] = s / a[r]![r]!;
  }
  return beta;
}

function predictMulti(beta: number[], row: number[]): number {
  return beta.reduce((s, b, i) => s + b * row[i]!, 0);
}

// ------------------------------------------------------------ traded set

/** Protocols that record a traded token: a positive recorded mcap.
 *  The snapshot also carries 16 protocols whose recorded mcap is 0 or
 *  -1 (a token recorded at zero value); they are excluded here because
 *  ln(0) is undefined and a -1 mcap is not a market value. */
export function tradedTokens(ps: Proto[]): Proto[] {
  return ps.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0);
}

/** Peer set for the odds fit. A peer is a protocol whose token status is
 *  unambiguous AND whose recorded age is known: listed_at is present, and
 *  either no token is recorded (mcap_usd null) or a token trades with a
 *  positive mcap. Excluded: the 16 zero/negative-mcap records and the
 *  protocols with no listed_at. Outcome y = 1 when a token trades. */
export function oddsPeers(ps: Proto[]): Proto[] {
  return ps.filter(
    (p) => p.listed_at !== null && (p.mcap_usd === null || p.mcap_usd > 0),
  );
}

export function hasToken(p: Proto): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0;
}

// ------------------------------------------------------------- size curve

export interface SizeFit {
  a: number;
  b: number;
  n: number;
  /** Median |log error| of the fitted curve, leave-one-out. */
  looMedianAbsLog: number;
  looMultiple: number;
  /** Same, walk-forward (older half fits, newer half tested). */
  wfMedianAbsLog: number;
  wfMultiple: number;
  /** Flat-multiple baseline (median mcap/TVL) on the same splits. */
  flatLooMultiple: number;
  flatWfMultiple: number;
  /** LOO residuals (signed log errors) — the source of every row range. */
  looResiduals: number[];
  q25: number;
  q75: number;
  q10: number;
  q90: number;
  /** Share of held-out caps inside the printed P25-P75 / P10-P90 bands. */
  rangeHold50: number;
  rangeHold80: number;
  /** Bootstrap standard errors (200 resamples, seeded LCG — deterministic). */
  aSe: number;
  bSe: number;
}

function looErrors(
  data: Proto[],
  predict: (train: Proto[], p: Proto) => number,
): number[] {
  const errs: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const train = data.slice(0, i).concat(data.slice(i + 1));
    const p = data[i]!;
    errs.push(Math.log(p.mcap_usd!) - predict(train, p));
  }
  return errs;
}

function wfErrors(
  data: Proto[],
  predict: (train: Proto[], p: Proto) => number,
): number[] {
  const dated = data.filter((p) => p.listed_at !== null).sort((x, y) => (x.listed_at! < y.listed_at! ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const train = dated.slice(0, half);
  const test = dated.slice(half);
  return test.map((p) => Math.log(p.mcap_usd!) - predict(train, p));
}

function flatPredict(train: Proto[], p: Proto): number {
  const m = median(train.map((t) => t.mcap_usd! / t.tvl_usd));
  return Math.log(m * p.tvl_usd);
}

function curvePredict(fit: Ols1, p: Proto): number {
  return fit.a + fit.b * Math.log(p.tvl_usd);
}

function fitCurve(data: Proto[]): Ols1 {
  return ols1(
    data.map((p) => Math.log(p.tvl_usd)),
    data.map((p) => Math.log(p.mcap_usd!)),
  );
}

export function fitSizeCurve(traded: Proto[]): SizeFit {
  const fit = fitCurve(traded);
  const loo = looErrors(traded, (tr, p) => curvePredict(fitCurve(tr), p));
  const wf = wfErrors(traded, (tr, p) => curvePredict(fitCurve(tr), p));
  const looFlat = looErrors(traded, flatPredict);
  const wfFlat = wfErrors(traded, flatPredict);
  const q25 = quantile(loo, 0.25);
  const q75 = quantile(loo, 0.75);
  const q10 = quantile(loo, 0.1);
  const q90 = quantile(loo, 0.9);
  // Range honesty: a held-out cap "holds" when the actual mcap lands
  // inside the band the printed quantiles imply around the LOO prediction.
  let hold50 = 0;
  let hold80 = 0;
  for (let i = 0; i < traded.length; i++) {
    const train = traded.slice(0, i).concat(traded.slice(i + 1));
    const pred = curvePredict(fitCurve(train), traded[i]!);
    const actual = Math.log(traded[i]!.mcap_usd!);
    if (actual >= pred + q25 && actual <= pred + q75) hold50++;
    if (actual >= pred + q10 && actual <= pred + q90) hold80++;
  }
  // Bootstrap s.e. with a fixed-seed LCG (deterministic across runs).
  let seed = 20261114;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const bsA: number[] = [];
  const bsB: number[] = [];
  for (let r = 0; r < 200; r++) {
    const sample: Proto[] = [];
    for (let i = 0; i < traded.length; i++) sample.push(traded[Math.floor(rnd() * traded.length)]!);
    const f = fitCurve(sample);
    bsA.push(f.a);
    bsB.push(f.b);
  }
  const sd = (xs: number[]): number => {
    const m = xs.reduce((s, v) => s + v, 0) / xs.length;
    return Math.sqrt(xs.reduce((s, v) => s + (v - m) * (v - m), 0) / xs.length);
  };
  return {
    a: fit.a,
    b: fit.b,
    n: traded.length,
    looMedianAbsLog: median(loo.map(Math.abs)),
    looMultiple: Math.exp(median(loo.map(Math.abs))),
    wfMedianAbsLog: median(wf.map(Math.abs)),
    wfMultiple: Math.exp(median(wf.map(Math.abs))),
    flatLooMultiple: Math.exp(median(looFlat.map(Math.abs))),
    flatWfMultiple: Math.exp(median(wfFlat.map(Math.abs))),
    looResiduals: loo,
    q25,
    q75,
    q10,
    q90,
    rangeHold50: hold50 / traded.length,
    rangeHold80: hold80 / traded.length,
    aSe: sd(bsA),
    bSe: sd(bsB),
  };
}

// ------------------------------------------- term tests (keep / not kept)

// A candidate term is KEPT only when it lowers the typical miss
// (median |log error|) in BOTH held-out tests, LOO and walk-forward.
// Everything tested is reported, kept or not, in the dashboard.

export interface TermTest {
  term: string;
  looBase: number;
  looWith: number;
  wfBase: number;
  wfWith: number;
  kept: boolean;
}

function medianAbs(errs: number[]): number {
  return median(errs.map(Math.abs));
}

/** Category offsets, shrunk toward zero: offset_c = sum(resid) / (n_c + 4).
 *  The +4 is a fixed pseudo-count, not tuned to the data. */
function categoryOffsets(train: Proto[], base: Ols1): Map<string, number> {
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const p of train) {
    const r = Math.log(p.mcap_usd!) - curvePredict(base, p);
    const c = p.category ?? '(none)';
    sums.set(c, (sums.get(c) ?? 0) + r);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const out = new Map<string, number>();
  for (const [c, s] of sums) out.set(c, s / ((counts.get(c) ?? 0) + 4));
  return out;
}

function testCategoryTerm(traded: Proto[]): TermTest {
  const base = (tr: Proto[], p: Proto): number => curvePredict(fitCurve(tr), p);
  const withCat = (tr: Proto[], p: Proto): number => {
    const f = fitCurve(tr);
    const off = categoryOffsets(tr, f);
    return curvePredict(f, p) + (off.get(p.category ?? '(none)') ?? 0);
  };
  const looBase = medianAbs(looErrors(traded, base));
  const looWith = medianAbs(looErrors(traded, withCat));
  const wfBase = medianAbs(wfErrors(traded, base));
  const wfWith = medianAbs(wfErrors(traded, withCat));
  return {
    term: 'category offsets (shrunk, pseudo-count 4)',
    looBase,
    looWith,
    wfBase,
    wfWith,
    kept: looWith < looBase && wfWith < wfBase,
  };
}

/** Extra price terms: recorded age and 7d growth added to ln(mcap). */
function priceRow(p: Proto, asOf: string, medAge: number): number[] {
  const age = ageYears(p.listed_at, asOf) ?? medAge;
  const g = clamp(p.change_7d ?? 0, -50, 50) / 100;
  return [1, Math.log(p.tvl_usd), age, g];
}

function testPriceTerms(traded: Proto[], asOf: string, medAge: number): TermTest {
  const base = (tr: Proto[], p: Proto): number => curvePredict(fitCurve(tr), p);
  const withTerms = (tr: Proto[], p: Proto): number => {
    const beta = olsMulti(tr.map((t) => priceRow(t, asOf, medAge)), tr.map((t) => Math.log(t.mcap_usd!)));
    return predictMulti(beta, priceRow(p, asOf, medAge));
  };
  const looBase = medianAbs(looErrors(traded, base));
  const looWith = medianAbs(looErrors(traded, withTerms));
  const wfBase = medianAbs(wfErrors(traded, base));
  const wfWith = medianAbs(wfErrors(traded, withTerms));
  return {
    term: 'age + 7d growth as price terms',
    looBase,
    looWith,
    wfBase,
    wfWith,
    kept: looWith < looBase && wfWith < wfBase,
  };
}

// ------------------------------------------------------------ token odds

export interface OddsFit {
  /** Logistic coefficients on STANDARDISED features [age, lnTVL, growth]. */
  weights: number[];
  means: number[];
  sds: number[];
  intercept: number;
  n: number;
  positives: number;
  baseRate: number;
  brier: number;
  baseBrier: number;
  cvBrier: number;
  placeboBrier: number;
  medianAge: number;
}

function oddsFeatures(p: Proto, asOf: string, medAge: number): number[] {
  const age = ageYears(p.listed_at, asOf) ?? medAge;
  return [age, Math.log(p.tvl_usd), clamp(p.change_7d ?? 0, -50, 50) / 100];
}

function standardise(rows: number[][]): { means: number[]; sds: number[] } {
  const k = rows[0]!.length;
  const means = new Array<number>(k).fill(0);
  const sds = new Array<number>(k).fill(0);
  for (let j = 0; j < k; j++) {
    means[j] = rows.reduce((s, r) => s + r[j]!, 0) / rows.length;
    const v = rows.reduce((s, r) => s + (r[j]! - means[j]!) ** 2, 0) / rows.length;
    sds[j] = Math.sqrt(v) || 1;
  }
  return { means, sds };
}

function fitLogistic(
  xs: number[][],
  ys: number[],
  iters = 2500,
  lr = 0.25,
): { intercept: number; weights: number[]; means: number[]; sds: number[] } {
  const { means, sds } = standardise(xs);
  const std = xs.map((r) => r.map((v, j) => (v - means[j]!) / sds[j]!));
  const base = ys.reduce((s, v) => s + v, 0) / ys.length;
  let intercept = Math.log(base / (1 - base));
  const w = new Array<number>(xs[0]!.length).fill(0);
  for (let it = 0; it < iters; it++) {
    let gi = 0;
    const gw = new Array<number>(w.length).fill(0);
    for (let i = 0; i < std.length; i++) {
      const z = intercept + std[i]!.reduce((s, v, j) => s + w[j]! * v, 0);
      const pr = sigmoid(z);
      const d = pr - ys[i]!;
      gi += d;
      for (let j = 0; j < w.length; j++) gw[j] += d * std[i]![j]!;
    }
    intercept -= (lr * gi) / std.length;
    for (let j = 0; j < w.length; j++) w[j] -= (lr * gw[j]!) / std.length;
  }
  return { intercept, weights: w, means, sds };
}

function oddsProb(
  fit: { intercept: number; weights: number[]; means: number[]; sds: number[] },
  feats: number[],
): number {
  const z =
    fit.intercept +
    feats.reduce((s, v, j) => s + fit.weights[j]! * ((v - fit.means[j]!) / fit.sds[j]!), 0);
  return sigmoid(z);
}

export function fitOdds(peers: Proto[], asOf: string, medAge: number): OddsFit {
  const xs = peers.map((p) => oddsFeatures(p, asOf, medAge));
  const ys = peers.map((p) => (hasToken(p) ? 1 : 0));
  const fit = fitLogistic(xs, ys);
  const probs = peers.map((p, i) => oddsProb(fit, xs[i]!));
  const brier = probs.reduce((s, pr, i) => s + (pr - ys[i]!) ** 2, 0) / ys.length;
  const baseRate = ys.reduce((s, v) => s + v, 0) / ys.length;
  const baseBrier = baseRate * (1 - baseRate);
  // 5-fold cross-validated Brier, folds by slug order (deterministic).
  const order = peers.map((p, i) => i).sort((a, b) => (peers[a]!.slug < peers[b]!.slug ? -1 : 1));
  let cvSum = 0;
  for (let fold = 0; fold < 5; fold++) {
    const testIdx = order.filter((_, k) => k % 5 === fold);
    const trainIdx = order.filter((_, k) => k % 5 !== fold);
    const f = fitLogistic(trainIdx.map((i) => xs[i]!), trainIdx.map((i) => ys[i]!));
    for (const i of testIdx) cvSum += (oddsProb(f, xs[i]!) - ys[i]!) ** 2;
  }
  const cvBrier = cvSum / peers.length;
  // Placebo control: each row's growth replaced by the NEXT row's growth
  // in slug order. A real growth signal must beat this shuffled version;
  // the placebo must not help.
  const sorted = [...peers].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const placeboGrowth = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    const nxt = sorted[(i + 1) % sorted.length]!;
    placeboGrowth.set(sorted[i]!.slug, clamp(nxt.change_7d ?? 0, -50, 50) / 100);
  }
  const xsPlacebo = peers.map((p) => {
    const f = oddsFeatures(p, asOf, medAge);
    f[2] = placeboGrowth.get(p.slug)!;
    return f;
  });
  const fitP = fitLogistic(xsPlacebo, ys);
  const placeboBrier =
    peers.reduce((s, p, i) => s + (oddsProb(fitP, xsPlacebo[i]!) - ys[i]!) ** 2, 0) / ys.length;
  return {
    weights: fit.weights,
    means: fit.means,
    sds: fit.sds,
    intercept: fit.intercept,
    n: peers.length,
    positives: ys.reduce((s, v) => s + v, 0),
    baseRate,
    brier,
    baseBrier,
    cvBrier,
    placeboBrier,
    medianAge: medAge,
  };
}

export function tokenOdds(fit: OddsFit, p: Proto, asOf: string): number {
  const feats = oddsFeatures(p, asOf, fit.medianAge);
  return oddsProb(fit, feats);
}

/** Odds-ratio contributions of age and growth inside the logistic odds:
 *  exp of each term's standardised logit contribution. They explain the
 *  odds; xsize x odds reconstructs the implied value exactly. */
export function oddsFactors(
  fit: OddsFit,
  p: Proto,
  asOf: string,
): { timeFactor: number; growthFactor: number } {
  const feats = oddsFeatures(p, asOf, fit.medianAge);
  const timeFactor = Math.exp(
    fit.weights[0]! * ((feats[0]! - fit.means[0]!) / fit.sds[0]!),
  );
  const growthFactor = Math.exp(
    fit.weights[2]! * ((feats[2]! - fit.means[2]!) / fit.sds[2]!),
  );
  return { timeFactor, growthFactor };
}

// ---------------------------------------------------------- farm economics

export type Verdict = 'FARM' | 'THIN' | 'MARGINAL' | 'SKIP';

export interface FarmPlan {
  depositUsd: number;
  expectedDropUsd: number;
  feesUsd: number;
  netUsd: number;
  hoursTotal: number;
  netPerHourUsd: number;
  verdict: Verdict;
  steps: string[];
}

export const FARM_ASSUMPTIONS =
  'Deposit 0.01% of TVL, clamped to $1K–$20K. Drop pool 7% of implied value, split among ~250 active farmers; ' +
  '12-week horizon, 1.5 h/week (18 h); fees $45 bridge + $12/week gas + 0.3% x 4 swaps. ' +
  'FARM: net >= $1,500 and >= $75/h. THIN: net >= $300 and >= $15/h. ' +
  'MARGINAL: net > $0. Else SKIP.';

export function farmPlan(p: Proto, impliedUsd: number): FarmPlan {
  const depositUsd = Math.round(clamp(p.tvl_usd * 0.0001, 1000, 20000));
  const expectedDropUsd = Math.round((0.07 * impliedUsd) / 250);
  const feesUsd = Math.round(45 + 12 * 12 + 0.003 * depositUsd * 4);
  const hoursTotal = 18;
  const netUsd = expectedDropUsd - feesUsd;
  const netPerHourUsd = Math.round((netUsd / hoursTotal) * 100) / 100;
  let verdict: Verdict;
  if (netUsd >= 1500 && netPerHourUsd >= 75) verdict = 'FARM';
  else if (netUsd >= 300 && netPerHourUsd >= 15) verdict = 'THIN';
  else if (netUsd > 0) verdict = 'MARGINAL';
  else verdict = 'SKIP';
  const dep = depositUsd.toLocaleString('en-US');
  const chain = p.chains[0] ?? 'its main chain';
  const cat = p.category ?? 'DeFi';
  const verb =
    cat === 'Lending'
      ? 'Supply assets and borrow a small amount against them each week'
      : cat === 'Dexs'
        ? 'Swap a small amount and add to a liquidity pool each week'
        : cat === 'Yield' || cat === 'Yield Aggregator'
          ? 'Stake into the vault and compound the yield each week'
          : cat === 'RWA'
            ? 'Mint or hold the tokenised asset and keep the position open'
            : 'Use the app as a real user: deposit, transact and hold the position';
  const steps = [
    `Bridge $${dep} to ${chain} for ${p.name} ($45 bridge fee, about 30 minutes). Keep the receipt; this is the only on-chain move that costs more than $15.`,
    `Swap half of the $${dep} deposit into the asset ${p.name} uses (${cat}), paying about 0.3% per swap ($${Math.round(0.003 * depositUsd)}), about 20 minutes.`,
    `${verb} with the full $${dep} deposit on ${p.name} (TVL $${Math.round(p.tvl_usd / 1e6)}M), about 45 minutes the first week.`,
    `Repeat one real interaction a week for 12 weeks (swap, supply or stake, 20 minutes each, about $12 gas per week). Do not wash-trade; one genuine use per week.`,
    `Week 4: add a second position of about $${Math.round(depositUsd / 2).toLocaleString('en-US')} if the first month cost under $60 in gas (30 minutes, 0.3% swap fee).`,
    `Week 8: check the position and rebalance once if its value moved more than 20% (30 minutes, about $12 gas). Record every transaction hash in a note.`,
    `Week 12: stop adding funds. Leave the $${dep} deposit in place for the snapshot; withdrawing early is the most common way farmers lose eligibility.`,
    `If a token launches, claim through the official ${p.name} app only, sell at most half in week one, and keep the rest staked (30 minutes to claim, about $15 gas).`,
  ];
  return { depositUsd, expectedDropUsd, feesUsd, netUsd, hoursTotal, netPerHourUsd, verdict, steps };
}

// ------------------------------------------------------------- whole model

export interface RowModel {
  proto: Proto;
  fittedMcapUsd: number;
  sizeMultiple: number;
  odds: number;
  timeFactor: number;
  growthFactor: number;
  impliedUsd: number;
  rangeP25: number;
  rangeP75: number;
  rangeP10: number;
  rangeP90: number;
  ageYears: number | null;
  ageImputed: boolean;
  growthMissing: boolean;
  farm: FarmPlan;
}

export interface BuiltModel {
  size: SizeFit;
  odds: OddsFit;
  termTests: TermTest[];
  categoryKept: boolean;
  categoryOffsets: Map<string, number>;
  medianAge: number;
  asOf: string;
  rows: RowModel[];
  ledger: { ranked: number; tokenTrades: number; setAside: number; total: number };
  watchlistCovered: number;
  watchlistTotal: number;
  imputedAgeCount: number;
  missingGrowthCount: number;
  verdictCounts: Record<Verdict, number>;
}

export function buildModel(snap: Snapshot): BuiltModel {
  const asOf = snap.as_of;
  const traded = tradedTokens(snap.protocols);
  const peers = oddsPeers(snap.protocols);
  const medianAge = median(peers.map((p) => ageYears(p.listed_at, asOf)!));
  const size = fitSizeCurve(traded);
  const odds = fitOdds(peers, asOf, medianAge);
  const catTest = testCategoryTerm(traded);
  const priceTest = testPriceTerms(traded, asOf, medianAge);
  const termTests = [catTest, priceTest];
  const categoryKept = catTest.kept;
  const categoryOffsets = categoryKept
    ? categoryOffsets(traded, { a: size.a, b: size.b, n: size.n })
    : new Map<string, number>();

  // Ranked universe: the 40 watchlist protocols plus the 158 largest
  // no-token protocols below the $50M floor, by TVL. Every ranked row
  // records no token (mcap_usd null).
  const watch = new Set(snap.watchlist);
  const belowFloor = snap.protocols
    .filter((p) => p.mcap_usd === null && !watch.has(p.slug) && p.tvl_usd < snap.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, 158);
  const rankedProtos = [
    ...snap.protocols.filter((p) => watch.has(p.slug)),
    ...belowFloor,
  ];
  const tokenTrades = snap.protocols.filter((p) => p.mcap_usd !== null).length;
  const ledger = {
    ranked: rankedProtos.length,
    tokenTrades,
    setAside: snap.protocols.length - rankedProtos.length - tokenTrades,
    total: snap.protocols.length,
  };

  let imputedAgeCount = 0;
  let missingGrowthCount = 0;
  const verdictCounts: Record<Verdict, number> = { FARM: 0, THIN: 0, MARGINAL: 0, SKIP: 0 };
  const rows: RowModel[] = rankedProtos.map((p) => {
    const age = ageYears(p.listed_at, asOf);
    const ageImputed = age === null;
    if (ageImputed) imputedAgeCount++;
    if (p.change_7d === null) missingGrowthCount++;
    const catOff = categoryOffsets.get(p.category ?? '(none)') ?? 0;
    const fittedMcapUsd = Math.exp(size.a + size.b * Math.log(p.tvl_usd) + catOff);
    const sizeMultiple = fittedMcapUsd / p.tvl_usd;
    const o = tokenOdds(odds, p, asOf);
    const { timeFactor, growthFactor } = oddsFactors(odds, p, asOf);
    const impliedUsd = fittedMcapUsd * o;
    const farm = farmPlan(p, impliedUsd);
    verdictCounts[farm.verdict]++;
    return {
      proto: p,
      fittedMcapUsd,
      sizeMultiple,
      odds: o,
      timeFactor,
      growthFactor,
      impliedUsd,
      rangeP25: impliedUsd * Math.exp(size.q25),
      rangeP75: impliedUsd * Math.exp(size.q75),
      rangeP10: impliedUsd * Math.exp(size.q10),
      rangeP90: impliedUsd * Math.exp(size.q90),
      ageYears: age,
      ageImputed,
      growthMissing: p.change_7d === null,
      farm,
    };
  });
  rows.sort((a, b) => b.impliedUsd - a.impliedUsd);
  return {
    size,
    odds,
    termTests,
    categoryKept,
    categoryOffsets,
    medianAge,
    asOf,
    rows,
    ledger,
    watchlistCovered: rankedProtos.filter((p) => watch.has(p.slug)).length,
    watchlistTotal: snap.watchlist.length,
    imputedAgeCount,
    missingGrowthCount,
    verdictCounts,
  };
}
