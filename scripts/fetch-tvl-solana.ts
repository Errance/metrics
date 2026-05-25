/*
 * Reconstruct daily end-of-day Solana SPL token-account balances.
 *
 * Strategy (minimizes getTransaction calls):
 *   1) `getSignaturesForAddress` per SPL token account, paginated until we
 *      pass the start date.
 *   2) Bucket signatures by UTC date and keep the LAST one of each day.
 *   3) Call `getTransaction` ONCE per active day, parse `meta.postTokenBalances`.
 *   4) Days without activity inherit the previous EOD balance.
 *
 * Modes:
 *   - Incremental (default): reads src/data/daily.json, starts pagination from
 *     the latest committed day, and re-samples only [latest, today]. The
 *     "5000 sigs" phase is cheap because pagination terminates as soon as we
 *     get one batch older than the start date.
 *   - Full refresh: set FULL_REFRESH=1 to walk every signature back to GENESIS.
 *
 * Performance:
 *   - Multiple RPC endpoints (round-robin + failover on 429/5xx/timeout).
 *   - 10-way concurrency per holder; holders processed in parallel.
 *   - Live progress bar (refreshes ~4×/sec on TTY, else once per 10% in CI).
 *
 * Output: scripts/.cache/tvl-solana.json  (full history of EOD rows)
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '.cache');
const OUT_FILE = join(CACHE_DIR, 'tvl-solana.json');
const DAILY_FILE = join(__dirname, '..', 'src', 'data', 'daily.json');
const FULL_REFRESH = process.env.FULL_REFRESH === '1';

const RPCS = (
  process.env.SOLANA_RPCS ||
  ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'].join(',')
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const GENESIS = process.env.GENESIS_DATE || '2025-10-19';
const CONCURRENCY = Number(process.env.SOL_CONCURRENCY || 10);

type Holder = {
  label: string;
  kind: 'bridge' | 'fireblocks';
  symbol: 'USDT' | 'USDC';
  // The SPL token account address. For Fireblocks holders this is resolved at
  // runtime from `ownerWallet` via getTokenAccountsByOwner. Used only for
  // getSignaturesForAddress (sig pagination) — balance extraction uses
  // (mint, ownerWallet) instead, which is robust across RPC encodings.
  account: string;
  // The on-chain owner of `account` (a wallet pubkey or a program PDA).
  // Used to match entries in tx.meta.postTokenBalances.
  ownerWallet: string;
  // The SPL mint address (USDT or USDC).
  mint: string;
};

type HolderSeed = {
  label: string;
  kind: 'bridge' | 'fireblocks';
  // For bridge holders: an SPL token account directly. For Fireblocks holders:
  // the owner wallet pubkey (Solana Fireblocks vaults are owner addresses;
  // their per-mint SPL token accounts are auto-derived/lazily created).
  source: 'spl-token-account' | 'owner-wallet';
  address: string;
  // Optional restriction: only pick up these mints under this owner. If unset,
  // both USDT and USDC are scanned.
  mints?: ('USDT' | 'USDC')[];
};

const MINTS = {
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
} as const;

// Bridge program PDA that owns both bridge custody SPL token accounts.
// Verified on chain (getAccountInfo on the ATAs returns this owner).
const BRIDGE_OWNER_PDA = '8iquHJQyXUq8ykTEKZjtS4wSHKnxiw4ghGWUNzPnA9Q4';

const HOLDER_SEEDS: HolderSeed[] = [
  // Bridge custody — these are the actual SPL token accounts owned by the
  // bridge program. Verified on chain.
  { label: 'bridge-usdc', kind: 'bridge', source: 'spl-token-account', address: '9ayXbTyhkJ49WtG6DA2PCN6EAKtM8DCneMzhJPTMRWcj', mints: ['USDC'] },
  { label: 'bridge-usdt', kind: 'bridge', source: 'spl-token-account', address: '6hVp2UaWWQwGo2c6yHj39WJWDNenR48GsLGKPzSa7EU2', mints: ['USDT'] },

  // Fireblocks MPC vaults — ops provided OWNER wallet addresses. The fetcher
  // auto-discovers their per-mint SPL token accounts at runtime. These
  // wallets may not be on chain yet (Solana lazily indexes a pubkey only
  // after its first inbound transfer); the fetcher tolerates that and logs
  // a warning.
  { label: 'sig',     kind: 'fireblocks', source: 'owner-wallet', address: '6FaXzEC4CNAh1ECxc8FUnjpcnMYYG4M7DVJ5ZMbTmcWH' },
  { label: 'tfusers', kind: 'fireblocks', source: 'owner-wallet', address: '4wHLLe6ovPqmGoBjvk6ogxgFbiGMCUUPvnMqmxyprX5C' },
];

type SigInfo = { signature: string; slot: number; blockTime: number | null; err: unknown };
type Tx = {
  meta: {
    err: unknown;
    postTokenBalances?: {
      accountIndex: number;
      mint: string;
      owner?: string;
      uiTokenAmount: { amount: string; decimals: number; uiAmount: number | null };
    }[];
    loadedAddresses?: { writable?: string[]; readonly?: string[] };
  };
  transaction: { message: { accountKeys: (string | { pubkey: string })[] } };
  blockTime: number | null;
  slot: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let rpcCursor = 0;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    const endpoint = RPCS[(rpcCursor + attempt) % RPCS.length];
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 18_000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { result?: T; error?: { message: string } };
      if (j.error) throw new Error(`rpc: ${j.error.message}`);
      rpcCursor = (rpcCursor + 1) % RPCS.length;
      return j.result as T;
    } catch (err) {
      lastErr = err;
      const backoff = Math.min(2000, 250 * (attempt + 1));
      await sleep(backoff);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/* -------------------- progress bar -------------------- */

const isTTY = !!(process.stderr as { isTTY?: boolean }).isTTY;
type ProgressState = { label: string; done: number; total: number; startedAt: number };
const progressState = new Map<string, ProgressState>();
let lastRender = 0;
let progressLines = 0;

function progressInit(label: string, total: number): void {
  progressState.set(label, { label, done: 0, total, startedAt: Date.now() });
  renderProgress(true);
}

function progressTick(label: string, n = 1): void {
  const s = progressState.get(label);
  if (!s) return;
  s.done += n;
  const now = Date.now();
  if (now - lastRender < 250 && s.done < s.total) return;
  lastRender = now;
  renderProgress();
}

function progressFinish(label: string): void {
  const s = progressState.get(label);
  if (!s) return;
  s.done = s.total;
  renderProgress(true);
}

function renderProgress(force = false): void {
  if (!force && Date.now() - lastRender < 250) return;
  lastRender = Date.now();
  const lines: string[] = [];
  for (const s of progressState.values()) {
    const pct = s.total > 0 ? s.done / s.total : 0;
    const barWidth = 24;
    const filled = Math.max(0, Math.floor(pct * barWidth));
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    const elapsed = (Date.now() - s.startedAt) / 1000;
    const eta = s.done > 0 && s.done < s.total ? Math.round((elapsed / s.done) * (s.total - s.done)) : 0;
    lines.push(
      `[${s.label.padEnd(22)}] ${bar} ${String(s.done).padStart(4)}/${String(s.total).padStart(4)} (${String(Math.round(pct * 100)).padStart(3)}%)${
        eta > 0 ? `  eta ${eta}s` : ''
      }`,
    );
  }
  if (isTTY) {
    if (progressLines > 0) process.stderr.write(`\u001b[${progressLines}A`);
    process.stderr.write(lines.map((l) => `\u001b[2K\r${l}\n`).join(''));
    progressLines = lines.length;
  } else if (force) {
    process.stderr.write(lines.join('\n') + '\n');
  }
}

/* -------------------- core fetching -------------------- */

// Use a single deep-history endpoint for signature pagination.
// Lighter public mirrors (e.g. publicnode) often don't retain enough history
// to honor `before=<old_sig>` and return [] silently, which would truncate
// our walk to a single page. mainnet-beta has the deepest history.
const SIG_RPC = process.env.SOLANA_SIG_RPC || 'https://api.mainnet-beta.solana.com';

async function rpcSingle<T>(endpoint: string, method: string, params: unknown[]): Promise<T> {
  let lastErr: unknown;
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s, 30s — total ≈90s for stubborn 429s.
  const delays = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20_000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { result?: T; error?: { message: string } };
      if (j.error) throw new Error(`rpc: ${j.error.message}`);
      return j.result as T;
    } catch (err) {
      lastErr = err;
      if (attempt < delays.length - 1) await sleep(delays[attempt]);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function fetchAllSignatures(account: string, untilDate: string, label: string): Promise<SigInfo[]> {
  const out: SigInfo[] = [];
  const untilTs = new Date(`${untilDate}T00:00:00Z`).getTime() / 1000;
  let before: string | undefined;
  let page = 0;
  while (true) {
    page++;
    const params: [string, { limit: number; before?: string }] = [
      account,
      { limit: 1000, ...(before ? { before } : {}) },
    ];
    let batch: SigInfo[];
    try {
      batch = await rpcSingle<SigInfo[]>(SIG_RPC, 'getSignaturesForAddress', params);
    } catch (err) {
      process.stderr.write(`\n[sol] ${label}: sig-list page ${page} error: ${(err as Error).message}\n`);
      return out;
    }
    if (!batch || batch.length === 0) break;
    out.push(...batch);
    const oldest = batch[batch.length - 1];
    process.stderr.write(
      `[sol] ${label}: sig page ${page} → +${batch.length} (oldest ${utcDate(oldest.blockTime ?? 0)}, total ${out.length})\n`,
    );
    if ((oldest.blockTime ?? Infinity) < untilTs) break;
    if (batch.length < 1000) break;
    before = oldest.signature;
    await sleep(120);
  }
  return out;
}

function utcDate(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
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

function readUi(b: { uiTokenAmount: { uiAmount: number | null; amount: string; decimals: number } }): number {
  if (typeof b.uiTokenAmount.uiAmount === 'number') return b.uiTokenAmount.uiAmount;
  const raw = BigInt(b.uiTokenAmount.amount);
  return Number(raw) / 10 ** b.uiTokenAmount.decimals;
}

function extractPostBalance(
  tx: Tx,
  expectedOwner: string,
  expectedMint: string,
  splAccount: string,
): number | null {
  if (!tx.meta?.postTokenBalances) return null;
  // Primary: match by (mint, owner). Works for jsonParsed where the RPC
  // populates `owner`.
  for (const b of tx.meta.postTokenBalances) {
    if (b.mint === expectedMint && b.owner === expectedOwner) return readUi(b);
  }
  // Fallback: some RPCs (or v0 txs with address-lookup-tables) may not fill
  // `owner` on every entry. Use accountIndex → accountKeys lookup, including
  // loadedAddresses for v0 transactions.
  const baseKeys = tx.transaction.message.accountKeys.map((k) =>
    typeof k === 'string' ? k : k.pubkey,
  );
  const loaded = tx.meta.loadedAddresses;
  const allKeys = loaded
    ? [...baseKeys, ...(loaded.writable ?? []), ...(loaded.readonly ?? [])]
    : baseKeys;
  for (const b of tx.meta.postTokenBalances) {
    if (b.mint !== expectedMint) continue;
    const pk = allKeys[b.accountIndex];
    if (pk === splAccount) return readUi(b);
  }
  // Last-resort fallback: any postTokenBalance for the expected mint (single
  // tx is unlikely to touch two ATAs of the same mint owned by *us* unless we
  // moved between two of our own holders — but we guard by checking mint at
  // least, so we don't pick up some other party's transfer).
  return null;
}

function entriesFromSigs(sigs: SigInfo[]): [string, SigInfo][] {
  // newest→oldest order ⇒ first occurrence of each date is the LAST sig of that day
  const lastSigPerDay = new Map<string, SigInfo>();
  for (const s of sigs) {
    if (s.err) continue;
    const bt = s.blockTime;
    if (bt == null) continue;
    const date = utcDate(bt);
    if (!lastSigPerDay.has(date)) lastSigPerDay.set(date, s);
  }
  return Array.from(lastSigPerDay.entries());
}

type SplTokenAccount = { pubkey: string; mint: string; owner: string; uiAmount: number };

async function listSplTokenAccountsForOwner(owner: string): Promise<SplTokenAccount[]> {
  // Standard SPL Token Program. (Token-2022 has a different program id; we
  // skip it for now since USDT/USDC mainnet mints live under the classic
  // Token Program.)
  const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  type ResValue = {
    pubkey: string;
    account: { data: { parsed: { info: { mint: string; owner: string; tokenAmount: { uiAmount: number | null } } } } };
  };
  try {
    const r = await rpcSingle<{ value: ResValue[] }>(SIG_RPC, 'getTokenAccountsByOwner', [
      owner,
      { programId: TOKEN_PROGRAM },
      { encoding: 'jsonParsed', commitment: 'finalized' },
    ]);
    return (r?.value ?? []).map((v) => ({
      pubkey: v.pubkey,
      mint: v.account.data.parsed.info.mint,
      owner: v.account.data.parsed.info.owner,
      uiAmount: v.account.data.parsed.info.tokenAmount.uiAmount ?? 0,
    }));
  } catch (err) {
    process.stderr.write(`\n[sol] owner ${owner.slice(0, 6)}…: getTokenAccountsByOwner failed: ${(err as Error).message}\n`);
    return [];
  }
}

async function resolveHolders(): Promise<Holder[]> {
  const out: Holder[] = [];
  for (const seed of HOLDER_SEEDS) {
    if (seed.source === 'spl-token-account') {
      // Direct SPL token account, no resolution needed.
      for (const sym of seed.mints ?? ['USDT', 'USDC']) {
        out.push({
          label: seed.label,
          kind: seed.kind,
          symbol: sym,
          account: seed.address,
          ownerWallet: BRIDGE_OWNER_PDA,
          mint: MINTS[sym],
        });
      }
      continue;
    }

    // owner-wallet → enumerate SPL token accounts under it
    process.stderr.write(`[sol] resolving owner wallet ${seed.label} ${seed.address.slice(0, 6)}…\n`);
    const accs = await listSplTokenAccountsForOwner(seed.address);
    if (accs.length === 0) {
      process.stderr.write(
        `[sol] ${seed.label} ${seed.address.slice(0, 6)}…: owner has no SPL token accounts on chain yet (will start contributing once first inbound transfer arrives)\n`,
      );
      continue;
    }
    const wanted = new Set(seed.mints ?? ['USDT', 'USDC']);
    for (const sym of ['USDT', 'USDC'] as const) {
      if (!wanted.has(sym)) continue;
      const match = accs.find((a) => a.mint === MINTS[sym]);
      if (!match) {
        process.stderr.write(`[sol] ${seed.label}: no ${sym} SPL account under owner ${seed.address.slice(0, 6)}…\n`);
        continue;
      }
      process.stderr.write(
        `[sol] ${seed.label}/${sym}: owner ${seed.address.slice(0, 6)}… → SPL ${match.pubkey.slice(0, 6)}… (current bal ${match.uiAmount})\n`,
      );
      out.push({
        label: seed.label,
        kind: seed.kind,
        symbol: sym,
        account: match.pubkey,
        ownerWallet: seed.address,
        mint: MINTS[sym],
      });
    }
  }
  return out;
}

async function processHolder(
  holder: Holder,
  entries: [string, SigInfo][],
): Promise<Map<string, number>> {
  const label = `${holder.label}/${holder.symbol}`;
  const dailyBalance = new Map<string, number>();
  if (entries.length === 0) return dailyBalance;
  progressInit(label, entries.length);
  let i = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = i++;
      if (idx >= entries.length) return;
      const [date, sig] = entries[idx];
      try {
        const tx = await rpc<Tx | null>('getTransaction', [
          sig.signature,
          { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'finalized' },
        ]);
        if (tx) {
          const bal = extractPostBalance(tx, holder.ownerWallet, holder.mint, holder.account);
          if (typeof bal === 'number') dailyBalance.set(date, bal);
        }
      } catch (err) {
        process.stderr.write(
          `\n[sol] ${label} ${date} ${sig.signature.slice(0, 8)}: ${(err as Error).message}\n`,
        );
      }
      progressTick(label);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  progressFinish(label);
  return dailyBalance;
}

type Out = {
  date: string;
  bridgeUsdt: number;
  bridgeUsdc: number;
  fireblocksUsdt: number;
  fireblocksUsdc: number;
  usdt: number;
  usdc: number;
};

type DailyBundleRow = {
  d: string;
  tvlSolBridgeUsdt: number;
  tvlSolBridgeUsdc: number;
  tvlSolFireblocksUsdt: number;
  tvlSolFireblocksUsdc: number;
};

async function loadExisting(): Promise<Map<string, Out>> {
  try {
    const buf = await readFile(DAILY_FILE, 'utf8');
    const bundle = JSON.parse(buf) as { daily: DailyBundleRow[] };
    const m = new Map<string, Out>();
    for (const r of bundle.daily ?? []) {
      m.set(r.d, {
        date: r.d,
        bridgeUsdt: r.tvlSolBridgeUsdt,
        bridgeUsdc: r.tvlSolBridgeUsdc,
        fireblocksUsdt: r.tvlSolFireblocksUsdt,
        fireblocksUsdc: r.tvlSolFireblocksUsdc,
        usdt: r.tvlSolBridgeUsdt + r.tvlSolFireblocksUsdt,
        usdc: r.tvlSolBridgeUsdc + r.tvlSolFireblocksUsdc,
      });
    }
    return m;
  } catch {
    return new Map();
  }
}

async function main(): Promise<void> {
  process.stderr.write(
    `[sol] using ${RPCS.length} RPC endpoint(s): ${RPCS.map((r) => new URL(r).host).join(', ')}\n`,
  );

  const existing = await loadExisting();
  // Pick the pagination floor: incremental mode walks back to the latest
  // committed day (re-samples that day too in case of late settlements),
  // FULL_REFRESH walks all the way to GENESIS.
  let walkFloor = GENESIS;
  if (!FULL_REFRESH && existing.size > 0) {
    let latest = GENESIS;
    for (const k of existing.keys()) if (k > latest) latest = k;
    walkFloor = latest;
  }
  process.stderr.write(
    `[sol] mode=${FULL_REFRESH ? 'FULL' : existing.size > 0 ? 'incremental' : 'first-run'} existing=${existing.size} pagination-floor=${walkFloor}\n`,
  );

  // Phase 0: resolve owner wallets → concrete SPL token accounts.
  process.stderr.write(`[sol] phase 0: resolving holders...\n`);
  const HOLDERS = await resolveHolders();
  process.stderr.write(
    `[sol] resolved ${HOLDERS.length} holders: ${HOLDERS.map((h) => `${h.label}/${h.symbol}`).join(', ')}\n`,
  );
  process.stderr.write(`[sol] concurrency=${CONCURRENCY}\n\n`);

  // Phase 1: list signatures SEQUENTIALLY (light traffic, avoids 429 on paginate).
  // In incremental mode, pagination stops as soon as we cross `walkFloor`, so
  // this phase becomes a single page fetch on the happy path.
  process.stderr.write(`[sol] phase 1: listing signatures (sequential)...\n`);
  const entriesPerHolder: [string, SigInfo][][] = [];
  for (const h of HOLDERS) {
    const label = `${h.label}/${h.symbol}`;
    process.stderr.write(`[sol] ${label} ${h.account.slice(0, 6)}\u2026 listing\n`);
    const sigs = await fetchAllSignatures(h.account, walkFloor, label);
    if (sigs.length === 0) {
      process.stderr.write(`[sol] ${label}: 0 signatures (account inactive on chain since ${walkFloor})\n`);
      entriesPerHolder.push([]);
      continue;
    }
    // Filter entries to only days >= walkFloor. Even when pagination
    // terminates after 1 page, that page may cover many older days that we
    // already have in `existing` — we mustn't re-fetch their tx data.
    const allEntries = entriesFromSigs(sigs);
    const entries = allEntries.filter(([date]) => date >= walkFloor);
    process.stderr.write(
      `[sol] ${label}: ${sigs.length} sigs → ${entries.length} active days in [${walkFloor}, today] (skipped ${allEntries.length - entries.length} older days)\n`,
    );
    entriesPerHolder.push(entries);
  }

  // Phase 2: getTransaction in parallel across holders, each with internal concurrency.
  process.stderr.write(`\n[sol] phase 2: fetching last-tx-per-day in parallel...\n`);
  const dailyByHolderArr = await Promise.all(
    HOLDERS.map((h, k) => processHolder(h, entriesPerHolder[k])),
  );
  const dailyByHolder: Record<string, Map<string, number>> = {};
  for (let k = 0; k < HOLDERS.length; k++) {
    const h = HOLDERS[k];
    dailyByHolder[`${h.label}:${h.symbol}`] = dailyByHolderArr[k];
  }

  // Reassemble EOD rows for the date range we walked: [walkFloor, today].
  // Earlier days are preserved from `existing` (committed daily.json).
  // Forward-fill per-holder so two Fireblocks owners holding the same mint
  // are summed (not overwritten). Seed the forward-fill from the last
  // existing EOD row before `walkFloor` so per-holder balances continue
  // smoothly across the incremental boundary.
  const dates = eachDay(walkFloor, todayUTC());
  const perHolderLast = new Map<string, number>();
  // Seed bridge holders from existing[walkFloor] aggregate (we don't store
  // per-holder history, but bridge has exactly one holder per mint so the
  // aggregate equals the holder balance). Fireblocks aggregate may sum
  // multiple owners; we accept that the very first incremental day might
  // not perfectly split per-owner — but as soon as a sig lands in the
  // walk range, it overrides this seed.
  const seedRow = existing.get(walkFloor);
  if (seedRow) {
    for (const h of HOLDERS) {
      const key = `${h.label}:${h.symbol}`;
      if (h.kind === 'bridge') {
        perHolderLast.set(key, h.symbol === 'USDT' ? seedRow.bridgeUsdt : seedRow.bridgeUsdc);
      } else {
        // Best-effort: divide Fireblocks total across owners by count.
        const fbHolders = HOLDERS.filter((x) => x.kind === 'fireblocks' && x.symbol === h.symbol).length;
        const tot = h.symbol === 'USDT' ? seedRow.fireblocksUsdt : seedRow.fireblocksUsdc;
        perHolderLast.set(key, fbHolders > 0 ? tot / fbHolders : 0);
      }
    }
  }

  for (const date of dates) {
    for (const h of HOLDERS) {
      const key = `${h.label}:${h.symbol}`;
      const v = dailyByHolder[key].get(date);
      if (typeof v === 'number') perHolderLast.set(key, v);
    }
    let bridgeUsdt = 0, bridgeUsdc = 0, fireblocksUsdt = 0, fireblocksUsdc = 0;
    for (const h of HOLDERS) {
      const v = perHolderLast.get(`${h.label}:${h.symbol}`) ?? 0;
      if (h.kind === 'bridge') {
        if (h.symbol === 'USDT') bridgeUsdt += v;
        else bridgeUsdc += v;
      } else {
        if (h.symbol === 'USDT') fireblocksUsdt += v;
        else fireblocksUsdc += v;
      }
    }
    existing.set(date, {
      date,
      bridgeUsdt: Math.round(bridgeUsdt * 100) / 100,
      bridgeUsdc: Math.round(bridgeUsdc * 100) / 100,
      fireblocksUsdt: Math.round(fireblocksUsdt * 100) / 100,
      fireblocksUsdc: Math.round(fireblocksUsdc * 100) / 100,
      usdt: Math.round((bridgeUsdt + fireblocksUsdt) * 100) / 100,
      usdc: Math.round((bridgeUsdc + fireblocksUsdc) * 100) / 100,
    });
  }

  const merged = Array.from(existing.values()).sort((a, b) => a.date.localeCompare(b.date));
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(merged, null, 2));
  process.stderr.write(
    `\n[sol] wrote ${merged.length} total rows (refreshed ${dates.length} this run) → ${OUT_FILE}\n`,
  );
  process.stderr.write(`[sol] last EOD: ${JSON.stringify(merged[merged.length - 1])}\n`);
}

main().catch((e) => {
  process.stderr.write(`\n${e}\n`);
  process.exit(1);
});
