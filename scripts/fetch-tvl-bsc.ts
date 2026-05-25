/*
 * Reconstruct daily end-of-day BSC bridge balances for USDT and USDC by
 * sampling balanceOf(token, bridge) at one block per UTC day. Uses an
 * archive-capable public RPC (default: blastapi).
 *
 * Output: scripts/.cache/tvl-bsc.json
 *   { date: 'YYYY-MM-DD', usdt: number, usdc: number }[]  (end-of-day balances)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '.cache');
const OUT_FILE = join(CACHE_DIR, 'tvl-bsc.json');

const RPC = process.env.BSC_RPC || 'https://bsc-mainnet.public.blastapi.io';
const GENESIS = process.env.GENESIS_DATE || '2025-10-19';

type Holder = { label: string; addr: string; kind: 'bridge' | 'fireblocks' };
const HOLDERS: Holder[] = [
  { label: 'bridge',  kind: 'bridge',     addr: '0x145CD0d5C3dD0eF1405dCf1b4D2BCE7c611625dB' },
  { label: 'sig',     kind: 'fireblocks', addr: '0x8757f9E16d775759671e95e50D749CECCDA375AE' },
  { label: 'tfusers', kind: 'fireblocks', addr: '0x077Ab3f5D4372cA14c6AA417215Af3d91B55bAFc' },
];

type Token = { symbol: 'USDT' | 'USDC'; addr: string; decimals: number };
const TOKENS: Token[] = [
  { symbol: 'USDT', addr: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
  { symbol: 'USDC', addr: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
];

const BLOCK_TIME_SECONDS = 3;

const balanceOfCallData = (holder: string): string =>
  '0x70a08231' + '000000000000000000000000' + holder.toLowerCase().replace(/^0x/, '');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(RPC, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(25000),
      });
      if (res.status === 429) {
        throw new Error('429 rate limited');
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { result?: T; error?: { message: string } };
      if (j.error) throw new Error(`rpc: ${j.error.message}`);
      return j.result as T;
    } catch (err) {
      const msg = (err as Error).message;
      if (attempt === 6) throw err;
      const isRateLimit = msg.includes('429') || msg.includes('rate');
      const base = isRateLimit ? 2000 : 600;
      await sleep(base * Math.pow(1.6, attempt - 1));
    }
  }
  throw new Error('unreachable');
}

async function getBlockNumber(): Promise<number> {
  const hex = await rpc<string>('eth_blockNumber', []);
  return parseInt(hex, 16);
}

async function getBlockTimestamp(blockNumber: number): Promise<number> {
  const blk = await rpc<{ timestamp: string } | null>('eth_getBlockByNumber', [
    '0x' + blockNumber.toString(16),
    false,
  ]);
  if (!blk) throw new Error(`no block ${blockNumber}`);
  return parseInt(blk.timestamp, 16);
}

async function callBalanceAt(token: Token, holder: string, block: number): Promise<bigint> {
  const result = await rpc<string>('eth_call', [
    { to: token.addr, data: balanceOfCallData(holder) },
    '0x' + block.toString(16),
  ]);
  return BigInt(result || '0x0');
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

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function scaleBig(raw: bigint, decimals: number): number {
  const div = 10n ** BigInt(decimals);
  const whole = raw / div;
  const frac = raw % div;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 6);
  return parseFloat(`${whole.toString()}.${fracStr}`);
}

async function main() {
  console.log(`[bsc] rpc=${RPC}`);
  console.log(`[bsc] resolving head block + timestamp`);
  const headBlock = await getBlockNumber();
  const headTs = await getBlockTimestamp(headBlock);
  console.log(`[bsc] head ${headBlock} ts=${new Date(headTs * 1000).toISOString()}`);

  const dates = eachDay(GENESIS, todayUTC());

  type Sample = { date: string; block: number; targetTs: number };
  const samples: Sample[] = [];
  for (const date of dates) {
    const eodTs = Math.floor(new Date(`${date}T23:59:59Z`).getTime() / 1000);
    const cappedTs = Math.min(eodTs, headTs);
    const block = Math.max(
      1,
      headBlock - Math.floor((headTs - cappedTs) / BLOCK_TIME_SECONDS),
    );
    samples.push({ date, block, targetTs: cappedTs });
  }

  console.log(
    `[bsc] sampling ${samples.length} EOD blocks × ${TOKENS.length} tokens × ${HOLDERS.length} holders = ${samples.length * TOKENS.length * HOLDERS.length} calls`,
  );

  type Out = {
    date: string;
    bridgeUsdt: number;
    bridgeUsdc: number;
    fireblocksUsdt: number;
    fireblocksUsdc: number;
    usdt: number;
    usdc: number;
  };
  const result: Out[] = samples.map((s) => ({
    date: s.date,
    bridgeUsdt: 0,
    bridgeUsdc: 0,
    fireblocksUsdt: 0,
    fireblocksUsdc: 0,
    usdt: 0,
    usdc: 0,
  }));
  const concurrency = 5;
  for (const h of HOLDERS) {
    for (const t of TOKENS) {
      const filled = new Array<boolean>(samples.length).fill(false);
      const values = new Array<number>(samples.length).fill(0);
      let i = 0;
      let done = 0;
      async function worker(): Promise<void> {
        while (true) {
          const idx = i++;
          if (idx >= samples.length) return;
          const s = samples[idx];
          try {
            const raw = await callBalanceAt(t, h.addr, s.block);
            values[idx] = Math.round(scaleBig(raw, t.decimals) * 100) / 100;
            filled[idx] = true;
          } catch (err) {
            const msg = (err as Error).message;
            if (!msg.includes('historical state') && !msg.includes('missing trie')) {
              console.warn(
                `[bsc] ${h.label}/${t.symbol} ${s.date} (block ${s.block}): ${msg}`,
              );
            } else {
              values[idx] = 0;
              filled[idx] = true;
            }
          }
          done++;
          if (done % 60 === 0) {
            console.log(`[bsc] ${h.label}/${t.symbol}: ${done}/${samples.length}`);
          }
          await sleep(40);
        }
      }
      await Promise.all(Array.from({ length: concurrency }, () => worker()));

      const missing = filled.map((ok, idx) => (ok ? -1 : idx)).filter((idx) => idx >= 0);
      if (missing.length > 0) {
        console.log(
          `[bsc] ${h.label}/${t.symbol}: retry ${missing.length} missing days sequentially`,
        );
        for (const idx of missing) {
          const s = samples[idx];
          try {
            const raw = await callBalanceAt(t, h.addr, s.block);
            values[idx] = Math.round(scaleBig(raw, t.decimals) * 100) / 100;
            filled[idx] = true;
          } catch (err) {
            console.warn(
              `[bsc] ${h.label}/${t.symbol} ${s.date} FINAL: ${(err as Error).message}`,
            );
          }
          await sleep(180);
        }
      }

      let lastGood = 0;
      for (let idx = 0; idx < samples.length; idx++) {
        if (filled[idx]) lastGood = values[idx];
        else values[idx] = lastGood;
      }

      for (let idx = 0; idx < samples.length; idx++) {
        const v = values[idx];
        const r = result[idx];
        if (h.kind === 'bridge') {
          if (t.symbol === 'USDT') r.bridgeUsdt += v;
          else r.bridgeUsdc += v;
        } else {
          if (t.symbol === 'USDT') r.fireblocksUsdt += v;
          else r.fireblocksUsdc += v;
        }
        if (t.symbol === 'USDT') r.usdt += v;
        else r.usdc += v;
      }
      console.log(`[bsc] ${h.label}/${t.symbol}: done (latest=${lastGood.toLocaleString()})`);
    }
  }

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(result, null, 2));
  console.log(`[bsc] wrote ${result.length} EOD rows → ${OUT_FILE}`);
  console.log(`[bsc] last EOD: ${JSON.stringify(result[result.length - 1])}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
