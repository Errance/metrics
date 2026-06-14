/*
 * Pull the current bridge custody snapshot from bridge-info.turboflow.xyz.
 *
 * Output: scripts/.cache/snapshot.json
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '.cache');
const OUT_FILE = join(CACHE_DIR, 'snapshot.json');

const API_BASE =
  process.env.BRIDGE_INFO_BASE || 'https://bridge-info.turboflow.xyz';

type ApiResp = {
  code: number;
  data: {
    evm: {
      custody_balances: {
        symbol: string;
        balance_human?: string;
        error?: string;
      }[];
    };
    solana: {
      custody_balances: {
        symbol: string;
        balance_human?: string;
        error?: string;
      }[];
    };
  };
};

type SnapshotOut = {
  bsc: { usdt: number; usdc: number };
  solana: { usdt: number; usdc: number };
  subtotal: number;
  fireblocksPending: boolean;
};

function pick(
  rows: { symbol: string; balance_human?: string; error?: string }[],
  symbol: string,
): number {
  const m = rows.find((r) => r.symbol.toUpperCase() === symbol && r.balance_human != null);
  if (!m?.balance_human) return 0;
  const n = parseFloat(m.balance_human);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const url = `${API_BASE}/api/v1/bridge/info`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`bridge-info HTTP ${res.status}`);
  const j = (await res.json()) as ApiResp;
  if (j.code !== 0) throw new Error(`bridge-info code=${j.code}`);

  const bscUsdt = pick(j.data.evm.custody_balances, 'USDT');
  const bscUsdc = pick(j.data.evm.custody_balances, 'USDC');
  const solUsdt = pick(j.data.solana.custody_balances, 'USDT');
  const solUsdc = pick(j.data.solana.custody_balances, 'USDC');

  const out: SnapshotOut = {
    bsc: { usdt: round(bscUsdt), usdc: round(bscUsdc) },
    solana: { usdt: round(solUsdt), usdc: round(solUsdc) },
    subtotal: round(bscUsdt + bscUsdc + solUsdt + solUsdc),
    fireblocksPending: true,
  };

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`[snapshot] subtotal $${out.subtotal.toLocaleString('en-US')}`);
  console.log(`[snapshot] wrote ${OUT_FILE}`);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
