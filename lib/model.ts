// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks every rankable pre-token protocol in the snapshot: the 40 watchlist slugs plus
// every other pre-token protocol below the floor that is not a wrapped, staked or bridged product
// of a token that already trades, not a CEX, and not a versioned pool. Live-token protocols are
// kept apart and shown with the market's own value, never mixed into the ranking.
//
// Implied value is a comparables model, computed only from the snapshot's own figures:
//
//   comp     = the median mcap/TVL ratio of the live-token protocols in the same category
//              (at least 3 comparables, else the all-category median; clamped to [0.05, 1.50])
//   base     = tvl_usd x comp
//   growth   = clamp(change_7d, -60, 120) per cent
//   growthMx = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   implied  = max(1, round(base x growthMx x maturity))
//
// change_7d is the snapshot's 7-day TVL change (DefiLlama's /protocols field: the change in total
// value locked, not a token price — a pre-token protocol has no price to change). The momentum
// factor is therefore TVL momentum, not price momentum: it rewards a protocol for growing its
// locked value, and it is bounded — the clamp plus the 0.5 weight put growthMx in [0.7, 1.6], so
// no row is ever more than 1.6x its base on momentum, and the snapshot's largest 7-day TVL jump
// (+4,448%) is capped to that 1.6x. Ablation (STATUS.md): dropping momentum moves the top 20 by
// at most 2 ranks (Spearman 0.9957), so momentum is a tie-breaker, not the ranker; the
// comparables are (dropping per-category comps moves the top 20 by up to 40 ranks).
//
// Every row carries its factor waterfall (base -> after momentum -> final) so a reader can see
// what each multiplier contributed, and every category's comparables carry N, the interquartile
// range, the leave-one-out median range, and the member list, so a reader can check the multiple
// behind any row. Two limits are disclosed, not hidden: 102 of 198 rows fall back to the
// all-category median (their category has fewer than 3 live-token comparables), and the comp pool
// is only 128 of the snapshot's 416 live-token protocols (272 record no market cap), so the
// medians describe the tokens live and priced on the snapshot date — survivorship bias is inherent
// to a sealed snapshot, and the small-N categories (N = 3-4) are fragile: their leave-one-out
// median can move by 50% or more (Indexes: 649% — see STATUS.md).

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  min_comps: number;
  comp_floor: number;
  comp_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  min_comps: 3,
  comp_floor: 0.05,
  comp_cap: 1.5,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3-waterfall';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    comp_ratio: number;
    comp_category: string;
    comp_count: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    /** The factor waterfall: TVL x comp, then after the momentum multiplier, then the final
     *  implied value (after maturity). The stored multipliers are rounded to 4 decimals for
     *  display, so base x growth_multiplier reproduces after_momentum_usd only to within that
     *  rounding (up to ~$30k on the largest rows); the exact recomputation uses the unrounded
     *  multipliers, as the dashboard's impliedOf does — and it lands on implied_value_usd exactly. */
    base_implied_usd: number;
    after_momentum_usd: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  comp_ratio: number;
  comp_category: string;
  growth_multiplier: number;
  maturity_multiplier: number;
  /** The factor waterfall, as in BoardRow.model: base implied, then after momentum. */
  base_implied_usd: number;
  after_momentum_usd: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One comparables row: the category, its median mcap/TVL, how many live protocols back it, the
 *  spread of those protocols' ratios, and the members themselves — so a reader can check the
 *  multiple instead of taking it on trust. `used` is false for a category with fewer than
 *  min_comps live protocols: its rows fall back to the all-category median, and the table says so
 *  instead of silently printing a median nobody used. median_ratio is the clamped multiple for a
 *  used category; for an unused one it is the raw median, shown for inspection only. */
export interface CompRow {
  category: string;
  median_ratio: number;
  count: number;
  used: boolean;
  q1_ratio: number;
  q3_ratio: number;
  /** The range of the median when any single comparable is dropped (clamped like the median). */
  loo_low_ratio: number;
  loo_high_ratio: number;
  members: { slug: string; ratio: number }[];
}

/** Everything the dashboard needs: the board, the live set, the comparables, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  comps: CompRow[];
  overall_ratio: number;
  overall_q1_ratio: number;
  overall_q3_ratio: number;
  /** Live-token protocols in the snapshot (416) vs the ones with a usable mcap/TVL ratio (128):
   *  the gap is the coverage limit the dashboard discloses. */
  comp_pool_size: number;
  live_token_count: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list, else `fallback`. */
function median(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** An exchange's name at the start of a protocol name: its own product, not a launch of its own. */
const EXCHANGE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** A whole word that marks a wrapped, staked or staking product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** Categories that are a product of a token that already trades, or an exchange itself. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool, not a wrapped/staked/bridged product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !EXCHANGE.test(p.name) &&
    !WRAPPED_WORD.test(p.name)
  );
}

/** A quartile of a sorted list, by linear interpolation (the same rule the dashboard's text
 *  quotes); the median of a one-element list is that element. */
function quartile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo]! * (1 - (i - lo)) + sorted[hi]! * (i - lo);
}

/** One category's comparables, with the spread a reader needs to judge the median: the
 *  interquartile range and the range of the median when any single comparable is dropped. A
 *  symmetric trim of the list cannot change its median (it keeps the middle element(s)), so no
 *  trimmed median is offered: it would be the same number under another name. */
export interface CategoryComps {
  ratio: number;
  count: number;
  q1: number;
  q3: number;
  looLow: number;
  looHigh: number;
  members: { slug: string; ratio: number }[];
}

/** The comparables: per-category median mcap/TVL of live-token protocols, plus the all-category median.
 *  Only live-token protocols can be comparables — a pre-token protocol has no market cap — so no
 *  board row can ever be its own comparable: buildBoard ranks pre-token protocols only, and this
 *  function skips every pre-token protocol. Self-inclusion is impossible by construction, not by
 *  a filter that could drift. `byCategory` holds every category with live ratios, used or not;
 *  a category is usable as a multiple only when it has at least min_comps members. */
export function buildComps(snapshot: Snapshot, model: ModelConstants): {
  byCategory: Map<string, CategoryComps>;
  overall: number;
  overallQ1: number;
  overallQ3: number;
  poolSize: number;
  liveCount: number;
} {
  const byCat = new Map<string, { slug: string; ratio: number }[]>();
  const all: number[] = [];
  let liveCount = 0;
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) continue;
    liveCount++;
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? 'Other';
    const list = byCat.get(key) ?? [];
    list.push({ slug: p.slug, ratio });
    byCat.set(key, list);
  }
  const allSorted = [...all].sort((a, b) => a - b);
  const overall = clamp(median(all, 0.25), model.comp_floor, model.comp_cap);
  const byCategory = new Map<string, CategoryComps>();
  for (const [cat, list] of byCat) {
    const ratios = list.map((m) => m.ratio).sort((a, b) => a - b);
    const loos = ratios.map((_, i) => clamp(median(ratios.filter((__, j) => j !== i), overall), model.comp_floor, model.comp_cap));
    byCategory.set(cat, {
      // A used multiple is clamped to [comp_floor, comp_cap]; an unused category's median is
      // shown raw (never applied to any row), so the table never prints a clamped number nobody used.
      ratio: list.length >= model.min_comps ? clamp(median(ratios, overall), model.comp_floor, model.comp_cap) : round4(median(ratios, overall)),
      count: list.length,
      q1: round4(quartile(ratios, 0.25)),
      q3: round4(quartile(ratios, 0.75)),
      looLow: round4(Math.min(...loos)),
      looHigh: round4(Math.max(...loos)),
      members: [...list].sort((a, b) => a.ratio - b.ratio).map((m) => ({ slug: m.slug, ratio: round4(m.ratio) })),
    });
  }
  return { byCategory, overall, overallQ1: round4(quartile(allSorted, 0.25)), overallQ3: round4(quartile(allSorted, 0.75)), poolSize: all.length, liveCount };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** The comparables multiple one protocol gets: its category's median when the category has at
 *  least min_comps live protocols, else the all-category median. */
export function compFor(p: SnapshotProtocol, comps: { byCategory: Map<string, CategoryComps>; overall: number }, minComps: number): { ratio: number; category: string; count: number } {
  const hit = comps.byCategory.get(p.category ?? 'Other');
  if (hit !== undefined && hit.count >= minComps) return { ratio: hit.ratio, category: p.category ?? 'Other', count: hit.count };
  return { ratio: comps.overall, category: 'all categories', count: 0 };
}

/** The three multipliers and the implied value one protocol gets under `model`, with the factor
 *  waterfall: base (TVL x comp), after momentum, and the final implied value (after maturity). */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  comps: { byCategory: Map<string, CategoryComps>; overall: number },
): { implied: number; base: number; afterMomentum: number; compRatio: number; compCategory: string; compCount: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  // The ratio is rounded to 4 decimals here, so the dashboard's recomputation of a row from
  // data.js (which carries the rounded ratio) lands on exactly the board's number.
  const { ratio: rawRatio, category, count } = compFor(protocol, comps, model.min_comps);
  const ratio = round4(rawRatio);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (clamp(ageForModel, 0, model.maturity_days) / model.maturity_days) * model.maturity_range;
  const base = protocol.tvl_usd * ratio;
  const afterMomentum = base * growthMult;
  const implied = Math.max(1, Math.round(afterMomentum * maturityMult));
  return { implied, base: Math.max(1, Math.round(base)), afterMomentum: Math.max(1, Math.round(afterMomentum)), compRatio: ratio, compCategory: category, compCount: count, growthPct, growthMult, maturityMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = buildComps(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol below the watchlist floor. The board
  // ranks the whole rankable universe, not a hand-picked slice of it.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, comps);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      comp_ratio: round4(s.compRatio),
      comp_category: s.compCategory,
      comp_count: s.compCount,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
      base_implied_usd: s.base,
      after_momentum_usd: s.afterMomentum,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** One category rule: the keywords that select it, the farm action it writes, and the weekly action. */
interface CategoryRule {
  /** Substrings of the lowercased category that select this rule, in priority order. */
  keywords: string[];
  /** Substrings that select this rule for the weekly action; when absent, `keywords` is used. */
  weeklyKeywords?: string[];
  /** The farm action, given the protocol name, the capital and the chain. */
  action: (name: string, capital: number, chain: string) => string;
  /** The weekly qualifying action, in one short phrase. */
  weekly: string;
}

/**
 * The category rules, one table for both the farm action and the weekly action, so the two never
 * drift apart: a category's action and its weekly action are the same rule's two faces. The first
 * rule whose keyword appears in the lowercased category wins; a protocol whose category matches
 * nothing falls through to the generic deposit rule at the end.
 */
const CATEGORY_RULES: CategoryRule[] = [
  {
    keywords: ['lend', 'cdp', 'collateral'],
    action: (name, capital, chain) => `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`,
    weekly: 'a borrow, a repay or a fresh supply',
  },
  {
    keywords: ['dex', 'yield', 'leveraged farm'],
    // The weekly action never named leveraged farming: a leveraged farm's week is the generic one.
    weeklyKeywords: ['dex', 'yield'],
    action: (name, capital, chain) => `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`,
    weekly: 'a swap, a fresh liquidity add or a fee claim',
  },
  {
    keywords: ['bridge'],
    action: (name, capital, chain) => `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`,
    weekly: 'a deposit, a borrow, a swap or a vote',
  },
  {
    keywords: ['staking', 'restak'],
    action: (name, capital, chain) => `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`,
    weekly: 'a deposit, a borrow, a swap or a vote',
  },
  {
    keywords: ['perpetual', 'derivative'],
    action: (name, capital, chain) => `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`,
    weekly: 'a small trade or a funding-fee settlement',
  },
  {
    keywords: ['prediction'],
    action: (name, capital, chain) => `Fund $${capital} and place one market position on ${name}.`,
    weekly: 'a new market position or a settlement claim',
  },
  {
    keywords: ['curator', 'allocator'],
    action: (name, capital, chain) => `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`,
    weekly: 'a fresh vault deposit or a rebalance vote',
  },
  {
    keywords: ['stable'],
    action: (name, capital, chain) => `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`,
    weekly: 'a mint, a redemption or a peg check',
  },
  {
    keywords: ['rwa'],
    action: (name, capital, chain) => `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`,
    weekly: 'a mint, a redemption or a yield claim',
  },
  {
    keywords: ['insurance'],
    action: (name, capital, chain) => `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`,
    weekly: 'a deposit, a borrow, a swap or a vote',
  },
  {
    keywords: ['basis'],
    action: (name, capital, chain) => `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and hold the position.`,
    weekly: 'a deposit, a borrow, a swap or a vote',
  },
  {
    keywords: ['farm'],
    action: (name, capital, chain) => `Deposit $${capital} into ${name}'s farm on ${chain} and keep the position open.`,
    weekly: 'a deposit, a borrow, a swap or a vote',
  },
];

/** The first rule whose keyword appears in the lowercased category, or null. */
function ruleFor(category: string | null, weekly = false): CategoryRule | null {
  const c = (category ?? '').toLowerCase();
  for (const rule of CATEGORY_RULES) {
    const keys = weekly ? (rule.weeklyKeywords ?? rule.keywords) : rule.keywords;
    if (keys.some((k) => c.includes(k))) return rule;
  }
  return null;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const rule = ruleFor(p.category);
  if (rule !== null) return rule.action(p.name, capital, chain);
  return `Deposit $${capital} of USDC into ${p.name} on ${chain} and keep the position open.`;
}

/** A second, category-specific qualifying action, so the weekly step is concrete, not a slogan. */
function weeklyActionFor(p: SnapshotProtocol): string {
  const rule = ruleFor(p.category, true);
  if (rule !== null) return rule.weekly;
  return 'a deposit, a borrow, a swap or a vote';
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const weekly = weeklyActionFor(p);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week on ${chain}, such as ${weekly}.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    comp_ratio: row.model.comp_ratio,
    comp_category: row.model.comp_category,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    base_implied_usd: row.model.base_implied_usd,
    after_momentum_usd: row.model.after_momentum_usd,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const comps = buildComps(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const compRows: CompRow[] = [...comps.byCategory.entries()]
    .map(([category, v]) => ({
      category,
      median_ratio: v.ratio,
      count: v.count,
      used: v.count >= model.min_comps,
      q1_ratio: v.q1,
      q3_ratio: v.q3,
      loo_low_ratio: v.looLow,
      loo_high_ratio: v.looHigh,
      members: v.members,
    }))
    .sort((a, b) => b.median_ratio - a.median_ratio);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    comps: compRows,
    overall_ratio: comps.overall,
    overall_q1_ratio: comps.overallQ1,
    overall_q3_ratio: comps.overallQ3,
    comp_pool_size: comps.poolSize,
    live_token_count: comps.liveCount,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Cross-field invariants parseSnapshot's per-field checks do not catch: duplicate slugs, negative
 *  money figures, a change_7d outside what a 7-day TVL move can be, and watchlist slugs with no protocol
 *  behind them. A sealed snapshot that fails one of these is corrupt or from another schema, and the
 *  board it would produce is not a valuation. Returns the first problem, or null. */
export function validateSnapshot(snapshot: Snapshot): string | null {
  if (snapshot.protocols.length === 0) return 'snapshot.json holds no protocols';
  const slugs = new Set<string>();
  for (let i = 0; i < snapshot.protocols.length; i++) {
    const p = snapshot.protocols[i]!;
    if (slugs.has(p.slug)) return `snapshot.json repeats the slug ${p.slug} (protocol ${i})`;
    slugs.add(p.slug);
    if (p.slug.trim() === '' || p.name.trim() === '') return `snapshot.json's protocol ${i} has an empty slug or name`;
    if (p.tvl_usd < 0) return `${p.slug} has a negative TVL $${p.tvl_usd}`;
    // The source data reports an unlisted market cap as -1 (autofinance in the sealed snapshot):
    // a sentinel, not a real value, so only a market cap below -1 is corrupt. (Note: -1 is not
    // null, so autofinance counts as live-token, never as a board row and never as a comparable —
    // its ratio would be negative and buildComps drops it.)
    if (p.mcap_usd !== null && p.mcap_usd < -1) return `${p.slug} has a market cap $${p.mcap_usd}, below the -1 sentinel`;
    if (p.change_7d !== null && (p.change_7d < -100 || p.change_7d > 10000)) {
      return `${p.slug} has a 7-day TVL change of ${p.change_7d}%, outside [-100, 10000]`;
    }
    if (p.listed_at !== null && !/^\d{4}-\d{2}-\d{2}$/.test(p.listed_at)) {
      return `${p.slug} has a listed_at of ${p.listed_at}, not a YYYY-MM-DD date`;
    }
    if (p.chains.some((c) => c.trim() === '')) return `${p.slug} names an empty chain`;
  }
  const unknown = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (unknown.length > 0) return `the watchlist names ${unknown.length} slug${unknown.length === 1 ? '' : 's'} with no protocol: ${unknown.slice(0, 5).join(', ')}`;
  if (snapshot.watchlist.length === 0) return 'snapshot.json holds an empty watchlist';
  const dupes = new Set<string>();
  for (const s of snapshot.watchlist) {
    if (dupes.has(s)) return `the watchlist repeats ${s}`;
    dupes.add(s);
  }
  return null;
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
