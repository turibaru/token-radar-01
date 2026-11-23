// token-radar-01 R3 — entrypoint. Node 22, standard library only.
// Reads /input/snapshot.json (or --input <file|dir>), writes
// /output/board.json (198 rows), /output/data.js (the dashboard's data),
// copies dashboard/ and screenshots/ to /output, and writes
// /output/dossier.json with buildDossier from vendor/makefun-board.ts.
// Deterministic: two runs write byte-identical board.json + dossier.json.
// Exits non-zero on any failure.

import { buildDossier } from './vendor/makefun-board.ts';
import { buildModel } from './lib/model.ts';
import type { Snapshot } from './lib/model.ts';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

function fail(msg: string): never {
  console.error(`token-radar-01: ${msg}`);
  process.exit(1);
}

function parseArgs(argv: string[]): { input: string; output: string } {
  let input = '/input/snapshot.json';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && argv[i + 1]) input = argv[++i]!;
  }
  const output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  return { input, output };
}

function readSnapshot(input: string): Snapshot {
  let path = input;
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'snapshot.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    fail(`cannot read snapshot at ${path}`);
  }
  let snap: Snapshot;
  try {
    snap = JSON.parse(raw!) as Snapshot;
  } catch {
    fail(`snapshot at ${path} is not valid JSON`);
  }
  if (!Array.isArray(snap!.protocols) || !Array.isArray(snap!.watchlist)) {
    fail('snapshot has no protocols/watchlist arrays');
  }
  return snap!;
}

function money(n: number): number {
  return Math.max(1, Math.round(n));
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function main(): void {
  const { input, output } = parseArgs(process.argv.slice(2));
  const snap = readSnapshot(input);
  const model = buildModel(snap);
  if (model.rows.length !== 198) fail(`expected 198 ranked rows, got ${model.rows.length}`);
  if (model.watchlistCovered !== model.watchlistTotal) {
    fail(`watchlist coverage ${model.watchlistCovered}/${model.watchlistTotal}`);
  }

  // Rank by implied value; enforce strictly non-increasing rounded values.
  let prev = Number.POSITIVE_INFINITY;
  const rows = model.rows.map((r, i) => {
    let value = money(r.impliedUsd);
    if (value >= prev) value = prev - 1;
    prev = value;
    const p = r.proto;
    return {
      slug: p.slug,
      name: p.name,
      rank: i + 1,
      implied_value_usd: value,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_years: r.ageYears === null ? null : Math.round(r.ageYears * 100) / 100,
      age_imputed: r.ageImputed,
      watchlist: snap.watchlist.includes(p.slug),
      fitted_mcap_usd: money(r.fittedMcapUsd),
      size_multiple: Math.round(r.sizeMultiple * 1000) / 1000,
      token_odds: Math.round(r.odds * 1000) / 1000,
      time_factor: Math.round(r.timeFactor * 1000) / 1000,
      growth_factor: Math.round(r.growthFactor * 1000) / 1000,
      range_p25_usd: money(r.rangeP25),
      range_p75_usd: money(r.rangeP75),
      range_p10_usd: money(r.rangeP10),
      range_p90_usd: money(r.rangeP90),
      verdict: r.farm.verdict,
      deposit_usd: r.farm.depositUsd,
      expected_drop_usd: r.farm.expectedDropUsd,
      fees_usd: r.farm.feesUsd,
      net_usd: r.farm.netUsd,
      net_per_hour_usd: r.farm.netPerHourUsd,
      farm_steps: r.farm.steps,
    };
  });

  const top = rows[0]!;
  const evidence = {
    size_curve: {
      formula: `ln(mcap) = ${model.size.a.toFixed(3)} + ${model.size.b.toFixed(3)} x ln(TVL)`,
      a: Math.round(model.size.a * 1000) / 1000,
      b: Math.round(model.size.b * 1000) / 1000,
      a_se: Math.round(model.size.aSe * 1000) / 1000,
      b_se: Math.round(model.size.bSe * 1000) / 1000,
      n: model.size.n,
    },
    loo_multiple: Math.round(model.size.looMultiple * 100) / 100,
    wf_multiple: Math.round(model.size.wfMultiple * 100) / 100,
    flat_loo_multiple: Math.round(model.size.flatLooMultiple * 100) / 100,
    flat_wf_multiple: Math.round(model.size.flatWfMultiple * 100) / 100,
    odds_brier: Math.round(model.odds.brier * 1000) / 1000,
    odds_cv_brier: Math.round(model.odds.cvBrier * 1000) / 1000,
    odds_base_brier: Math.round(model.odds.baseBrier * 1000) / 1000,
    odds_placebo_brier: Math.round(model.odds.placeboBrier * 1000) / 1000,
    odds_base_rate: Math.round(model.odds.baseRate * 1000) / 1000,
    odds_n: model.odds.n,
    odds_positives: model.odds.positives,
    range_hold_p50: Math.round(model.size.rangeHold50 * 1000) / 1000,
    range_hold_p80: Math.round(model.size.rangeHold80 * 1000) / 1000,
    term_tests: model.termTests.map((t) => ({
      term: t.term,
      loo_base: Math.round(t.looBase * 1000) / 1000,
      loo_with: Math.round(t.looWith * 1000) / 1000,
      wf_base: Math.round(t.wfBase * 1000) / 1000,
      wf_with: Math.round(t.wfWith * 1000) / 1000,
      kept: t.kept,
    })),
    category_kept: model.categoryKept,
  };

  const board = {
    competition: 'token-radar-01',
    round: 3,
    as_of: snap.as_of,
    model: 'log-log size curve x fitted launch odds (see evidence)',
    rows,
  };

  const data = {
    asOf: snap.as_of,
    floorUsd: snap.floor_usd,
    evidence,
    ledger: model.ledger,
    watchlistCovered: model.watchlistCovered,
    watchlistTotal: model.watchlistTotal,
    imputedAgeCount: model.imputedAgeCount,
    missingGrowthCount: model.missingGrowthCount,
    verdictCounts: model.verdictCounts,
    farmAssumptions:
      'Deposit 0.01% of TVL, clamped to $1K–$20K. Drop pool 7% of implied value, split among ~250 active farmers; 12-week horizon, 1.5 h/week (18 h); fees $45 bridge + $12/week gas + 0.3% x 4 swaps. FARM: net >= $1,500 and >= $75/h. THIN: net >= $300 and >= $15/h. MARGINAL: net > $0. Else SKIP.',
    topImpliedUsd: top.implied_value_usd,
    topSlug: top.slug,
    impliedTotalUsd: rows.reduce((s, r) => s + r.implied_value_usd, 0),
    // Scatter points: traded tokens (positive recorded mcap), for the
    // log-log chart. Kept out of board.json; the dashboard only.
    scatter: snap.protocols
      .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0)
      .map((p) => ({ s: p.slug, t: p.tvl_usd, m: p.mcap_usd })),
    rows,
  };

  mkdirSync(output, { recursive: true });
  mkdirSync(join(output, 'dashboard'), { recursive: true });
  mkdirSync(join(output, 'screenshots'), { recursive: true });

  writeFileSync(join(output, 'board.json'), JSON.stringify(board, null, 2) + '\n', 'utf8');
  writeFileSync(join(output, 'data.js'), `window.RADAR_DATA = ${JSON.stringify(data)};\n`, 'utf8');

  const root = new URL('.', import.meta.url).pathname;
  cpSync(join(root, 'dashboard'), join(output, 'dashboard'), { recursive: true });
  cpSync(join(root, 'screenshots'), join(output, 'screenshots'), { recursive: true });

  // Verify the copies landed before the dossier is built from them.
  const dashFiles = readdirSync(join(output, 'dashboard'));
  if (!dashFiles.includes('index.html')) fail('dashboard/index.html missing after copy');
  const shots = readdirSync(join(output, 'screenshots')).filter((f) => !f.startsWith('.'));
  if (shots.length !== 3) fail(`expected 3 screenshots, got ${shots.length}`);
  for (const s of shots) {
    const st = statSync(join(output, 'screenshots', s));
    if (st.size > 512 * 1024) fail(`screenshot ${s} is ${st.size} bytes, over 512 KiB`);
    if (st.size === 0) fail(`screenshot ${s} is empty`);
  }

  writeFileSync(join(output, 'dossier.json'), buildDossier(output, { text_max_bytes: 65536 }));
  const dossierSize = statSync(join(output, 'dossier.json')).size;
  if (dossierSize > 1500000) fail(`dossier.json is ${dossierSize} bytes, over the 1.5 MiB gate cap`);

  console.log(
    `token-radar-01 R3: ${rows.length} rows, top ${top.slug} ${fmtUsd(top.implied_value_usd)}, ` +
      `LOO x${evidence.loo_multiple} WF x${evidence.wf_multiple} ` +
      `(flat x${evidence.flat_loo_multiple}/x${evidence.flat_wf_multiple}), ` +
      `Brier ${evidence.odds_brier} vs base ${evidence.odds_base_brier}, ` +
      `ledger ${model.ledger.ranked}/${model.ledger.tokenTrades}/${model.ledger.setAside}, ` +
      `dossier ${dossierSize} bytes`,
  );
}

main();
