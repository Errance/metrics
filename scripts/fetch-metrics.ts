/*
 * Fetch daily TurboFlow metrics from the production API.
 *
 * Modes:
 *   - Incremental (default): reads `src/data/daily.json` and re-fetches only
 *     the last committed day + every day after it up to yesterday UTC.
 *     This keeps the API footprint tiny so the daily GitHub Actions job
 *     doesn't hit per-IP rate limits, while still allowing the last day to
 *     be revised if the API updated it (e.g. late settlements).
 *   - Full refresh: set FULL_REFRESH=1 to re-fetch from GENESIS through
 *     yesterday. Use sparingly; this is rate-limit-sensitive.
 *
 * Output: scripts/.cache/metrics.json  (full history, committed → repo via
 * build-data.ts which folds it into src/data/daily.json.)
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '.cache');
const OUT_FILE = join(CACHE_DIR, 'metrics.json');
const DAILY_FILE = join(__dirname, '..', 'src', 'data', 'daily.json');

const GENESIS = process.env.GENESIS_DATE || '2025-10-19';
const API_BASE =
  process.env.METRICS_API_BASE ||
  process.env.JERRY_API_BASE ||
  'https://api4.turboflow.xyz';
const FULL_REFRESH = process.env.FULL_REFRESH === '1';

type ApiRow = {
  errno: string;
  msg: string;
  data: {
    date: string;
    users: {
      totalUsers: number;
      dailyActiveUsers: number;
      dailyNewUsers: number;
      dailyTransactionsCount: number;
    };
    volume: {
      perpVolumeUsd: string;
      eventContractsVolumeUsd: string;
      totalVolumeUsd: string;
    };
    fees: {
      flatFeesUsd: string;
      profitShareFeesUsd: string;
      eventContractsFeesUsd: string;
      totalFeesUsd: string;
    };
    revenue: {
      protocolRevenueUsd: string;
      rebatesUsd: string;
      lpVaultShareUsd: string;
      tokenHolderRevenueUsd: string;
    };
  };
};

export type MetricRow = {
  d: string;
  u: number;
  dau: number;
  nu: number;
  tx: number;
  pv: number;
  ev: number;
  ff: number;
  pf: number;
  ef: number;
};

function toNum(s: string | number | undefined | null): number {
  if (s == null) return 0;
  const n = typeof s === 'number' ? s : parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function eachDay(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  const start = new Date(`${fromISO}T00:00:00Z`);
  const end = new Date(`${toISO}T00:00:00Z`);
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function yesterdayUTC(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s, 60s — ~2 minutes per stubborn date.
const BACKOFF = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 60_000];

async function fetchDay(date: string): Promise<MetricRow> {
  const url = `${API_BASE}/defillama/metrics?date=${date}`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < BACKOFF.length; attempt++) {
    try {
      const res = await fetch(url);
      // Treat rate limits + 5xx as retryable; surface other 4xx immediately.
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status} (retryable)`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as ApiRow;
      if (j.errno !== '200') throw new Error(`api errno=${j.errno} msg=${j.msg}`);
      const dd = j.data;
      return {
        d: dd.date,
        u: toNum(dd.users.totalUsers),
        dau: toNum(dd.users.dailyActiveUsers),
        nu: toNum(dd.users.dailyNewUsers),
        tx: toNum(dd.users.dailyTransactionsCount),
        pv: toNum(dd.volume.perpVolumeUsd),
        ev: toNum(dd.volume.eventContractsVolumeUsd),
        ff: toNum(dd.fees.flatFeesUsd),
        pf: toNum(dd.fees.profitShareFeesUsd),
        ef: toNum(dd.fees.eventContractsFeesUsd),
      };
    } catch (err) {
      lastErr = err;
      if (attempt < BACKOFF.length - 1) {
        const wait = BACKOFF[attempt];
        process.stderr.write(
          `[metrics] ${date}: ${(err as Error).message} — retry ${attempt + 1}/${BACKOFF.length - 1} in ${wait}ms\n`,
        );
        await sleep(wait);
      }
    }
  }
  throw new Error(`[metrics] ${date}: gave up after ${BACKOFF.length} attempts: ${(lastErr as Error)?.message}`);
}

type DailyBundle = {
  daily?: { d: string; u: number; dau: number; nu: number; tx: number; pv: number; ev: number; ff: number; pf: number; ef: number }[];
};

async function loadExisting(): Promise<Map<string, MetricRow>> {
  try {
    const buf = await readFile(DAILY_FILE, 'utf8');
    const bundle = JSON.parse(buf) as DailyBundle;
    const m = new Map<string, MetricRow>();
    for (const r of bundle.daily ?? []) {
      m.set(r.d, { d: r.d, u: r.u, dau: r.dau, nu: r.nu, tx: r.tx, pv: r.pv, ev: r.ev, ff: r.ff, pf: r.pf, ef: r.ef });
    }
    return m;
  } catch {
    return new Map();
  }
}

function pickDatesToFetch(existing: Map<string, MetricRow>, until: string): string[] {
  if (FULL_REFRESH || existing.size === 0) {
    return eachDay(GENESIS, until);
  }
  // Find latest day with any signal (avoid getting stuck on a zero-padded row
  // from an old failed run — re-fetch from the latest *non-zero* day).
  let latest = GENESIS;
  for (const r of existing.values()) {
    const hasSignal = r.u > 0 || r.tx > 0 || r.pv > 0 || r.ev > 0;
    if (hasSignal && r.d > latest) latest = r.d;
  }
  // Re-fetch [latest, until] — the overlap of `latest` itself is intentional:
  // it lets us pick up any late revisions to that day.
  return eachDay(latest, until);
}

async function main(): Promise<void> {
  const existing = await loadExisting();
  const until = yesterdayUTC();
  const dates = pickDatesToFetch(existing, until);
  console.log(
    `[metrics] mode=${FULL_REFRESH ? 'FULL' : existing.size > 0 ? 'incremental' : 'first-run'} ` +
      `existing=${existing.size} fetch=${dates.length} (${dates[0]} ... ${dates[dates.length - 1]})`,
  );

  // Sequential at concurrency=1 — production API rate-limits aggressive
  // parallel fetches. Daily incremental run is typically 1-2 dates so this
  // takes ~1s on the happy path.
  let succeeded = 0;
  for (let idx = 0; idx < dates.length; idx++) {
    const date = dates[idx];
    const row = await fetchDay(date);
    existing.set(date, row);
    succeeded++;
    if (idx % 20 === 0 || idx === dates.length - 1) {
      process.stderr.write(`[metrics] ${idx + 1}/${dates.length} ${date} u=${row.u} pv=$${Math.round(row.pv).toLocaleString()}\n`);
    }
  }

  // Sort by date ascending.
  const out = Array.from(existing.values()).sort((a, b) => a.d.localeCompare(b.d));
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(
    `[metrics] wrote ${out.length} total rows (refreshed ${succeeded} this run) → ${OUT_FILE}`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
