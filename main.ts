// token-radar-01 — R3 (round3-fix): entrypoint.
// Node 22, standard library only. Reads the DefiLlama snapshot, runs the
// fitted model (lib/model.ts: buildModel), and writes board.json, data.js,
// dashboard/, screenshots/ and dossier.json to MAKEFUN_OUTPUT_DIR.
//
// Model (fix spec §2): log-log size curve x blended launch odds
// (logistic [age, ln TVL] + shrunk TVL-band x age-band cell rates, 50/50).
// Growth is NOT a model input anymore (placebo Brier = in-sample, §2.2).
// Row fields time_factor / growth_factor are REMOVED; logistic_odds and
// cell_odds are ADDED (3 decimals, like token_odds).
// This file holds no fitted numbers: every figure is computed from the
// snapshot at run time by lib/model.ts. Nothing here is hardcoded from §8.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModel, FARM_ASSUMPTIONS } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const COMPETITION = 'token-radar-01';
const ROUND = 3;
const MODEL_STRING =
  'log-log size curve x blended launch odds (logistic + shrunk cell rates, see evidence)';
const DEFAULT_INPUT = '/input/snapshot.json';
const DEFAULT_OUTPUT_DIR = '/output';
const EXPECTED_ROWS = 198;
const MAX_SCREENSHOT_BYTES = 512 * 1024;
const MAX_DOSSIER_BYTES = 1_500_000; // 1.5 MB gate (A.7)
const SCREENSHOT_NAMES = ['1-board.png', '2-detail.png', '3-filtered.png'];
const TEXT_MAX_BYTES = 65536;
const MODEL_BLEND_WEIGHT = 0.5; // fix spec §2.4: equal weight, chosen before seeing results
const MODEL_CELL_SHRINK_M = 20; // fix spec §2.3: pseudo-count toward the TVL-band rate

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- snapshot (A.2, verbatim)

interface Proto {
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

interface Snapshot {
  as_of: string;
  source?: string;
  floor_usd: number;
  protocols: Proto[];
  watchlist: string[];
}

// ---------------------------------------------------------------- model result (what buildModel must return, A.6/A.7)

type Verdict = 'FARM' | 'THIN' | 'MARGINAL' | 'SKIP';

interface FarmResult {
  depositUsd: number;
  expectedDropUsd: number;
  feesUsd: number;
  netUsd: number;
  netPerHourUsd: number;
  verdict: Verdict;
  steps: string[]; // exactly 8, template A.5
}

interface ModelRow {
  // Nested shape from lib/model.ts RowModel: identity lives in proto.
  proto?: Proto;
  slug?: string;
  name?: string;
  category?: string | null;
  chains?: string[];
  tvlUsd?: number;
  change7d?: number | null; // info column only — NOT a model input anymore (§2.2)
  ageYears: number | null; // null only when listed_at is missing (imputed by the model)
  ageImputed?: boolean;
  imputedAge?: boolean;
  watchlist: boolean;
  fittedMcapUsd: number;
  sizeMultiple: number;
  logisticOdds: number;
  cellOdds: number;
  tokenOdds?: number; // blended odds; `odds` is accepted as an alias
  odds?: number;
  impliedUsd: number;
  rangeP25?: number;
  rangeP75?: number;
  rangeP10?: number;
  rangeP90?: number;
  rangeP25Usd?: number;
  rangeP75Usd?: number;
  rangeP10Usd?: number;
  rangeP90Usd?: number;
  farm?: FarmResult;
  // Flattened farm economics (accepted when no `farm` object is present):
  depositUsd?: number;
  expectedDropUsd?: number;
  feesUsd?: number;
  netUsd?: number;
  netPerHourUsd?: number;
  verdict?: Verdict;
  farmPlan?: string[];
}

interface TermTest {
  term?: string;
  name?: string;
  looBase: number;
  looWith: number;
  wfBase: number;
  wfWith: number;
  kept: boolean;
}

interface SizeCurveEvidence {
  formula?: string;
  a: number;
  b: number;
  aSe: number;
  bSe: number;
  n: number;
}

interface Evidence {
  sizeCurve: SizeCurveEvidence;
  looMultiple: number;
  wfMultiple: number;
  flatLooMultiple: number;
  flatWfMultiple: number;
  oddsBrier: number;
  oddsCvBrier: number;
  oddsBaseBrier: number;
  oddsPlaceboBrier: number;
  oddsBaseRate: number;
  oddsN: number;
  oddsPositives: number;
  oddsLogisticCvBrier: number;
  oddsCellCvBrier: number;
  oddsBlendWeight?: number;
  oddsCellShrinkM?: number;
  rangeHoldP50: number;
  rangeHoldP80: number;
  termTests: TermTest[];
  categoryKept: boolean;
}

interface Ledger {
  ranked: number;
  tokenTrades: number;
  setAside: number;
  total: number;
}

interface VerdictCounts {
  FARM: number;
  THIN: number;
  MARGINAL: number;
  SKIP: number;
}

interface ScatterPoint {
  s: string;
  t: number;
  m: number;
}

interface ModelSize {
  a: number;
  b: number;
  aSe: number;
  bSe: number;
  n: number;
  looMultiple: number;
  wfMultiple: number;
  flatLooMultiple: number;
  flatWfMultiple: number;
  rangeHold50: number;
  rangeHold80: number;
}

interface ModelOdds {
  brier: number;
  cvBrier: number;
  baseBrier: number;
  placeboBrier: number;
  baseRate: number;
  n: number;
  positives: number;
  logisticCvBrier: number;
  cellCvBrier: number;
  blendWeight?: number;
  cellShrinkM?: number;
}

interface ModelResult {
  size: ModelSize;
  odds: ModelOdds;
  termTests: TermTest[];
  categoryKept: boolean;
  ledger: Ledger;
  watchlistCovered: number;
  watchlistTotal: number;
  imputedAgeCount: number;
  missingGrowthCount: number;
  verdictCounts: VerdictCounts;
  topImpliedUsd: number;
  topSlug: string;
  totalImpliedUsd?: number;
  rows: ModelRow[]; // sorted by impliedUsd desc (A.6 step 5)
}

// ---------------------------------------------------------------- output rows (board.json + data.js share one shape)

interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_years: number | null;
  age_imputed: boolean;
  watchlist: boolean;
  fitted_mcap_usd: number;
  size_multiple: number;
  logistic_odds: number;
  cell_odds: number;
  token_odds: number;
  implied_value_usd: number;
  range_p25_usd: number;
  range_p75_usd: number;
  range_p10_usd: number;
  range_p90_usd: number;
  verdict: Verdict;
  deposit_usd: number;
  expected_drop_usd: number;
  fees_usd: number;
  net_usd: number;
  net_per_hour_usd: number;
  farm_steps: string[];
}

interface TermTestJson {
  term: string;
  loo_base: number;
  loo_with: number;
  wf_base: number;
  wf_with: number;
  kept: boolean;
}

interface EvidenceJson {
  size_curve: { formula: string; a: number; b: number; a_se: number; b_se: number; n: number };
  loo_multiple: number;
  wf_multiple: number;
  flat_loo_multiple: number;
  flat_wf_multiple: number;
  odds_brier: number;
  odds_cv_brier: number;
  odds_base_brier: number;
  odds_placebo_brier: number;
  odds_base_rate: number;
  odds_n: number;
  odds_positives: number;
  odds_logistic_cv_brier: number;
  odds_cell_cv_brier: number;
  odds_blend_weight: number;
  odds_cell_shrink_m: number;
  range_hold_p50: number;
  range_hold_p80: number;
  term_tests: TermTestJson[];
  category_kept: boolean;
}

// ---------------------------------------------------------------- helpers

function fail(message: string): never {
  throw new Error(message);
}

function roundTo(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

/** A.7: money(n) = max(1, round(n)). Only for non-negative dollar amounts. */
function money(n: number): number {
  return Math.max(1, Math.round(n));
}

/** Short dollar figure for the final log line, e.g. $15.36M. */
function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

function parseInputArg(argv: string[]): string {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--input' && i + 1 < argv.length) return argv[i + 1]!;
    if (a.startsWith('--input=')) return a.slice('--input='.length);
  }
  return DEFAULT_INPUT;
}

/** --input may name the snapshot file or the directory holding snapshot.json. */
function resolveInputPath(input: string): string {
  let st;
  try {
    st = statSync(input);
  } catch {
    fail(`input ${input}: cannot be read`);
  }
  return st.isDirectory() ? join(input, 'snapshot.json') : input;
}

function readSnapshot(path: string): Snapshot {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    fail(`snapshot ${path}: cannot be read`);
  }
  let snap: Snapshot;
  try {
    snap = JSON.parse(raw) as Snapshot;
  } catch {
    fail(`snapshot ${path}: not valid JSON`);
  }
  if (!snap || typeof snap.as_of !== 'string' || !Array.isArray(snap.protocols)) {
    fail(`snapshot ${path}: not a token-radar snapshot (as_of/protocols missing)`);
  }
  return snap;
}

/** Blended token odds of a model row (tokenOdds, or the `odds` alias). */
function tokenOddsOf(row: ModelRow): number {
  const odds = row.tokenOdds ?? row.odds;
  if (odds === undefined || !Number.isFinite(odds)) {
    fail(`row ${row.slug}: model row carries no token odds`);
  }
  return odds;
}

/** Farm economics of a model row: nested `farm` object, or flattened fields. */
function farmOf(row: ModelRow): FarmResult {
  if (row.farm !== undefined) return row.farm;
  if (
    row.verdict === undefined ||
    row.depositUsd === undefined ||
    row.expectedDropUsd === undefined ||
    row.feesUsd === undefined ||
    row.netUsd === undefined ||
    row.netPerHourUsd === undefined
  ) {
    fail(`row ${row.slug}: model row carries neither a farm object nor flattened farm economics`);
  }
  return {
    depositUsd: row.depositUsd,
    expectedDropUsd: row.expectedDropUsd,
    feesUsd: row.feesUsd,
    netUsd: row.netUsd,
    netPerHourUsd: row.netPerHourUsd,
    verdict: row.verdict,
    steps: row.farmPlan ?? [],
  };
}

function countVerdicts(rows: BoardRow[]): VerdictCounts {
  const counts: VerdictCounts = { FARM: 0, THIN: 0, MARGINAL: 0, SKIP: 0 };
  for (const row of rows) counts[row.verdict]++;
  return counts;
}

// ---------------------------------------------------------------- serialization (A.7)

/** Build the Evidence object from the fields buildModel actually returns
 * (model.size / model.odds / model.termTests / model.categoryKept).
 * Rounding stays in serializeEvidence (3 decimals, multiples 2 decimals). */
function buildEvidence(model: ModelResult): Evidence {
  return {
    sizeCurve: {
      a: model.size.a,
      b: model.size.b,
      aSe: model.size.aSe,
      bSe: model.size.bSe,
      n: model.size.n,
    },
    looMultiple: model.size.looMultiple,
    wfMultiple: model.size.wfMultiple,
    flatLooMultiple: model.size.flatLooMultiple,
    flatWfMultiple: model.size.flatWfMultiple,
    oddsBrier: model.odds.brier,
    oddsCvBrier: model.odds.cvBrier,
    oddsBaseBrier: model.odds.baseBrier,
    oddsPlaceboBrier: model.odds.placeboBrier,
    oddsBaseRate: model.odds.baseRate,
    oddsN: model.odds.n,
    oddsPositives: model.odds.positives,
    oddsLogisticCvBrier: model.odds.logisticCvBrier,
    oddsCellCvBrier: model.odds.cellCvBrier,
    oddsBlendWeight: model.odds.blendWeight,
    oddsCellShrinkM: model.odds.cellShrinkM,
    rangeHoldP50: model.size.rangeHold50,
    rangeHoldP80: model.size.rangeHold80,
    termTests: model.termTests,
    categoryKept: model.categoryKept,
  };
}

function serializeEvidence(ev: Evidence): EvidenceJson {
  const sc = ev.sizeCurve;
  const a = roundTo(sc.a, 3);
  const b = roundTo(sc.b, 3);
  return {
    size_curve: {
      formula: sc.formula ?? `ln(mcap) = ${a.toFixed(3)} + ${b.toFixed(3)} × ln(TVL)`,
      a,
      b,
      a_se: roundTo(sc.aSe, 3),
      b_se: roundTo(sc.bSe, 3),
      n: sc.n,
    },
    loo_multiple: roundTo(ev.looMultiple, 2),
    wf_multiple: roundTo(ev.wfMultiple, 2),
    flat_loo_multiple: roundTo(ev.flatLooMultiple, 2),
    flat_wf_multiple: roundTo(ev.flatWfMultiple, 2),
    odds_brier: roundTo(ev.oddsBrier, 3),
    odds_cv_brier: roundTo(ev.oddsCvBrier, 3),
    odds_base_brier: roundTo(ev.oddsBaseBrier, 3),
    odds_placebo_brier: roundTo(ev.oddsPlaceboBrier, 3),
    odds_base_rate: roundTo(ev.oddsBaseRate, 3),
    odds_n: ev.oddsN,
    odds_positives: ev.oddsPositives,
    // New in the fix (§2.4): component CV Briers, blend weight, shrink m.
    odds_logistic_cv_brier: roundTo(ev.oddsLogisticCvBrier, 3),
    odds_cell_cv_brier: roundTo(ev.oddsCellCvBrier, 3),
    odds_blend_weight: ev.oddsBlendWeight ?? MODEL_BLEND_WEIGHT,
    odds_cell_shrink_m: ev.oddsCellShrinkM ?? MODEL_CELL_SHRINK_M,
    range_hold_p50: roundTo(ev.rangeHoldP50, 3),
    range_hold_p80: roundTo(ev.rangeHoldP80, 3),
    term_tests: ev.termTests.map((t) => ({
      term: t.term ?? t.name ?? '',
      loo_base: roundTo(t.looBase, 3),
      loo_with: roundTo(t.looWith, 3),
      wf_base: roundTo(t.wfBase, 3),
      wf_with: roundTo(t.wfWith, 3),
      kept: t.kept,
    })),
    category_kept: ev.categoryKept,
  };
}

function serializeRows(rows: ModelRow[]): BoardRow[] {
  const out: BoardRow[] = [];
  let prev = Number.POSITIVE_INFINITY;
  rows.forEach((row, i) => {
    // RowModel (lib/model.ts) is nested: identity lives in row.proto and
    // ranges are row.rangeP25/P75/P10/P90; the flat names stay as fallback.
    const proto = row.proto;
    const slug = proto?.slug ?? row.slug ?? '';
    const name = proto?.name ?? row.name ?? '';
    const category = proto?.category ?? row.category ?? null;
    const chains = proto?.chains ?? row.chains ?? [];
    const tvlUsd = proto?.tvl_usd ?? row.tvlUsd ?? 0;
    const change7d = proto?.change_7d ?? row.change7d ?? null;
    const ageImputed = row.ageImputed ?? row.imputedAge ?? false;
    const rangeP25Usd = row.rangeP25 ?? row.rangeP25Usd ?? 0;
    const rangeP75Usd = row.rangeP75 ?? row.rangeP75Usd ?? 0;
    const rangeP10Usd = row.rangeP10 ?? row.rangeP10Usd ?? 0;
    const rangeP90Usd = row.rangeP90 ?? row.rangeP90Usd ?? 0;
    const farm = farmOf(row);
    const tokenOdds = tokenOddsOf(row);
    if (farm.steps.length !== 8) {
      fail(`row ${slug}: farm plan has ${farm.steps.length} steps, expected 8 (A.5)`);
    }
    // token_odds must be checkable from its two components (§2.4):
    // blend = 0.5 x logistic + 0.5 x cell, up to rounding.
    const blendCheck = 0.5 * row.logisticOdds + 0.5 * row.cellOdds;
    if (Math.abs(blendCheck - tokenOdds) > 0.002) {
      fail(
        `row ${slug}: token_odds ${tokenOdds} is not the 50/50 blend of ` +
          `logistic_odds ${row.logisticOdds} and cell_odds ${row.cellOdds}`,
      );
    }
    // implied_value_usd, rounded and forced strictly non-increasing (A.7).
    let implied = money(row.impliedUsd);
    if (implied >= prev) implied = prev - 1;
    if (implied < 1) {
      fail(`row ${slug}: implied value underflows the strictly non-increasing rule`);
    }
    prev = implied;
    out.push({
      rank: i + 1,
      slug,
      name,
      category,
      chains,
      tvl_usd: tvlUsd,
      change_7d: change7d,
      age_years: row.ageYears === null ? null : roundTo(row.ageYears, 2),
      age_imputed: ageImputed,
      watchlist: row.watchlist,
      fitted_mcap_usd: money(row.fittedMcapUsd),
      size_multiple: roundTo(row.sizeMultiple, 3),
      logistic_odds: roundTo(row.logisticOdds, 3),
      cell_odds: roundTo(row.cellOdds, 3),
      token_odds: roundTo(tokenOdds, 3),
      implied_value_usd: implied,
      range_p25_usd: money(rangeP25Usd),
      range_p75_usd: money(rangeP75Usd),
      range_p10_usd: money(rangeP10Usd),
      range_p90_usd: money(rangeP90Usd),
      verdict: farm.verdict,
      deposit_usd: money(farm.depositUsd),
      expected_drop_usd: money(farm.expectedDropUsd),
      fees_usd: money(farm.feesUsd),
      // net keeps its sign (SKIP rows go negative); money() would corrupt it.
      net_usd: Math.round(farm.netUsd),
      net_per_hour_usd: roundTo(farm.netPerHourUsd, 2),
      farm_steps: farm.steps,
    });
  });
  return out;
}

// ---------------------------------------------------------------- gates (A.7)

function gateScreenshots(outDir: string): void {
  const dir = join(outDir, 'screenshots');
  let names: string[];
  try {
    names = readdirSync(dir).sort();
  } catch {
    fail('screenshots/: cannot be read after copy');
  }
  if (names.length !== SCREENSHOT_NAMES.length) {
    fail(`screenshots/: expected exactly ${SCREENSHOT_NAMES.length} files, found ${names.length} (${names.join(', ')})`);
  }
  for (const name of SCREENSHOT_NAMES) {
    if (!names.includes(name)) fail(`screenshots/: missing ${name}`);
    const size = statSync(join(dir, name)).size;
    if (size === 0) fail(`screenshots/${name}: empty`);
    if (size > MAX_SCREENSHOT_BYTES) {
      fail(`screenshots/${name}: ${size} bytes, over the ${MAX_SCREENSHOT_BYTES} byte cap`);
    }
  }
}

// ---------------------------------------------------------------- main

function main(): void {
  const inputPath = resolveInputPath(parseInputArg(process.argv.slice(2)));
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const snapshot = readSnapshot(inputPath);
  const model = buildModel(snapshot) as ModelResult;

  const evidence = serializeEvidence(buildEvidence(model));
  const rows = serializeRows(model.rows);

  // Gates on the model itself — fail loudly instead of writing a bad board.
  if (rows.length !== EXPECTED_ROWS) {
    fail(`expected ${EXPECTED_ROWS} rows, got ${rows.length}`);
  }
  const ledger = model.ledger;
  if (ledger.ranked !== rows.length) {
    fail(`ledger ranked ${ledger.ranked} does not match ${rows.length} rows`);
  }
  if (ledger.ranked + ledger.tokenTrades + ledger.setAside !== ledger.total) {
    fail(`ledger does not add up: ${ledger.ranked} + ${ledger.tokenTrades} + ${ledger.setAside} != ${ledger.total}`);
  }
  if (model.watchlistCovered !== model.watchlistTotal) {
    fail(`watchlist ${model.watchlistCovered}/${model.watchlistTotal}, expected full coverage`);
  }
  const verdictCounts = countVerdicts(rows);
  for (const key of ['FARM', 'THIN', 'MARGINAL', 'SKIP'] as const) {
    if (model.verdictCounts[key] !== verdictCounts[key]) {
      fail(`verdictCounts ${key}: model says ${model.verdictCounts[key]}, rows say ${verdictCounts[key]}`);
    }
  }
  if (model.topSlug !== rows[0]!.slug) {
    fail(`top slug mismatch: model says ${model.topSlug}, top row is ${rows[0]!.slug}`);
  }

  const topImpliedUsd = model.topImpliedUsd ?? rows[0]!.implied_value_usd;
  const impliedTotalUsd =
    model.totalImpliedUsd ?? rows.reduce((sum, row) => sum + row.implied_value_usd, 0);

  const scatter: ScatterPoint[] = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0)
    .map((p) => ({ s: p.slug, t: p.tvl_usd, m: p.mcap_usd! }));

  const board = {
    competition: COMPETITION,
    round: ROUND,
    as_of: snapshot.as_of,
    model: MODEL_STRING,
    rows,
  };
  const data = {
    asOf: snapshot.as_of,
    floorUsd: snapshot.floor_usd,
    evidence,
    ledger,
    watchlistCovered: model.watchlistCovered,
    watchlistTotal: model.watchlistTotal,
    imputedAgeCount: model.imputedAgeCount,
    missingGrowthCount: model.missingGrowthCount,
    verdictCounts,
    farmAssumptions: FARM_ASSUMPTIONS,
    topImpliedUsd,
    topSlug: model.topSlug,
    impliedTotalUsd,
    scatter,
    rows,
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify(board, null, 2)}\n`, 'utf8');
  writeFileSync(join(outDir, 'data.js'), `window.RADAR_DATA = ${JSON.stringify(data, null, 2)};\n`, 'utf8');
  cpSync(join(REPO_ROOT, 'dashboard'), join(outDir, 'dashboard'), { recursive: true, dereference: true });
  cpSync(join(REPO_ROOT, 'screenshots'), join(outDir, 'screenshots'), { recursive: true, dereference: true });

  if (!existsSync(join(outDir, 'dashboard', 'index.html'))) {
    fail('dashboard/index.html missing after copy');
  }
  gateScreenshots(outDir);

  const dossierBytes = buildDossier(outDir, { text_max_bytes: TEXT_MAX_BYTES });
  writeFileSync(join(outDir, 'dossier.json'), dossierBytes);
  if (dossierBytes.length > MAX_DOSSIER_BYTES) {
    fail(`dossier.json is ${dossierBytes.length} bytes, over the ${MAX_DOSSIER_BYTES} byte cap`);
  }

  console.log(
    `token-radar-01 R3: ${rows.length} rows, top ${rows[0]!.slug} ${fmtUsd(rows[0]!.implied_value_usd)}, ` +
      `LOO x${evidence.loo_multiple.toFixed(2)} WF x${evidence.wf_multiple.toFixed(2)} ` +
      `(flat x${evidence.flat_loo_multiple.toFixed(2)}/x${evidence.flat_wf_multiple.toFixed(2)}), ` +
      `Brier ${evidence.odds_cv_brier.toFixed(3)} vs base ${evidence.odds_base_brier.toFixed(3)}, ` +
      `ledger ${ledger.ranked}/${ledger.tokenTrades}/${ledger.setAside}, dossier ${dossierBytes.length} bytes`,
  );
}

try {
  main();
} catch (err) {
  console.error(`token-radar-01 R3: FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
