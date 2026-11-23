// lib/model.ts — token-radar-01, round 3 (round3-fix).
//
// Seluruh model di-fit dari snapshot DefiLlama 14 Nov 2026 (758 protokol).
// Node 22, standard library only, tanpa network, deterministik.
//
// BAGIAN 1 (file ini, sampai penutup `token odds` di bawah):
//   interface Proto + Snapshot, helper statistik, tradedTokens / oddsPeers /
//   hasToken, kurva ukuran log-log + uji held-out (LOO / walk-forward /
//   bootstrap), dan term tests (category offsets, price terms).
// BAGIAN 2 (di bawah penutup, builder bagian 2): odds blend, ekonomi farm,
//   dan buildModel.
//
// Definisi peer yang BENAR (lihat r3-fix-spec §2.1): peer = listed_at ada DAN
// mcap_usd null (belum ada token) ATAU mcap_usd > 0 (token diperdagangkan),
// n = 634 (539 tanpa token + 95 dengan token). Terbuang: 113 tanpa listed_at
// + 11 ber-listed_at dengan mcap 0/-1. Docstring lama yang menyebut
// "16 protokol mcap 0/-1 dan 113 tanpa listed_at" SALAH hitung (double-count).
//
// Growth 7d TIDAK dipakai sebagai input model odds mana pun (placebo =
// in-sample, lihat spec §2.2); growth tetap muncul sebagai term test di bawah
// (price terms, NOT KEPT) dan sebagai kolom info di board.

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

/** Median: n ganjil -> nilai tengah; n genap -> rata-rata dua nilai tengah. */
export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Kuantil interpolasi linear gaya type-7: pos = q*(n-1), lo = floor(pos),
 * hi = ceil(pos), hasil s[lo] + (s[hi]-s[lo])*(pos-lo).
 */
export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = q * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Sigmoid dengan z dijepit ke +/-30. */
export function sigmoid(z: number): number {
  const c = clamp(z, -30, 30);
  return 1 / (1 + Math.exp(-c));
}

/**
 * Umur tercatat dalam tahun: selisih tanggal kalender (UTC, tanggal saja)
 * antara asOf dan listedAt, dibagi 365,25. Null bila listedAt kosong atau
 * tanggal tidak valid.
 */
export function ageYears(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null || listedAt === "") return null;
  const t1 = Date.parse(asOf.slice(0, 10) + "T00:00:00Z");
  const t0 = Date.parse(listedAt.slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(t1) || Number.isNaN(t0)) return null;
  return (t1 - t0) / (365.25 * 24 * 3600 * 1000);
}

/** OLS satu variabel (mean-centred). b = sxy/sxx (0 bila sxx = 0). */
export function ols1(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) * (xs[i] - mx);
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return { a: my - b * mx, b };
}

/**
 * OLS multi-variabel. rows = [1, x1, x2, ...] (kolom pertama = intercept).
 * Persamaan normal diselesaikan dengan eliminasi Gauss + partial pivoting;
 * ridge kecil 1e-8 di diagonal agar desain singular tetap terselesaikan
 * deterministik.
 */
export function olsMulti(rows: number[][], ys: number[]): number[] {
  const k = rows[0].length;
  const n = rows.length;
  const xtx: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty: number[] = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let r = 0; r < k; r++) {
      xty[r] += rows[i][r] * ys[i];
      for (let c = 0; c < k; c++) xtx[r][c] += rows[i][r] * rows[i][c];
    }
  }
  for (let d = 0; d < k; d++) xtx[d][d] += 1e-8;
  // Eliminasi Gauss dengan partial pivoting (matriks augmented k x (k+1)).
  const m: number[][] = xtx.map((row, r) => [...row, xty[r]]);
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    }
    if (piv !== col) {
      const tmp = m[col];
      m[col] = m[piv];
      m[piv] = tmp;
    }
    const diag = m[col][col];
    if (diag === 0) continue;
    for (let r = col + 1; r < k; r++) {
      const f = m[r][col] / diag;
      for (let c = col; c <= k; c++) m[r][c] -= f * m[col][c];
    }
  }
  const coef: number[] = new Array<number>(k).fill(0);
  for (let r = k - 1; r >= 0; r--) {
    let sum = m[r][k];
    for (let c = r + 1; c < k; c++) sum -= m[r][c] * coef[c];
    coef[r] = m[r][r] === 0 ? 0 : sum / m[r][r];
  }
  return coef;
}

/** Prediksi OLS multi: dot product koefisien dengan baris fitur. */
export function predictMulti(coef: number[], row: number[]): number {
  let s = 0;
  for (let i = 0; i < coef.length; i++) s += coef[i] * row[i];
  return s;
}

// ------------------------------------------------------- peer universes

/** Token yang diperdagangkan: mcap_usd > 0. Ekspektasi snapshot: n = 128. */
export function tradedTokens(ps: Proto[]): Proto[] {
  return ps.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0);
}

/**
 * Peer odds: listed_at tercatat DAN status token tidak ambigu, yaitu
 * mcap_usd null (belum ada token) ATAU mcap_usd > 0 (token diperdagangkan).
 * Ekspektasi snapshot: n = 634 (539 null + 95 positif). Terbuang: 113 tanpa
 * listed_at + 11 ber-listed_at dengan mcap 0/-1 (status ambigu).
 */
export function oddsPeers(ps: Proto[]): Proto[] {
  return ps.filter(
    (p) => p.listed_at !== null && (p.mcap_usd === null || p.mcap_usd > 0),
  );
}

/** true bila protokol punya token yang diperdagangkan (mcap_usd > 0). */
export function hasToken(p: Proto): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0;
}

// ------------------------------------------------------------- size curve

export interface SizeFit {
  a: number;
  b: number;
  n: number;
  /** Median |log error| kurva fitted, leave-one-out (ekspektasi 1,22). */
  looMedianAbsLog: number;
  looMultiple: number;
  /** Sama, walk-forward: separuh tertua fit, separuh terbaru diuji (1,10). */
  wfMedianAbsLog: number;
  wfMultiple: number;
  /** Baseline flat multiple (median mcap/TVL) pada split yang sama. */
  flatLooMultiple: number;
  flatWfMultiple: number;
  /** Residual LOO (signed log error) — sumber semua range per baris. */
  looResiduals: number[];
  q25: number;
  q75: number;
  q10: number;
  q90: number;
  /** Share caps held-out di dalam pita P25-P75 / P10-P90 yang dicetak. */
  rangeHold50: number;
  rangeHold80: number;
  /** Bootstrap standard errors (200 resample, LCG seed 20261114). */
  aSe: number;
  bSe: number;
}

/**
 * LOO errors: untuk tiap i, fit pada semua kecuali i,
 * error = ln(mcap_i) - prediksi. predict(train, p) mengembalikan prediksi
 * ln(mcap) untuk p dari train.
 */
export function looErrors(
  data: Proto[],
  predict: (train: Proto[], p: Proto) => number,
): number[] {
  const errs: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const train = data.slice(0, i).concat(data.slice(i + 1));
    const p = data[i];
    errs.push(Math.log(p.mcap_usd as number) - predict(train, p));
  }
  return errs;
}

/**
 * Walk-forward errors: hanya protokol ber-listed_at, diurutkan menurut
 * listed_at; separuh pertama = train, separuh kedua = test.
 */
export function wfErrors(
  data: Proto[],
  predict: (train: Proto[], p: Proto) => number,
): number[] {
  const dated = data
    .filter((p) => p.listed_at !== null)
    .sort((x, y) => ((x.listed_at as string) < (y.listed_at as string) ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const train = dated.slice(0, half);
  const test = dated.slice(half);
  return test.map((p) => Math.log(p.mcap_usd as number) - predict(train, p));
}

/** Prediksi flat: ln(median(mcap/TVL train) * TVL). */
export function flatPredict(train: Proto[], p: Proto): number {
  const m = median(train.map((t) => (t.mcap_usd as number) / t.tvl_usd));
  return Math.log(m * p.tvl_usd);
}

/** Prediksi kurva: a + b*ln(TVL). */
export function curvePredict(fit: { a: number; b: number }, p: Proto): number {
  return fit.a + fit.b * Math.log(p.tvl_usd);
}

/** Fit kurva ukuran: ols1 atas ln(TVL) -> ln(mcap). Ekspektasi a=6,965, b=0,522. */
export function fitCurve(data: Proto[]): { a: number; b: number } {
  return ols1(
    data.map((p) => Math.log(p.tvl_usd)),
    data.map((p) => Math.log(p.mcap_usd as number)),
  );
}

export function fitSizeCurve(traded: Proto[]): SizeFit {
  const fit = fitCurve(traded);
  const curveFn = (tr: Proto[], p: Proto): number => curvePredict(fitCurve(tr), p);
  const loo = looErrors(traded, curveFn);
  const wf = wfErrors(traded, curveFn);
  const looFlat = looErrors(traded, flatPredict);
  const wfFlat = wfErrors(traded, flatPredict);
  const q25 = quantile(loo, 0.25);
  const q75 = quantile(loo, 0.75);
  const q10 = quantile(loo, 0.1);
  const q90 = quantile(loo, 0.9);
  // Range honesty: cap held-out "hold" bila ln(mcap) aktual jatuh dalam
  // [pred+q25, pred+q75] / [pred+q10, pred+q90] dengan pred = prediksi LOO.
  let hold50 = 0;
  let hold80 = 0;
  for (let i = 0; i < traded.length; i++) {
    const train = traded.slice(0, i).concat(traded.slice(i + 1));
    const pred = curvePredict(fitCurve(train), traded[i]);
    const actual = Math.log(traded[i].mcap_usd as number);
    if (actual >= pred + q25 && actual <= pred + q75) hold50++;
    if (actual >= pred + q10 && actual <= pred + q90) hold80++;
  }
  // Bootstrap s.e.: LCG seed 20261114, 200 resample dengan pengembalian
  // ukuran n, fit ulang tiap resample; s.e. = simpangan baku populasi dari
  // 200 koefisien a / b. Ekspektasi: s.e. a ±1,519, b ±0,083.
  let seed = 20261114;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const bsA: number[] = [];
  const bsB: number[] = [];
  for (let r = 0; r < 200; r++) {
    const sample: Proto[] = [];
    for (let i = 0; i < traded.length; i++) {
      sample.push(traded[Math.floor(rnd() * traded.length)]);
    }
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

// Term KEPT hanya bila menurunkan median |log error| di KEDUA uji held-out
// (LOO dan walk-forward). Semua yang diuji dilaporkan, kept atau tidak.
// CATATAN: angka term-test adalah median |log error| (bukan multiple), tapi
// dashboard menampilkannya dengan prefiks `×` (warisan R3 — JANGAN
// "diperbaiki"; reproduksi apa adanya).

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

/**
 * Category offsets, shrunk toward zero: offset_c = sum(residual) / (n_c + 4)
 * per kategori (kategori null -> '(none)'). +4 adalah pseudo-count tetap,
 * bukan hasil tuning. Residual = ln(mcap) - prediksi kurva.
 */
export function categoryOffsets(
  train: Proto[],
  base: { a: number; b: number },
): Map<string, number> {
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const p of train) {
    const r = Math.log(p.mcap_usd as number) - curvePredict(base, p);
    const c = p.category ?? "(none)";
    sums.set(c, (sums.get(c) ?? 0) + r);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const out = new Map<string, number>();
  for (const [c, s] of sums) out.set(c, s / ((counts.get(c) ?? 0) + 4));
  return out;
}

export function testCategoryTerm(traded: Proto[], size: SizeFit): TermTest {
  const base = (tr: Proto[], p: Proto): number => curvePredict(fitCurve(tr), p);
  const withCat = (tr: Proto[], p: Proto): number => {
    const f = fitCurve(tr);
    const off = categoryOffsets(tr, f);
    return curvePredict(f, p) + (off.get(p.category ?? "(none)") ?? 0);
  };
  const looBase = size.looMedianAbsLog;
  const looWith = medianAbs(looErrors(traded, withCat));
  const wfBase = size.wfMedianAbsLog;
  const wfWith = medianAbs(wfErrors(traded, withCat));
  return {
    term: "category offsets (shrunk, pseudo-count 4)",
    looBase,
    looWith,
    wfBase,
    wfWith,
    kept: looWith < looBase && wfWith < wfBase,
  };
}

/**
 * Baris fitur price terms: [1, ln(TVL), age, growth] dengan age = umur
 * tercatat atau median umur peer, growth = clamp(change_7d ?? 0, -50, 50)/100.
 * Ekspektasi: LOO 1,22 -> 1,33; WF 1,10 -> 1,02; NOT KEPT (lebih baik di
 * satu uji saja).
 */
export function priceRow(p: Proto, asOf: string, medAge: number): number[] {
  const age = ageYears(p.listed_at, asOf) ?? medAge;
  const g = clamp(p.change_7d ?? 0, -50, 50) / 100;
  return [1, Math.log(p.tvl_usd), age, g];
}

export function testPriceTerms(
  traded: Proto[],
  size: SizeFit,
  asOf: string,
  medAge: number,
): TermTest {
  const base = (tr: Proto[], p: Proto): number => curvePredict(fitCurve(tr), p);
  const withTerms = (tr: Proto[], p: Proto): number => {
    const beta = olsMulti(
      tr.map((t) => priceRow(t, asOf, medAge)),
      tr.map((t) => Math.log(t.mcap_usd as number)),
    );
    return predictMulti(beta, priceRow(p, asOf, medAge));
  };
  const looBase = size.looMedianAbsLog;
  const looWith = medianAbs(looErrors(traded, withTerms));
  const wfBase = size.wfMedianAbsLog;
  const wfWith = medianAbs(wfErrors(traded, withTerms));
  return {
    term: "age + 7d growth as price terms",
    looBase,
    looWith,
    wfBase,
    wfWith,
    kept: looWith < looBase && wfWith < wfBase,
  };
}

// ------------------------------------------------------------ token odds

export interface OddsFit {
  /** Bobot logistik [umur, ln TVL] pada fitur terstandardisasi. */
  weights: number[];
  /** Mean tiap fitur logistik pada peer (urutan [umur, ln TVL]). */
  means: number[];
  /** Std populasi tiap fitur logistik pada peer. */
  sds: number[];
  /** Intercept logistik (diinisialisasi ke logit(base rate), lalu di-fit). */
  intercept: number;
  /** Jumlah peer odds (ekspektasi 634). */
  n: number;
  /** Peer dengan token (mcap > 0; ekspektasi 95). */
  positives: number;
  /** Base rate = positives / n (ekspektasi 0,150). */
  baseRate: number;
  /** Brier in-sample odds blend (ekspektasi 0,120). */
  brier: number;
  /** Brier bila selalu memprediksi base rate = baseRate*(1-baseRate) (0,127). */
  baseBrier: number;
  /** Brier blend, 5-fold CV (ekspektasi 0,124). */
  cvBrier: number;
  /** Brier placebo growth-baris-lain, in-sample (ekspektasi 0,120). */
  placeboBrier: number;
  /** Median umur peer (tahun); dipakai sebagai imputasi umur baris ranked. */
  medianAge: number;
  /** Brier logistik saja, 5-fold CV (ekspektasi 0,123). */
  logisticCvBrier: number;
  /** Brier laju sel saja, 5-fold CV (ekspektasi 0,126). */
  cellCvBrier: number;
  /** Bobot blend logistik (0,5; equal weight, tanpa tuning). */
  blendWeight: number;
  /** Pseudo-count shrink sel (m = 20). */
  cellShrinkM: number;
  /** Brier in-sample logistik saja (ekspektasi 0,120). */
  logisticBrier: number;
  /** Brier in-sample laju sel saja (ekspektasi 0,120). */
  cellBrier: number;
  /** Laju token per band TVL (5 band, urutan tvlBand): fallback laju sel. */
  tvlBandRates: number[];
  /** Positif per sel [band TVL][band umur] (5 x 4). */
  cellPositives: number[][];
  /** Jumlah peer per sel [band TVL][band umur] (5 x 4). */
  cellCounts: number[][];
}

// ------------------------------------------------------- odds: band helpers

/** Band TVL (ditetapkan sebelum odds dihitung, bukan hasil tuning). */
export function tvlBand(tvlUsd: number): number {
  if (tvlUsd < 10_000_000) return 0;
  if (tvlUsd < 50_000_000) return 1;
  if (tvlUsd < 200_000_000) return 2;
  if (tvlUsd < 1_000_000_000) return 3;
  return 4;
}

/** Band umur: <1 th, 1-2 th, 2-3 th, >=3 th. */
export function ageBand(ageYearsValue: number): number {
  if (ageYearsValue < 1) return 0;
  if (ageYearsValue < 2) return 1;
  if (ageYearsValue < 3) return 2;
  return 3;
}

function meanOf(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Simpangan baku populasi (pembagi n, bukan n-1). */
function popSd(xs: number[], m: number): number {
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / xs.length);
}

/** Standardisasi kolom-kolom fitur: kembalikan [means, sds, standardised]. */
function standardise(
  rows: number[][],
): { means: number[]; sds: number[]; z: number[][] } {
  const k = rows[0].length;
  const means: number[] = [];
  const sds: number[] = [];
  for (let j = 0; j < k; j++) {
    const col = rows.map((r) => r[j]);
    const m = meanOf(col);
    const sd = popSd(col, m);
    means.push(m);
    sds.push(sd === 0 ? 1 : sd);
  }
  const z = rows.map((r) => r.map((v, j) => (v - means[j]) / sds[j]));
  return { means, sds, z };
}

export interface LogisticFit {
  intercept: number;
  weights: number[];
  means: number[];
  sds: number[];
}

/**
 * Regresi logistik full-batch gradient descent (gradien RATA-RATA, bukan
 * jumlah — dengan lr 0,25 dan n=634, gradien jumlah akan divergen).
 * Intercept awal = logit(base rate), bobot awal 0, lr 0,25, 2500 iterasi,
 * sigmoid dijepit ke +/-30 (lihat sigmoid di Bagian 1). Deterministik:
 * init tetap, tanpa shuffle, tanpa random.
 * Ekspektasi [umur, ln TVL]: intercept -1,865, bobot [0,611, -0,057].
 */
export function fitLogistic(
  features: number[][],
  ys: number[],
  baseRate: number,
): LogisticFit {
  const { means, sds, z } = standardise(features);
  const k = features[0].length;
  let intercept = Math.log(baseRate / (1 - baseRate));
  const weights = new Array<number>(k).fill(0);
  const n = features.length;
  for (let iter = 0; iter < 2500; iter++) {
    let g0 = 0;
    const gw = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) {
      let lin = intercept;
      for (let j = 0; j < k; j++) lin += weights[j] * z[i][j];
      const p = sigmoid(lin);
      const err = p - ys[i];
      g0 += err;
      for (let j = 0; j < k; j++) gw[j] += err * z[i][j];
    }
    intercept -= (0.25 * g0) / n;
    for (let j = 0; j < k; j++) weights[j] -= (0.25 * gw[j]) / n;
  }
  return { intercept, weights, means, sds };
}

/** Probabilitas logistik untuk fitur mentah (umur, ln TVL, ...). */
export function logisticProb(fit: LogisticFit, raw: number[]): number {
  let lin = fit.intercept;
  for (let j = 0; j < raw.length; j++) {
    lin += fit.weights[j] * ((raw[j] - fit.means[j]) / fit.sds[j]);
  }
  return sigmoid(lin);
}

// ------------------------------------------------- odds: komponen B (sel)

/** Model laju sel: laju per band TVL + hitungan positif/total per sel. */
export interface CellFit {
  /** Laju token seluruh peer per band TVL (fallback bila band kosong). */
  tvlBandRates: number[];
  /** Positif per sel [band TVL][band umur]. */
  positives: number[][];
  /** Jumlah peer per sel [band TVL][band umur]. */
  counts: number[][];
  /** Pseudo-count shrink m (20). */
  m: number;
  /** Base rate, dipakai bila band TVL kosong (tidak terjadi di snapshot). */
  baseRate: number;
}

function emptyGrid(): number[][] {
  return Array.from({ length: 5 }, () => [0, 0, 0, 0]);
}

/**
 * Fit laju sel dari peer: laju_band_TVL = token rate seluruh peer di band
 * TVL itu; hitungan positif/total per sel (band TVL x band umur).
 * Umur peer selalu tercatat (peer mensyaratkan listed_at).
 */
export function fitCellRates(
  peers: Proto[],
  asOf: string,
  m: number,
  baseRate: number,
): CellFit {
  const positives = emptyGrid();
  const counts = emptyGrid();
  const bandPos = [0, 0, 0, 0, 0];
  const bandN = [0, 0, 0, 0, 0];
  for (const p of peers) {
    const tb = tvlBand(p.tvl_usd);
    const age = ageYears(p.listed_at, asOf) as number;
    const ab = ageBand(age);
    counts[tb][ab] += 1;
    bandN[tb] += 1;
    if (hasToken(p)) {
      positives[tb][ab] += 1;
      bandPos[tb] += 1;
    }
  }
  const tvlBandRates = bandN.map((n, tb) =>
    n === 0 ? baseRate : bandPos[tb] / n,
  );
  return { tvlBandRates, positives, counts, m, baseRate };
}

/**
 * Laju sel = (positif_sel + m x laju_band_TVL) / (n_sel + m).
 * Ekspektasi Steakhouse (band TVL >=$1B, umur 1-2 th): 0,245.
 */
export function cellProb(
  cell: CellFit,
  ageYearsValue: number,
  tvlUsd: number,
): number {
  const tb = tvlBand(tvlUsd);
  const ab = ageBand(ageYearsValue);
  const bandRate = cell.tvlBandRates[tb] ?? cell.baseRate;
  return (
    (cell.positives[tb][ab] + cell.m * bandRate) /
    (cell.counts[tb][ab] + cell.m)
  );
}

/** Fitur odds 2-fitur [umur, ln TVL] untuk satu protokol. */
export function oddsFeatures(p: Proto, asOf: string, medAge: number): number[] {
  const age = ageYears(p.listed_at, asOf) ?? medAge;
  return [age, Math.log(p.tvl_usd)];
}

/** Brier score: rata-rata (prediksi - y)^2. */
export function brierScore(preds: number[], ys: number[]): number {
  let s = 0;
  for (let i = 0; i < preds.length; i++) s += (preds[i] - ys[i]) * (preds[i] - ys[i]);
  return preds.length === 0 ? 0 : s / preds.length;
}

export interface OddsTriple {
  /** Blend final: 0,5 x logistik + 0,5 x sel. */
  odds: number;
  /** Komponen logistik saja. */
  logisticOdds: number;
  /** Komponen laju sel saja. */
  cellOdds: number;
}

/**
 * Ketiga odds untuk satu baris dari OddsFit yang sudah di-fit.
 * Umur = umur tercatat, atau median umur peer bila listed_at kosong
 * (umur imputasi masuk band 1-2 th — median peer ada di band itu).
 * Growth TIDAK dipakai di sini (maupun di komponen mana pun, kecuali
 * placebo di fitOdds).
 */
export function oddsForRow(fit: OddsFit, p: Proto, asOf: string): OddsTriple {
  const age = ageYears(p.listed_at, asOf) ?? fit.medianAge;
  const logisticOdds = logisticProb(
    {
      intercept: fit.intercept,
      weights: fit.weights,
      means: fit.means,
      sds: fit.sds,
    },
    [age, Math.log(p.tvl_usd)],
  );
  const cellOdds = cellProb(
    {
      tvlBandRates: fit.tvlBandRates,
      positives: fit.cellPositives,
      counts: fit.cellCounts,
      m: fit.cellShrinkM,
      baseRate: fit.baseRate,
    },
    age,
    p.tvl_usd,
  );
  const odds =
    fit.blendWeight * logisticOdds + (1 - fit.blendWeight) * cellOdds;
  return { odds, logisticOdds, cellOdds };
}

// ---------------------------------------------------------- odds: fitOdds

/**
 * Fit odds blend dari peer (diurutkan menurut slug — urutan ini dipakai
 * untuk CV 5-fold DAN placebo, agar keduanya deterministik).
 *
 * - Komponen A: logistik [umur, ln TVL] (fitLogistic di atas).
 * - Komponen B: laju sel (fitCellRates di atas, shrink m = 20).
 * - Blend: 0,5 x logistik + 0,5 x sel (equal weight, tanpa tuning).
 * - CV 5-fold: fold = indeks (dalam urutan slug) mod 5; tiap fold, KEDUA
 *   komponen difit ulang hanya pada 4/5 train fold, lalu dievaluasi pada
 *   fold test. Brier CV dilaporkan pooled (tiap peer tepat satu kali jadi
 *   test) untuk blend, logistik saja, dan sel saja.
 * - Placebo: SATU-SATUNYA tempat growth muncul — logistik 3-fitur
 *   [umur, ln TVL, growth] dengan growth tiap baris diganti growth baris
 *   BERIKUTNYA dalam urutan slug (siklik: baris terakhir memakai growth
 *   baris pertama); growth = clamp(change_7d ?? 0, -50, 50)/100, sama
 *   seperti priceRow di Bagian 1. Brier in-sample-nya (ekspektasi 0,120).
 *
 * Ekspektasi: brier 0,120; cvBrier 0,124; logisticCvBrier 0,123;
 * cellCvBrier 0,126; baseBrier 0,127; placeboBrier 0,120.
 */
export function fitOdds(peers: Proto[], asOf: string): OddsFit {
  const sorted = [...peers].sort((x, y) => (x.slug < y.slug ? -1 : x.slug > y.slug ? 1 : 0));
  const n = sorted.length;
  const ys = sorted.map((p) => (hasToken(p) ? 1 : 0));
  const positives = ys.reduce((s, y) => s + y, 0);
  const baseRate = n === 0 ? 0 : positives / n;
  const ages = sorted.map((p) => ageYears(p.listed_at, asOf) as number);
  const medianAge = median(ages);
  const features = sorted.map((p, i) => [ages[i], Math.log(p.tvl_usd)]);

  // Fit penuh (seluruh peer): kedua komponen.
  const logFit = fitLogistic(features, ys, baseRate);
  const cellFit = fitCellRates(sorted, asOf, 20, baseRate);
  const logisticPreds = features.map((f) => logisticProb(logFit, f));
  const cellPreds = sorted.map((p, i) => cellProb(cellFit, ages[i], p.tvl_usd));
  const blendPreds = logisticPreds.map(
    (lp, i) => 0.5 * lp + 0.5 * cellPreds[i],
  );
  const brier = brierScore(blendPreds, ys);
  const logisticBrier = brierScore(logisticPreds, ys);
  const cellBrier = brierScore(cellPreds, ys);
  const baseBrier = baseRate * (1 - baseRate);

  // 5-fold CV: fold = indeks (urutan slug) mod 5; kedua komponen difit
  // ulang hanya pada train fold. Brier pooled atas seluruh peer.
  const cvBlend: number[] = new Array<number>(n).fill(0);
  const cvLogistic: number[] = new Array<number>(n).fill(0);
  const cvCell: number[] = new Array<number>(n).fill(0);
  for (let fold = 0; fold < 5; fold++) {
    const trainIdx: number[] = [];
    const testIdx: number[] = [];
    for (let i = 0; i < n; i++) {
      if (i % 5 === fold) testIdx.push(i);
      else trainIdx.push(i);
    }
    const trainYs = trainIdx.map((i) => ys[i]);
    const trainBase = trainYs.reduce((s, y) => s + y, 0) / trainYs.length;
    const trainLog = fitLogistic(
      trainIdx.map((i) => features[i]),
      trainYs,
      trainBase,
    );
    const trainCell = fitCellRates(
      trainIdx.map((i) => sorted[i]),
      asOf,
      20,
      trainBase,
    );
    for (const i of testIdx) {
      const lp = logisticProb(trainLog, features[i]);
      const cp = cellProb(trainCell, ages[i], sorted[i].tvl_usd);
      cvLogistic[i] = lp;
      cvCell[i] = cp;
      cvBlend[i] = 0.5 * lp + 0.5 * cp;
    }
  }
  const cvBrier = brierScore(cvBlend, ys);
  const logisticCvBrier = brierScore(cvLogistic, ys);
  const cellCvBrier = brierScore(cvCell, ys);

  // Placebo: growth baris BERIKUTNYA dalam urutan slug (siklik).
  const growthOf = (p: Proto): number => clamp(p.change_7d ?? 0, -50, 50) / 100;
  const placeboFeatures = sorted.map((p, i) => [
    ages[i],
    Math.log(p.tvl_usd),
    growthOf(sorted[(i + 1) % n]),
  ]);
  const placeboFit = fitLogistic(placeboFeatures, ys, baseRate);
  const placeboPreds = placeboFeatures.map((f) => logisticProb(placeboFit, f));
  const placeboBrier = brierScore(placeboPreds, ys);

  return {
    weights: logFit.weights,
    means: logFit.means,
    sds: logFit.sds,
    intercept: logFit.intercept,
    n,
    positives,
    baseRate,
    brier,
    baseBrier,
    cvBrier,
    placeboBrier,
    medianAge,
    logisticCvBrier,
    cellCvBrier,
    blendWeight: 0.5,
    cellShrinkM: 20,
    logisticBrier,
    cellBrier,
    tvlBandRates: cellFit.tvlBandRates,
    cellPositives: cellFit.positives,
    cellCounts: cellFit.counts,
  };
}

// ------------------------------------------------------- farm economics

/** Template verbatim (spec A.5) — dipakai dashboard + README. */
export const FARM_ASSUMPTIONS =
  "Deposit 0.01% of TVL, clamped to $1K–$20K. Drop pool 7% of implied value, " +
  "split among ~250 active farmers; 12-week horizon, 1.5 h/week (18 h); fees " +
  "$45 bridge + $12/week gas + 0.3% x 4 swaps. FARM: net >= $1,500 and >= " +
  "$75/h. THIN: net >= $300 and >= $15/h. MARGINAL: net > $0. Else SKIP.";

export type Verdict = "FARM" | "THIN" | "MARGINAL" | "SKIP";

export interface FarmPlan {
  depositUsd: number;
  expectedDropUsd: number;
  feesUsd: number;
  hoursTotal: number;
  netUsd: number;
  netPerHourUsd: number;
  verdict: Verdict;
  steps: string[];
}

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US");
}

/** Kata kerja langkah 3 menurut kategori (spec A.5). */
export function farmVerb(category: string | null): string {
  if (category === "Lending") {
    return "Supply assets and borrow a small amount against them each week";
  }
  if (category === "Dexs") {
    return "Swap a small amount and add to a liquidity pool each week";
  }
  if (category === "Yield" || category === "Yield Aggregator") {
    return "Stake into the vault and compound the yield each week";
  }
  if (category === "RWA") {
    return "Mint or hold the tokenised asset and keep the position open";
  }
  return "Use the app as a real user: deposit, transact and hold the position";
}

/**
 * Rencana farm per baris (ambang + rumus TIDAK berubah, spec §3/A.5):
 * deposit = round(clamp(0,01% TVL, $1K, $20K)); drop = round(7% implied /
 * 250); fees = round(45 + 12*12 + 0,3% x deposit x 4); jam = 18;
 * net = drop - fees; $/jam = round(net/18, 2 desimal).
 * FARM bila net >= 1500 DAN $/jam >= 75; THIN bila net >= 300 DAN >= 15;
 * MARGINAL bila net > 0; else SKIP.
 */
export function farmPlan(p: Proto, impliedUsd: number): FarmPlan {
  const depositUsd = Math.round(clamp(p.tvl_usd * 0.0001, 1000, 20000));
  const expectedDropUsd = Math.round((0.07 * impliedUsd) / 250);
  const feesUsd = Math.round(45 + 12 * 12 + 0.003 * depositUsd * 4);
  const hoursTotal = 18;
  const netUsd = expectedDropUsd - feesUsd;
  const netPerHourUsd = Math.round((netUsd / 18) * 100) / 100;
  let verdict: Verdict;
  if (netUsd >= 1500 && netPerHourUsd >= 75) verdict = "FARM";
  else if (netUsd >= 300 && netPerHourUsd >= 15) verdict = "THIN";
  else if (netUsd > 0) verdict = "MARGINAL";
  else verdict = "SKIP";

  // Placeholder langkah: DEP = deposit format en-US; CHAIN = chains[0] atau
  // "its main chain"; CAT = kategori atau "DeFi"; TVLM = round(TVL/1e6);
  // HALFDEP = round(deposit/2) format en-US; SWAPFEE = round(0,3% deposit).
  const dep = fmtUsd(depositUsd);
  const chain = p.chains.length > 0 ? p.chains[0] : "its main chain";
  const cat = p.category ?? "DeFi";
  const tvlm = Math.round(p.tvl_usd / 1_000_000);
  const halfDep = fmtUsd(Math.round(depositUsd / 2));
  const swapFee = fmtUsd(Math.round(0.003 * depositUsd));
  const verb = farmVerb(p.category);
  const steps = [
    `Bridge $${dep} to ${chain} for ${p.name} ($45 bridge fee, about 30 minutes). Keep the receipt; this is the only on-chain move that costs more than $15.`,
    `Swap half of the $${dep} deposit into the asset ${p.name} uses (${cat}), paying about 0.3% per swap ($${swapFee}), about 20 minutes.`,
    `${verb} with the full $${dep} deposit on ${p.name} (TVL $${tvlm} M), about 45 minutes the first week.`,
    `Repeat one real interaction a week for 12 weeks (swap, supply or stake, 20 minutes each, about $12 gas per week). Do not wash-trade; one genuine use per week.`,
    `Week 4: add a second position of about $${halfDep} if the first month cost under $60 in gas (30 minutes, 0.3% swap fee).`,
    `Week 8: check the position and rebalance once if its value moved more than 20% (30 minutes, about $12 gas). Record every transaction hash in a note.`,
    `Week 12: stop adding funds. Leave the $${dep} deposit in place for the snapshot; withdrawing early is the most common way farmers lose eligibility.`,
    `If a token launches, claim through the official ${p.name} app only, sell at most half in week one, and keep the rest staked (30 minutes to claim, about $15 gas).`,
  ];
  return {
    depositUsd,
    expectedDropUsd,
    feesUsd,
    hoursTotal,
    netUsd,
    netPerHourUsd,
    verdict,
    steps,
  };
}

// ------------------------------------------------------------ buildModel

export interface RowModel {
  /** Peringkat setelah diurutkan menurut impliedUsd desc (1-based). */
  rank: number;
  proto: Proto;
  /** true bila slug ada di watchlist snapshot. */
  watchlist: boolean;
  fittedMcapUsd: number;
  sizeMultiple: number;
  /** Odds blend final (0,5 x logistik + 0,5 x sel). */
  odds: number;
  logisticOdds: number;
  cellOdds: number;
  impliedUsd: number;
  rangeP25: number;
  rangeP75: number;
  rangeP10: number;
  rangeP90: number;
  /** Umur efektif (tahun): tercatat, atau median umur peer bila imputasi. */
  ageYears: number | null;
  /** true bila listed_at kosong sehingga umur diimputasi ke median peer. */
  ageImputed: boolean;
  /** true bila change_7d null (kolom info saja — bukan input model). */
  growthMissing: boolean;
  farm: FarmPlan;
}

export interface Ledger {
  ranked: number;
  tokenTrades: number;
  setAside: number;
  total: number;
}

export interface BuiltModel {
  rows: RowModel[];
  size: SizeFit;
  odds: OddsFit;
  termTests: TermTest[];
  categoryKept: boolean;
  categoryOffsets: Map<string, number>;
  ledger: Ledger;
  watchlistCovered: number;
  watchlistTotal: number;
  imputedAgeCount: number;
  missingGrowthCount: number;
  verdictCounts: Record<Verdict, number>;
  medianAge: number;
  totalImpliedUsd: number;
  topImpliedUsd: number;
  topSlug: string;
}

/**
 * buildModel (spec A.6): ranked = 40 watchlist (apa adanya dari snapshot,
 * urutan array watchlist) + 158 non-watchlist terbesar di bawah floor
 * (mcap null, TVL < floor_usd, urut TVL desc). Ledger 198/144/416/758.
 * Per baris: fitted = exp(a + b*ln(TVL) + catOff) dengan catOff 0 bila
 * kategori tidak kept; implied = fitted x odds; range = implied x exp(q);
 * urut implied desc.
 */
export function buildModel(snapshot: Snapshot): BuiltModel {
  const protocols = snapshot.protocols;
  const traded = tradedTokens(protocols);
  const peers = oddsPeers(protocols);
  const medianAge = median(peers.map((p) => ageYears(p.listed_at, snapshot.as_of) as number));
  const size = fitSizeCurve(traded);
  const odds = fitOdds(peers, snapshot.as_of);

  const catTest = testCategoryTerm(traded, size);
  const priceTest = testPriceTerms(traded, size, snapshot.as_of, medianAge);
  const termTests = [catTest, priceTest];
  const categoryKept = catTest.kept;
  const offsets: Map<string, number> = categoryKept
    ? categoryOffsets(traded, { a: size.a, b: size.b })
    : new Map<string, number>();

  // Ranked universe: watchlist dulu (urutan array watchlist snapshot),
  // lalu 158 non-watchlist terbesar di bawah floor.
  const bySlug = new Map<string, Proto>();
  for (const p of protocols) bySlug.set(p.slug, p);
  const watchSet = new Set(snapshot.watchlist);
  const rankedProtos: Proto[] = [];
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p !== undefined) rankedProtos.push(p);
  }
  const rest = protocols
    .filter(
      (p) =>
        !watchSet.has(p.slug) &&
        p.mcap_usd === null &&
        p.tvl_usd < snapshot.floor_usd,
    )
    .sort((x, y) => y.tvl_usd - x.tvl_usd)
    .slice(0, 158);
  rankedProtos.push(...rest);

  const tokenTrades = protocols.filter((p) => p.mcap_usd !== null).length;
  const ledger: Ledger = {
    ranked: rankedProtos.length,
    tokenTrades,
    setAside: protocols.length - rankedProtos.length - tokenTrades,
    total: protocols.length,
  };

  const verdictCounts: Record<Verdict, number> = {
    FARM: 0,
    THIN: 0,
    MARGINAL: 0,
    SKIP: 0,
  };
  let imputedAgeCount = 0;
  let missingGrowthCount = 0;
  const rows: RowModel[] = rankedProtos.map((p) => {
    const recorded = ageYears(p.listed_at, snapshot.as_of);
    const ageImputed = recorded === null;
    if (ageImputed) imputedAgeCount++;
    const growthMissing = p.change_7d === null;
    if (growthMissing) missingGrowthCount++;
    const catOff = categoryKept
      ? (offsets.get(p.category ?? "(none)") ?? 0)
      : 0;
    const fittedMcapUsd = Math.exp(
      size.a + size.b * Math.log(p.tvl_usd) + catOff,
    );
    const sizeMultiple = fittedMcapUsd / p.tvl_usd;
    const triple = oddsForRow(odds, p, snapshot.as_of);
    const impliedUsd = fittedMcapUsd * triple.odds;
    const farm = farmPlan(p, impliedUsd);
    verdictCounts[farm.verdict]++;
    return {
      rank: 0,
      proto: p,
      watchlist: watchSet.has(p.slug),
      fittedMcapUsd,
      sizeMultiple,
      odds: triple.odds,
      logisticOdds: triple.logisticOdds,
      cellOdds: triple.cellOdds,
      impliedUsd,
      rangeP25: impliedUsd * Math.exp(size.q25),
      rangeP75: impliedUsd * Math.exp(size.q75),
      rangeP10: impliedUsd * Math.exp(size.q10),
      rangeP90: impliedUsd * Math.exp(size.q90),
      ageYears: recorded,
      ageImputed,
      growthMissing,
      farm,
    };
  });

  rows.sort((x, y) => y.impliedUsd - x.impliedUsd);
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  const totalImpliedUsd = rows.reduce((s, r) => s + r.impliedUsd, 0);
  return {
    rows,
    size,
    odds,
    termTests,
    categoryKept,
    categoryOffsets: offsets,
    ledger,
    watchlistCovered: rows.filter((r) => r.watchlist).length,
    watchlistTotal: snapshot.watchlist.length,
    imputedAgeCount,
    missingGrowthCount,
    verdictCounts,
    medianAge,
    totalImpliedUsd,
    topImpliedUsd: rows.length > 0 ? rows[0].impliedUsd : 0,
    topSlug: rows.length > 0 ? rows[0].proto.slug : "",
  };
}
