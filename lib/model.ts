// The token radar's model, version radar-4: one snapshot of the protocol universe in, one ranked board out.
//
// Radar-4 ranks the pre-token protocols a launch can honestly be claimed for, and accounts for every
// other record in the snapshot. Of the 758 protocols, 416 already trade (the calibration set, never
// ranked) and 342 record no token. The board ranks 197 of those: every protocol the snapshot's own
// watchlist rule keeps — no token recorded, not a wrapped, staked or bridged product of a token that
// already trades, not a versioned pool of another protocol, not an exchange balance sheet — with the
// 40 watchlist protocols (at or above the $50M floor) badged "watchlist" and the rest "early". The 145
// records the rule screens out (WBTC, Binance staked ETH, Bybit's balance sheet and their kin) are not
// ranked: each is listed in the dashboard's coverage audit with the reason it was screened, so the
// board's coverage is a shown fact, not a claim. Ranking a wrapped product of a live token as a
// "pre-token launch" would be the one dishonest board this model refuses to write.
//
// Implied value is calibrated to what similar protocols actually trade at, from the snapshot itself.
// Radar-4 prices each row in three steps, all of them shown on the board and recomputed live by the
// page, so the number on screen and the number board.json carries are the same arithmetic:
//
//   multiple   = the category's live-token median market-cap / TVL, SHRUNK toward the overall
//                median by sample size: (n x median + 5 x overall) / (n + 5). A category with
//                fewer than 3 live comps falls back to the overall median outright. The multiple is
//                then clamped only to [0.01, 5.0]. Shrinkage replaces radar-3's hard [0.05, 1.0]
//                clamp, which crushed real comps (a category median of 19x was priced at 1x) and
//                inflated tiny ones (a median of 0.006x was priced at 0.05x, eight times its comps).
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x 0.5
//   maturity   = 0.55 + 0.45 x ln(1 + age_days) / ln(1 + 1095)   (age unknown: the board's median
//                tokenless age, 421 days here — not a fixed guess). A log curve: a protocol that
//                has run three tokenless years is worth more than one that launched last month,
//                but the third year adds less than the first.
//   implied    = max(1, round(tvl_usd x multiple x growthMult x maturity))
//
// Every row also carries the model's own uncertainty: the first and third quartiles of its comps set,
// shrunk the same way, give a sensitivity range (the same formula at the quartile multiples), and a
// basis flag says whether the multiple is the category's own shrunk median or the overall fallback.
// Confidence is stated from three named inputs — how many live comps set the multiple, whether the
// protocol's age is known, and whether its seven-day growth was reported — and the detail view lists
// all three. The multiple is computed from the snapshot at run time, never hard-coded: the same
// function scores every row, the dashboard shows the comps table it used with raw and shrunk
// multiples side by side, and no protocol name is ever special-cased.

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

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  /** Fallback age when the snapshot carries no known tokenless age at all. */
  unknown_age_days: number;
  /** Live comps a category needs before its own median is used. */
  min_comps: number;
  /** The shrinkage weight: how many phantom overall-median observations each category median carries. */
  shrink_k: number;
  /** The multiple's clamp, in market-cap per dollar of TVL. */
  multiple_floor: number;
  multiple_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1095,
  unknown_age_days: 365,
  min_comps: 3,
  shrink_k: 5,
  multiple_floor: 0.01,
  multiple_cap: 5.0,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-4';

/** How many live-token protocols the Live comps view carries, by market cap. */
export const LIVE_ROWS = 30;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A farm plan's totals, computed from the same inputs as its steps: capital, gas, setup and hold. */
export interface PlanTotals {
  capital_usd: number;
  gas_low_usd: number;
  gas_high_usd: number;
  setup_min: number;
  upkeep_min_week: number;
  hold_days: number;
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
  /** "watchlist" when the snapshot's own list names the slug, "early" for every other pre-token row. */
  stage: 'watchlist' | 'early';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    /** The shrunk multiple the row is priced at (full precision; the page recomputes from it). */
    category_multiple: number;
    /** The category's raw median before shrinkage, for the comps table's honesty check. */
    raw_category_multiple: number | null;
    /** "category" when the multiple is the category's own shrunk median, "overall" on the fallback. */
    comps_basis: 'category' | 'overall';
    comps_n: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    /** The age the maturity curve actually used: the protocol's own, or the board's median age. */
    age_used_days: number;
    /** The implied value at the comps set's first and third quartile multiples: the model's range. */
    implied_low_usd: number;
    implied_high_usd: number;
  };
  farm_steps: string[];
  plan: PlanTotals;
}

/** The dashboard's compact view of one row. */
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
  stage: 'watchlist' | 'early';
  implied_value_usd: number;
  /** implied / TVL: what the model prices each dollar of TVL at, after every adjustment. */
  effective_multiple: number;
  category_multiple: number;
  raw_category_multiple: number | null;
  comps_basis: 'category' | 'overall';
  comps_n: number;
  /** high: the category's own shrunk median from 8+ live comps; medium: its own median from 3 to 7; low: the overall fallback. */
  confidence: 'high' | 'medium' | 'low';
  /** The three named inputs the confidence tier rests on, shown in the detail view. */
  confidence_reasons: string[];
  growth_multiplier: number;
  maturity_multiplier: number;
  age_used_days: number;
  implied_low_usd: number;
  implied_high_usd: number;
  /** 0..100, display only: growth, size and maturity percentiles among the board's rows. Rank is by implied value, never by signal. */
  signal: number;
  /** The row's TVL percentile among the pre-token protocols of its own category, 0..100. */
  tvl_pct_category: number;
  /** change_7d minus the median change_7d of the pre-token protocols in its category, in points; null when either side is unknown. */
  growth_delta_category: number | null;
  /** The same farm plan board.json carries, so the page renders the board's own steps, never a second version. */
  farm_steps: string[];
  plan: PlanTotals;
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
  /** mcap / TVL, the ratio the calibration reads. */
  multiple: number | null;
}

/** One category's comps: the median multiple, its quartiles and how many live protocols set it. */
export interface CompsRow {
  category: string;
  n: number;
  /** The category's raw median mcap/TVL, before shrinkage. */
  raw_median_multiple: number;
  /** The multiple actually used for the category's rows: the shrunk median (or the overall median on fallback). */
  used_multiple: number;
  q1_multiple: number;
  q3_multiple: number;
  used: boolean;
  /** How many of the board's pre-token rows this category carries. */
  pre_token_n: number;
}

/** A pre-token record the board does not rank, with the reason the watchlist's rule screens it out. */
export interface ScreenedRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

/** The board's headline numbers, as the dashboard's KPI strip states them. */
export interface RadarStats {
  protocols_total: number;
  pre_token_total: number;
  live_total: number;
  watchlist_covered: number;
  watchlist_total: number;
  screened_total: number;
  aggregate_implied_usd: number;
  aggregate_tvl_usd: number;
  median_multiple: number;
  fallback_rows: number;
  /** The tokenless age the maturity curve uses when a protocol's own age is unknown. */
  median_age_days: number;
  /** How many categories price off their own shrunk median instead of the overall fallback. */
  shrunk_categories: number;
}

/** The dashboard's alert rails: all three are read off the board's own rows, nothing is invented. */
export interface RadarAlerts {
  /** Highest seven-day TVL growth among pre-token protocols with at least $25M of TVL. */
  movers: { slug: string; name: string; change_7d: number; tvl_usd: number }[];
  /** Youngest pre-token protocols by listed_at (age known), largest first by TVL among the youngest. */
  newest: { slug: string; name: string; age_days: number; tvl_usd: number }[];
  /** Highest effective multiple (implied / TVL) among pre-token protocols with at least $25M of TVL. */
  upside: { slug: string; name: string; effective_multiple: number; implied_value_usd: number }[];
}

/** Everything the dashboard needs: the board, the live set, the comps and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  overall_multiple: number;
  median_age_days: number;
  stats: RadarStats;
  alerts: RadarAlerts;
  comps: CompsRow[];
  rows: RadarRow[];
  live: LiveRow[];
  /** Every pre-token record the board does not rank, with its screening reason: the coverage audit. */
  screened: ScreenedRow[];
  /** The top live peers of each board category by market cap: the detail view's comps table. */
  comps_peers: Record<string, { name: string; mcap_usd: number; tvl_usd: number; multiple: number }[]>;
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

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a sorted list of numbers. */
function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A quartile of a sorted list, by linear interpolation between closest ranks. */
function quartile(sorted: number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0]!;
  const pos = (n - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base]! : sorted[base]! + rest * (next - sorted[base]!);
}

/** The fraction of `values` at or below `value`, as a whole per cent. */
function percentile(values: number[], value: number): number {
  if (values.length === 0) return 0;
  let at = 0;
  for (const v of values) if (v <= value) at++;
  return Math.round((at / values.length) * 100);
}

const clampMultiple = (model: ModelConstants, raw: number): number =>
  Math.min(model.multiple_cap, Math.max(model.multiple_floor, raw));

/** One category's calibration: the raw median and quartiles, and the shrunk figures the rows use. */
export interface CategoryCalib {
  rawMedian: number;
  multiple: number;
  q1: number;
  q3: number;
  n: number;
}

/**
 * The comps calibration: for every category, the median market-cap / TVL of its live-token protocols
 * (those with a market cap and a positive TVL) with its first and third quartiles, and the same over
 * all live-token protocols. Each category's figures are shrunk toward the overall figures by the
 * model's weight: (n x category + k x overall) / (n + k). A thin category's wild median is pulled
 * most of the way to the overall; a thick category's median barely moves. Every multiple is clamped
 * only to the wide [0.01, 5.0] band.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): {
  byCategory: Map<string, CategoryCalib>;
  overall: CategoryCalib;
} {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? 'Unknown';
    const list = byCategory.get(key);
    if (list) list.push(ratio);
    else byCategory.set(key, [ratio]);
  }
  const summarize = (ratios: number[]): { rawMedian: number; rawQ1: number; rawQ3: number; n: number } => {
    const s = [...ratios].sort((a, b) => a - b);
    return { rawMedian: median(s), rawQ1: quartile(s, 0.25), rawQ3: quartile(s, 0.75), n: s.length };
  };
  const overallRaw = summarize(all);
  const overall: CategoryCalib = {
    rawMedian: overallRaw.rawMedian,
    multiple: clampMultiple(model, overallRaw.rawMedian),
    q1: clampMultiple(model, overallRaw.rawQ1),
    q3: clampMultiple(model, overallRaw.rawQ3),
    n: overallRaw.n,
  };
  const k = model.shrink_k;
  const result = new Map<string, CategoryCalib>();
  for (const [key, ratios] of byCategory) {
    const raw = summarize(ratios);
    const n = raw.n;
    result.set(key, {
      rawMedian: raw.rawMedian,
      multiple: clampMultiple(model, (n * raw.rawMedian + k * overallRaw.rawMedian) / (n + k)),
      q1: clampMultiple(model, (n * raw.rawQ1 + k * overallRaw.rawQ1) / (n + k)),
      q3: clampMultiple(model, (n * raw.rawQ3 + k * overallRaw.rawQ3) / (n + k)),
      n,
    });
  }
  return { byCategory: result, overall };
}

/** The comps one category scores from: its own shrunk set when enough live protocols set it, else the overall. */
export function compsFor(
  category: string | null,
  calib: { byCategory: Map<string, CategoryCalib>; overall: CategoryCalib },
  model: ModelConstants = MODEL,
): { comps: CategoryCalib; basis: 'category' | 'overall' } {
  const entry = calib.byCategory.get(category ?? 'Unknown');
  if (entry && entry.n >= model.min_comps) return { comps: entry, basis: 'category' };
  return { comps: calib.overall, basis: 'overall' };
}

/** The growth and maturity multipliers one protocol gets, shared by the value and its range. */
function adjustments(
  protocol: SnapshotProtocol,
  asOf: string,
  medianAge: number,
  model: ModelConstants,
): { growthPct: number; growthMult: number; maturityMult: number; age: number | null; ageUsed: number } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageUsed = age ?? medianAge;
  const maturityMult =
    model.maturity_floor +
    (Math.log1p(Math.min(Math.max(ageUsed, 0), model.maturity_days * 4)) / Math.log1p(model.maturity_days)) * model.maturity_range;
  return { growthPct, growthMult, maturityMult, age, ageUsed };
}

/** The implied value, its sensitivity range and every input, for one protocol. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calib: { byCategory: Map<string, CategoryCalib>; overall: CategoryCalib },
  medianAge: number,
  model: ModelConstants = MODEL,
): {
  implied: number;
  impliedLow: number;
  impliedHigh: number;
  multiple: number;
  rawMultiple: number | null;
  compsN: number;
  basis: 'category' | 'overall';
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
  ageUsed: number;
} {
  const { comps, basis } = compsFor(protocol.category, calib, model);
  const adj = adjustments(protocol, asOf, medianAge, model);
  const at = (multiple: number): number =>
    Math.max(1, Math.round(protocol.tvl_usd * multiple * adj.growthMult * adj.maturityMult));
  return {
    implied: at(comps.multiple),
    impliedLow: at(comps.q1),
    impliedHigh: at(comps.q3),
    multiple: comps.multiple,
    rawMultiple: basis === 'category' ? comps.rawMedian : null,
    compsN: comps.n,
    basis,
    growthPct: adj.growthPct,
    growthMult: adj.growthMult,
    maturityMult: adj.maturityMult,
    age: adj.age,
    ageUsed: adj.ageUsed,
  };
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The categories the watchlist's rule keeps out: wrapped, staked and bridged products. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** A whole-word wrapped / staked / staking in a name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** An exchange's name at the start of a protocol's name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** Whether a protocol is one the watchlist's rule keeps: pre-token, not a wrapped, staked or
 * bridged product, not a versioned pool, not an exchange. */
export function isWatchlistClean(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** Why the watchlist's rule screens a pre-token record out, in the rule's own order of reasons. */
export function screenReason(p: SnapshotProtocol): string {
  const c = p.category ?? '';
  if (c === 'CEX' || EXCHANGE_PREFIX.test(p.name)) return 'an exchange balance sheet, not a protocol launch';
  if (WRAPPED_WORD.test(p.name) || c === 'Liquid Staking' || c === 'Liquid Restaking' || c === 'Restaked BTC') {
    return 'a wrapped or staked product of a token that already trades';
  }
  if (c === 'Bridge' || c === 'Canonical Bridge' || c === 'Cross Chain Bridge') {
    return 'a bridge or wrapped-asset product of a token that already trades';
  }
  if (VERSIONED.test(p.name)) return 'a versioned pool of another protocol';
  return 'screened out by the watchlist rule';
}

/** Every pre-token record the board does not rank, largest first, with its screening reason. */
export function screenedOut(snapshot: Snapshot): ScreenedRow[] {
  return snapshot.protocols
    .filter((p) => isPreToken(p) && !isWatchlistClean(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason: screenReason(p) }));
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Per-category context over the board's own rows: TVL lists and median growth, for the row's percentiles. */
function categoryContext(board: BoardRow[]): Map<string, { tvls: number[]; growthMedian: number | null }> {
  const byCat = new Map<string, { tvls: number[]; growths: number[] }>();
  for (const r of board) {
    const key = r.category ?? 'Unknown';
    let entry = byCat.get(key);
    if (!entry) {
      entry = { tvls: [], growths: [] };
      byCat.set(key, entry);
    }
    entry.tvls.push(r.tvl_usd);
    if (r.change_7d !== null && Number.isFinite(r.change_7d)) entry.growths.push(r.change_7d);
  }
  const out = new Map<string, { tvls: number[]; growthMedian: number | null }>();
  for (const [key, entry] of byCat) {
    const growths = [...entry.growths].sort((a, b) => a - b);
    out.set(key, { tvls: entry.tvls, growthMedian: growths.length > 0 ? median(growths) : null });
  }
  return out;
}

/**
 * The protocols the board ranks, strongest first, with ranks 1..n: every pre-token protocol the
 * watchlist's own rule keeps, at any TVL. The watchlist's slugs are badged, never filtered to; the
 * live-token protocols are the calibration set and are never ranked; the screened-out records are
 * listed by screenedOut, never ranked.
 */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; medianAge: number } {
  const calib = calibrate(snapshot, model);
  const watch = new Set(snapshot.watchlist);
  const chosen = snapshot.protocols.filter(isWatchlistClean);
  const knownAges = chosen.map((p) => ageDays(snapshot.as_of, p.listed_at)).filter((a): a is number => a !== null);
  const medianAge = knownAges.length > 0 ? Math.round(median([...knownAges].sort((a, b) => a - b))) : model.unknown_age_days;
  const scored = chosen.map((p) => ({ p, v: impliedValue(p, snapshot.as_of, calib, medianAge, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board = scored.map((s, i) => ({
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
    token_status: 'pre-token' as const,
    stage: watch.has(s.p.slug) ? ('watchlist' as const) : ('early' as const),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      category_multiple: s.v.multiple,
      raw_category_multiple: s.v.rawMultiple,
      comps_basis: s.v.basis,
      comps_n: s.v.compsN,
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      age_days: s.v.age,
      age_used_days: s.v.ageUsed,
      implied_low_usd: s.v.impliedLow,
      implied_high_usd: s.v.impliedHigh,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
    plan: planTotals(s.p, s.v.age),
  }));
  return { board, medianAge };
}

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

/** The wallet a chain's farmer sets up, from the chain the record names. */
function walletFor(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'solana') return 'a Solana wallet such as Phantom';
  if (c === 'sui') return 'a Sui wallet';
  if (c === 'aptos') return 'an Aptos wallet such as Petra';
  if (c === 'bitcoin') return 'a Bitcoin wallet';
  if (c === 'tron') return 'a Tron wallet such as TronLink';
  if (c === 'near') return 'a NEAR wallet';
  return 'an EVM wallet such as MetaMask or Rabby';
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

/** The gas a single transaction costs on a chain, in whole dollars, at ordinary load. */
function gasFor(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return '$5 to $15';
  if (c === 'solana' || c === 'sui' || c === 'aptos' || c === 'near') return 'under $0.05';
  if (c === 'tron') return 'about $1';
  if (c === 'bitcoin') return '$2 to $5';
  return '$0.10 to $1';
}

/** One transaction's gas on a chain as a low/high dollar range, at ordinary load. */
function gasRange(chain: string): { low: number; high: number } {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return { low: 5, high: 15 };
  if (c === 'solana' || c === 'sui' || c === 'aptos' || c === 'near') return { low: 0.01, high: 0.05 };
  if (c === 'tron') return { low: 0.5, high: 1.5 };
  if (c === 'bitcoin') return { low: 2, high: 5 };
  return { low: 0.1, high: 1 };
}

/**
 * A plan's totals, from the same inputs as its steps: the capital tier, six transactions of the
 * first chain's gas (setup, second position, two weekly habits, claim, exit), about 35 minutes of
 * setup, about 15 minutes of upkeep a week, and the age-based hold.
 */
export function planTotals(p: SnapshotProtocol, age: number | null): PlanTotals {
  const g = gasRange(chainOf(p));
  return {
    capital_usd: capitalFor(p),
    gas_low_usd: Math.round(g.low * 6 * 100) / 100,
    gas_high_usd: Math.round(g.high * 6 * 100) / 100,
    setup_min: 35,
    upkeep_min_week: 15,
    hold_days: holdDaysFor(age),
  };
}

/** The category's action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('bridge')) {
    return `Bridge $${capital} of USDC from Ethereum to ${chain} through ${name}, then make one small transfer back a week later so both directions count.`;
  }
  if (c.includes('liquid staking') || c.includes('liquid restaking') || c.includes('restaked')) {
    return `Stake $${capital} of the chain's native asset through ${name} on ${chain} and hold the liquid receipt token it issues.`;
  }
  if (c === 'cex' || c.includes('centralized exchange')) {
    return `Open an account at ${name}, deposit $${capital} of USDC, place two or three small spot trades and keep the balance on the exchange.`;
  }
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('basis trad')) {
    return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow a small amount against it so the position shows both sides, and keep it open.`;
  }
  if (c.includes('dex') || c.includes('leveraged farm')) {
    return `Provide $${capital} of liquidity to ${name}'s deepest USDC pool on ${chain} and keep the position open.`;
  }
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator')) {
    return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the shares.`;
  }
  if (c.includes('rwa') || c.includes('stable')) {
    return `Mint $${capital} of the protocol's yield-bearing asset through ${name} on ${chain} and hold it.`;
  }
  if (c.includes('perpetual') || c.includes('derivative')) {
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} and place one market position on ${name} on ${chain}.`;
  }
  if (c.includes('staking') || c.includes('pool')) {
    return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  }
  if (c.includes('payment')) {
    return `Move $${capital} of USDC through ${name} on ${chain} once a week and keep the receipts.`;
  }
  if (c.includes('governance')) {
    return `Deposit $${capital} of USDC into ${name} on ${chain}, then vote once in its governance when a proposal opens.`;
  }
  if (c.includes('chain')) {
    return `Bridge $${capital} of USDC to ${chain} and use it once inside ${name}'s own app.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A mid-plan step that fits the category: the habit that makes the position look used, not parked. */
function habitStep(p: SnapshotProtocol, chain: string, gas: string): FarmStep {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('bridge')) {
    return {
      text: `Bridge a small amount, about $25, across ${p.name} once every two weeks and alternate the direction, so the wallet reads as a regular user of the route.`,
      cost: `about ${gas} of gas a crossing`,
      time: '10 minutes a crossing',
    };
  }
  if (c.includes('dex')) {
    return {
      text: `Swap about $25 inside ${p.name}'s main pool once a week, alternating the pair's direction, so the wallet builds a trading history and not only a deposit.`,
      cost: `about ${gas} of gas a swap, plus the pool's fee`,
      time: '5 minutes a week',
    };
  }
  if (c.includes('perpetual') || c.includes('derivative')) {
    return {
      text: `Open and close one small hedged trade on ${p.name} each week, keeping the margin in place, so the account shows trading activity and not only a deposit.`,
      cost: `about ${gas} of gas and the trading fee`,
      time: '10 minutes a week',
    };
  }
  if (c.includes('lend') || c.includes('cdp')) {
    return {
      text: `Repay a slice of the borrow and draw it again once every two weeks, keeping the health factor comfortable, so both sides of the market stay in use.`,
      cost: `about ${gas} of gas a cycle`,
      time: '10 minutes a cycle',
    };
  }
  return {
    text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, so the wallet stays active on ${chain}.`,
    cost: `about ${gas} of gas a week`,
    time: '10 minutes a week',
  };
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const action = actionFor(p, capital, chain);
  const otherChain = p.chains.length > 1 ? p.chains[1]! : null;
  return [
    {
      text: `Set up ${walletFor(chain)} that holds only the funds you plan to farm with, and keep its seed phrase offline.`,
      cost: 'free to set up',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about ${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: otherChain
        ? `Repeat the position on ${otherChain} with a smaller amount, about $${Math.max(25, Math.round(capital / 2))}, so the wallet is active on two of its chains.`
        : `Split the position into two deposits a week apart, about $${Math.round(capital / 2)} each, so the wallet's history is not a single day.`,
      cost: `about ${gas} of gas for the second position`,
      time: '10 minutes',
    },
    habitStep(p, chain, gas),
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Join the protocol's Discord or Telegram and read its announcements channel once a week, so you know when a points program or a snapshot is announced.`,
      cost: 'free',
      time: '5 minutes a week',
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes; then unwind the position and write the wallet, the dates and every transaction in a farm log.`,
      cost: 'no fee to check, and never pay to claim',
      time: '15 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live comps view. */
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
      multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** The three named inputs behind a row's confidence tier, in the detail view's words. */
export function confidenceReasons(row: {
  comps_basis: 'category' | 'overall';
  comps_n: number;
  age_days: number | null;
  change_7d: number | null;
}): string[] {
  const reasons: string[] = [];
  if (row.comps_basis === 'category') {
    reasons.push(`${row.comps_n} live comps set this category's multiple`);
  } else {
    reasons.push(`too few live comps in this category — priced on the overall median of ${row.comps_n} live protocols`);
  }
  reasons.push(row.age_days !== null ? `age known: ${row.age_days} days with no token` : 'age unknown: the board median age is used');
  reasons.push(row.change_7d !== null ? 'seven-day growth reported' : 'seven-day growth unreported — treated as 0%');
  return reasons;
}

/** A board row's compact form for data.js, enriched with the category context and the signal. */
export function radarRow(
  row: BoardRow,
  ctx: Map<string, { tvls: number[]; growthMedian: number | null }>,
  growthValues: number[],
  logTvlValues: number[],
): RadarRow {
  const entry = ctx.get(row.category ?? 'Unknown');
  const tvlPct = entry ? percentile(entry.tvls, row.tvl_usd) : 0;
  const growthDelta =
    row.change_7d !== null && entry && entry.growthMedian !== null
      ? Math.round((row.change_7d - entry.growthMedian) * 100) / 100
      : null;
  const growthPct = percentile(growthValues, Math.min(120, Math.max(-60, row.change_7d ?? 0)));
  const sizePct = percentile(logTvlValues, Math.log10(Math.max(1, row.tvl_usd)));
  const maturityPct = Math.round(
    ((row.model.maturity_multiplier - MODEL.maturity_floor) / MODEL.maturity_range) * 100,
  );
  const signal = Math.round(0.4 * growthPct + 0.3 * sizePct + 0.3 * maturityPct);
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
    stage: row.stage,
    implied_value_usd: row.implied_value_usd,
    effective_multiple: row.tvl_usd > 0 ? round4(row.implied_value_usd / row.tvl_usd) : 0,
    category_multiple: row.model.category_multiple,
    raw_category_multiple: row.model.raw_category_multiple,
    comps_basis: row.model.comps_basis,
    comps_n: row.model.comps_n,
    confidence: row.model.comps_basis === 'overall' ? 'low' : row.model.comps_n >= 8 ? 'high' : 'medium',
    confidence_reasons: confidenceReasons({
      comps_basis: row.model.comps_basis,
      comps_n: row.model.comps_n,
      age_days: row.age_days,
      change_7d: row.change_7d,
    }),
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    age_used_days: row.model.age_used_days,
    implied_low_usd: row.model.implied_low_usd,
    implied_high_usd: row.model.implied_high_usd,
    signal,
    tvl_pct_category: tvlPct,
    growth_delta_category: growthDelta,
    farm_steps: row.farm_steps,
    plan: row.plan,
  };
}

/** The comps table the dashboard shows, one row per category that has live protocols. */
export function compsTable(
  snapshot: Snapshot,
  board: BoardRow[],
  model: ModelConstants = MODEL,
): { comps: CompsRow[]; overall: number } {
  const calib = calibrate(snapshot, model);
  const preByCat = new Map<string, number>();
  for (const r of board) preByCat.set(r.category ?? 'Unknown', (preByCat.get(r.category ?? 'Unknown') ?? 0) + 1);
  const rows: CompsRow[] = [];
  for (const [category, entry] of [...calib.byCategory.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))) {
    rows.push({
      category,
      n: entry.n,
      raw_median_multiple: round4(entry.rawMedian),
      used_multiple: round4(entry.multiple),
      q1_multiple: round4(entry.q1),
      q3_multiple: round4(entry.q3),
      used: entry.n >= model.min_comps,
      pre_token_n: preByCat.get(category) ?? 0,
    });
  }
  return { comps: rows, overall: round4(calib.overall.multiple) };
}

/** The alert rails, read off the board's rows. */
export function buildAlerts(board: BoardRow[]): RadarAlerts {
  const movers = board
    .filter((r) => r.change_7d !== null && r.tvl_usd >= 25_000_000)
    .sort((a, b) => (b.change_7d ?? 0) - (a.change_7d ?? 0))
    .slice(0, 6)
    .map((r) => ({ slug: r.slug, name: r.name, change_7d: r.change_7d!, tvl_usd: r.tvl_usd }));
  const newest = board
    .filter((r) => r.age_days !== null)
    .sort((a, b) => (a.age_days ?? 0) - (b.age_days ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 6)
    .map((r) => ({ slug: r.slug, name: r.name, age_days: r.age_days!, tvl_usd: r.tvl_usd }));
  const upside = board
    .filter((r) => r.tvl_usd >= 25_000_000)
    .sort((a, b) => b.implied_value_usd / b.tvl_usd - a.implied_value_usd / a.tvl_usd)
    .slice(0, 6)
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      effective_multiple: round4(r.implied_value_usd / r.tvl_usd),
      implied_value_usd: r.implied_value_usd,
    }));
  return { movers, newest, upside };
}

/** The top live peers of each category the board carries, by market cap: the detail view's comps table. */
export function compsPeers(snapshot: Snapshot, board: BoardRow[]): Record<string, { name: string; mcap_usd: number; tvl_usd: number; multiple: number }[]> {
  const wanted = new Set(board.map((r) => r.category ?? 'Unknown'));
  const byCat = new Map<string, { name: string; mcap_usd: number; tvl_usd: number; multiple: number }[]>();
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const key = p.category ?? 'Unknown';
    if (!wanted.has(key)) continue;
    const list = byCat.get(key) ?? [];
    list.push({ name: p.name, mcap_usd: p.mcap_usd, tvl_usd: p.tvl_usd, multiple: round4(p.mcap_usd / p.tvl_usd) });
    byCat.set(key, list);
  }
  const out: Record<string, { name: string; mcap_usd: number; tvl_usd: number; multiple: number }[]> = {};
  for (const [key, list] of byCat) out[key] = list.sort((a, b) => b.mcap_usd - a.mcap_usd).slice(0, 5);
  return out;
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, medianAge } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => r.stage === 'early').length;
  const { comps, overall } = compsTable(snapshot, board, model);
  const ctx = categoryContext(board);
  const growthValues = board.map((r) => Math.min(120, Math.max(-60, r.change_7d ?? 0)));
  const logTvlValues = board.map((r) => Math.log10(Math.max(1, r.tvl_usd)));
  const calib = calibrate(snapshot, model);
  const stats: RadarStats = {
    protocols_total: snapshot.protocols.length,
    pre_token_total: snapshot.protocols.filter(isPreToken).length,
    live_total: snapshot.protocols.filter((p) => !isPreToken(p)).length,
    watchlist_covered: board.filter((r) => r.stage === 'watchlist').length,
    watchlist_total: snapshot.watchlist.length,
    screened_total: snapshot.protocols.filter((p) => isPreToken(p) && !isWatchlistClean(p)).length,
    aggregate_implied_usd: board.reduce((sum, r) => sum + r.implied_value_usd, 0),
    aggregate_tvl_usd: board.reduce((sum, r) => sum + r.tvl_usd, 0),
    median_multiple: round4(calib.overall.multiple),
    fallback_rows: board.filter((r) => r.model.comps_basis === 'overall').length,
    median_age_days: medianAge,
    shrunk_categories: comps.filter((c) => c.used).length,
  };
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist: [...snapshot.watchlist],
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    overall_multiple: overall,
    median_age_days: medianAge,
    stats,
    alerts: buildAlerts(board),
    comps,
    rows: board.map((r) => radarRow(r, ctx, growthValues, logTvlValues)),
    live,
    screened: screenedOut(snapshot),
    comps_peers: compsPeers(snapshot, board),
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
