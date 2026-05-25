/*
 * Merge metrics + tvl-bsc + tvl-solana + snapshot into a single bundle
 * written to src/data/daily.json (the file vite bundles into the UI).
 *
 * Inputs (produced by sibling scripts under scripts/.cache):
 *   - metrics.json
 *   - tvl-bsc.json
 *   - tvl-solana.json
 *   - snapshot.json
 *
 * Output: src/data/daily.json
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '.cache');
const OUT_DIR = join(__dirname, '..', 'src', 'data');
const OUT_FILE = join(OUT_DIR, 'daily.json');

type MetricRow = {
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

type TvlChainRow = {
  date: string;
  usdt: number;
  usdc: number;
  bridgeUsdt?: number;
  bridgeUsdc?: number;
  fireblocksUsdt?: number;
  fireblocksUsdc?: number;
};
type SnapIn = {
  bsc: { usdt: number; usdc: number };
  solana: { usdt: number; usdc: number };
  subtotal: number;
  fireblocksPending: boolean;
};

async function readJSON<T>(file: string): Promise<T> {
  const buf = await readFile(file, 'utf8');
  return JSON.parse(buf) as T;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

async function main() {
  const [metrics, tvlBsc, tvlSol, snap] = await Promise.all([
    readJSON<MetricRow[]>(join(CACHE_DIR, 'metrics.json')),
    readJSON<TvlChainRow[]>(join(CACHE_DIR, 'tvl-bsc.json')),
    readJSON<TvlChainRow[]>(join(CACHE_DIR, 'tvl-solana.json')),
    readJSON<SnapIn>(join(CACHE_DIR, 'snapshot.json')),
  ]);

  const tvlBscByDate = new Map(tvlBsc.map((r) => [r.date, r]));
  const tvlSolByDate = new Map(tvlSol.map((r) => [r.date, r]));
  const empty: TvlChainRow = {
    date: '',
    usdt: 0,
    usdc: 0,
    bridgeUsdt: 0,
    bridgeUsdc: 0,
    fireblocksUsdt: 0,
    fireblocksUsdc: 0,
  };

  const daily = metrics.map((m) => {
    const bsc = tvlBscByDate.get(m.d) ?? { ...empty, date: m.d };
    const sol = tvlSolByDate.get(m.d) ?? { ...empty, date: m.d };
    const bridgeOnly =
      (bsc.bridgeUsdt ?? bsc.usdt) +
      (bsc.bridgeUsdc ?? bsc.usdc) +
      (sol.bridgeUsdt ?? sol.usdt) +
      (sol.bridgeUsdc ?? sol.usdc);
    const fireblocksOnly =
      (bsc.fireblocksUsdt ?? 0) +
      (bsc.fireblocksUsdc ?? 0) +
      (sol.fireblocksUsdt ?? 0) +
      (sol.fireblocksUsdc ?? 0);
    const total = bridgeOnly + fireblocksOnly;
    return {
      d: m.d,
      u: m.u,
      dau: m.dau,
      nu: m.nu,
      tx: m.tx,
      pv: round(m.pv),
      ev: round(m.ev),
      ff: round(m.ff),
      pf: round(m.pf),
      ef: round(m.ef),
      tvlBscBridgeUsdt: round(bsc.bridgeUsdt ?? bsc.usdt),
      tvlBscBridgeUsdc: round(bsc.bridgeUsdc ?? bsc.usdc),
      tvlBscFireblocksUsdt: round(bsc.fireblocksUsdt ?? 0),
      tvlBscFireblocksUsdc: round(bsc.fireblocksUsdc ?? 0),
      tvlSolBridgeUsdt: round(sol.bridgeUsdt ?? sol.usdt),
      tvlSolBridgeUsdc: round(sol.bridgeUsdc ?? sol.usdc),
      tvlSolFireblocksUsdt: round(sol.fireblocksUsdt ?? 0),
      tvlSolFireblocksUsdc: round(sol.fireblocksUsdc ?? 0),
      tvlBridgeOnly: round(bridgeOnly),
      tvlFireblocks: round(fireblocksOnly),
      tvlTotal: round(total),
    };
  });

  const last = daily.at(-1);
  if (last) {
    // The live snapshot from bridge-info.turboflow.xyz only covers the bridge
    // contracts (BSC + Solana on-chain). Fireblocks vaults aren't surfaced
    // by that API, so we compare against `tvlBridgeOnly`, not `tvlTotal`.
    const ours = last.tvlBridgeOnly;
    const live = snap.subtotal;
    const diff = Math.abs(ours - live);
    const tol = Math.max(live * 0.05, 1000);
    if (diff > tol) {
      console.warn(
        `[build] WARN: bridge-only backfill ($${ours.toLocaleString()}) vs live bridge snapshot ($${live.toLocaleString()}) differs by $${diff.toLocaleString()} (>${(
          (tol / live) *
          100
        ).toFixed(1)}%)`,
      );
    } else {
      console.log(
        `[build] OK: bridge backfill $${ours.toLocaleString()} vs live $${live.toLocaleString()} (diff $${diff.toLocaleString()}); fireblocks adds $${last.tvlFireblocks.toLocaleString()} → grand total $${last.tvlTotal.toLocaleString()}`,
      );
    }
  }

  const bundle = {
    asOf: new Date().toISOString(),
    genesis: process.env.GENESIS_DATE || '2025-10-19',
    daily,
    snapshot: snap,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(bundle, null, 2));
  console.log(`[build] wrote ${daily.length} rows → ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
