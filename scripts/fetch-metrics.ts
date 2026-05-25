/*
 * Fetch daily metrics from the TurboFlow internal API for every day from
 * genesis (2025-10-19) through yesterday UTC.
 *
 * Output: scripts/.cache/metrics.json
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '.cache');
const OUT_FILE = join(CACHE_DIR, 'metrics.json');

const GENESIS = process.env.GENESIS_DATE || '2025-10-19';
const API_BASE =
  process.env.JERRY_API_BASE || 'https://surfv2-uat-api.nfexinsider.com';

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
  const t = Date.now() - 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

async function fetchDay(date: string, attempt = 1): Promise<MetricRow> {
  const url = `${API_BASE}/defillama/metrics?date=${date}`;
  try {
    const res = await fetch(url);
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
    if (attempt < 3) {
      const wait = 600 * attempt;
      await new Promise((r) => setTimeout(r, wait));
      return fetchDay(date, attempt + 1);
    }
    throw new Error(`fetch ${date} failed: ${(err as Error).message}`);
  }
}

async function main() {
  const dates = eachDay(GENESIS, yesterdayUTC());
  console.log(`[metrics] fetching ${dates.length} days: ${dates[0]} ... ${dates[dates.length - 1]}`);

  const rows: MetricRow[] = [];
  const concurrency = 5;
  let i = 0;
  async function worker(id: number) {
    while (true) {
      const idx = i++;
      if (idx >= dates.length) return;
      const date = dates[idx];
      try {
        const row = await fetchDay(date);
        rows[idx] = row;
        if (idx % 20 === 0) console.log(`[metrics] [${id}] done ${date}`);
      } catch (err) {
        console.error(`[metrics] ${date}: ${(err as Error).message}`);
        rows[idx] = {
          d: date,
          u: 0,
          dau: 0,
          nu: 0,
          tx: 0,
          pv: 0,
          ev: 0,
          ff: 0,
          pf: 0,
          ef: 0,
        };
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, (_, k) => worker(k)));

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(rows, null, 2));
  console.log(`[metrics] wrote ${rows.length} rows → ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
