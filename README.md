# TurboFlow Metrics Dashboard (internal)

Daily TVL, volume, fees, users, and tx counts for TurboFlow, back-filled from
on-chain RPC and the production metrics API. Built as a static site, deployed
to GitHub Pages, refreshed once a day via GitHub Actions.

## Data update strategy

The repo commits a **baseline data pack** (`src/data/daily.json`) that covers
every day from genesis up to the last successful refresh. The daily GitHub
Actions cron then runs an **incremental** refresh:

1. Each fetcher reads the committed `daily.json`.
2. It re-samples only the latest committed day onwards (typically 1–2 days).
3. `build-data.ts` merges the new rows into `daily.json` and writes the bundle.
4. The workflow commits the updated `daily.json` back to `main` and re-deploys.

This keeps each cron run rate-limit-safe (the metrics API only sees 1–2 dated
calls instead of 218) and resilient — if a refresh fails on a given day, the
baseline remains intact and the next cron picks up where the previous one
stopped.

Set `FULL_REFRESH=1` to force every fetcher to walk back to genesis. Use only
when you need to bootstrap from scratch.

> **Audience**: internal review + share-with-stakeholders link. The data shaping
> mirrors what we'll submit to DefiLlama, so partners get a "DefiLlama-style"
> preview before listing goes live.

## Live URL

After first deploy, the dashboard will live at:

```
https://errance.github.io/metrics/
```

## What's in the dashboard

| Section | Source | Window |
| --- | --- | --- |
| **Bridge TVL** (BSC + Solana, USDT/USDC) | Backfilled from BSC `eth_call balanceOf` and Solana `getTransaction` postTokenBalances | Genesis (2025-10-19) → yesterday UTC |
| **Daily volume** (perp + event) | `api4.turboflow.xyz/defillama/metrics?date=YYYY-MM-DD` (production) | last 180 days |
| **Fees & revenue** (flat fee, profit share, event fee) | same as above | last 180 days |
| **Users** (total, DAU, new) | same as above | last 180 days |
| **Tx count** | same as above | last 180 days |
| **Bridge custody snapshot** (current) | `bridge-info.turboflow.xyz` | live |

The TVL chart is split into:

- **Bridge contracts** — `eth_call`-verifiable balances of bridge custody on BSC
  and Solana.
- **Fireblocks MPC** — operating reserves held by TurboFlow in Fireblocks vaults.
  Currently only the BSC vaults (`SIG` and `TFUSERS`) are wired in. The Solana
  Fireblocks vaults are listed in `scripts/fetch-tvl-solana.ts` (`HOLDERS`
  array) but were not yet initialized on chain at the time of writing — they
  will start contributing data automatically after their first inbound transfer.

## Local development

```bash
nvm use            # uses .nvmrc → node 22
npm ci

# incremental refresh (~1 min) — reads daily.json, only re-samples latest day
npm run refresh

# full rebuild from genesis (slow, rate-limit-sensitive — use sparingly)
FULL_REFRESH=1 npm run refresh

# run UI locally
npm run dev        # → http://localhost:5173/
```

### Fetcher granularity (run individually)

```bash
npm run fetch:metrics       # 1 day fetch ≈ 1s
npm run fetch:tvl-bsc       # 2 days × 6 calls ≈ 5s
npm run fetch:tvl-solana    # ≈ 40s (mainnet-beta rate limit on sig listing)
npm run fetch:snapshot      # single REST call
npm run build:data          # local merge, no network
```

### Tunable env vars

| Var | Default | Notes |
| --- | --- | --- |
| `GENESIS_DATE` | `2025-10-19` | Earliest day to backfill (only used on first run / FULL_REFRESH) |
| `FULL_REFRESH` | unset | When `=1`, forces every fetcher to re-sample from genesis |
| `BSC_RPC` | `https://bsc-mainnet.public.blastapi.io` | Must support `eth_call` at arbitrary historical blocks |
| `METRICS_API_BASE` | `https://api4.turboflow.xyz` | Production metrics API |
| `SOLANA_RPCS` | `https://api.mainnet-beta.solana.com,https://solana-rpc.publicnode.com` | Comma-separated. First endpoint is used for signature pagination (needs deep history); all endpoints are round-robined for `getTransaction` |
| `SOL_CONCURRENCY` | `10` | Per-holder worker count for `getTransaction` |

## Deployment (GitHub Pages)

This repo is set up for **GitHub Pages → "GitHub Actions" source**, not legacy
branch-based deploy. After first push:

1. Push the repo (see below).
2. In GitHub UI → **Settings → Pages** → **Build and deployment → Source** →
   choose **GitHub Actions**.
3. The first run of `.github/workflows/update-and-deploy.yml` will publish to
   `https://<user>.github.io/<repo>/`.
4. Subsequent daily updates run automatically at 01:00 UTC.

### Manual refresh + redeploy

In the **Actions** tab → **Refresh data and deploy** → **Run workflow**.

### Trigger schedule

- `0 2 * * *` (02:00 UTC daily, ≈ 10:00 Beijing — gives the metrics API time
  to settle yesterday's data)
- `workflow_dispatch` (manual button — runs incremental refresh too)
- Push to `main` (UI tweaks; data step still runs but typically a no-op)

The workflow has `permissions.contents: write` so it can commit the refreshed
`src/data/daily.json` back to `main` (with `[skip ci]` to avoid recursion).

## File layout

```
turboflow-metrics-dashboard/
├── .github/workflows/update-and-deploy.yml   # daily cron + Pages deploy
├── index.html                                 # Vite entry
├── package.json
├── vite.config.ts                             # base path = repo name
├── scripts/                                   # ETL (TypeScript, run with tsx)
│   ├── fetch-metrics.ts                       # Jerry API → cache/metrics.json
│   ├── fetch-tvl-bsc.ts                       # BSC eth_call → cache/tvl-bsc.json
│   ├── fetch-tvl-solana.ts                    # Solana getTransaction → cache/tvl-solana.json
│   ├── fetch-snapshot.ts                      # bridge-info snapshot → cache/snapshot.json
│   ├── build-data.ts                          # merge → src/data/daily.json + self-check
│   └── .cache/                                # gitignored
└── src/                                       # React UI
    ├── App.tsx
    ├── main.tsx
    ├── components/                            # *Chart, BridgeCustodyDetail, StatCard, ...
    ├── lib/                                   # types, format, window
    └── data/daily.json                        # committed; the only file the UI reads
```

## Data integrity notes

- **Incremental fetchers** read `src/data/daily.json` to determine where to
  resume. They re-sample the latest committed day (to absorb any late
  revisions / reorgs) and every day after it through today. Earlier history
  in `daily.json` is treated as immutable.
- **`fetch-metrics.ts`** uses 6-step exponential backoff (1s → 60s, ~2min
  per stubborn date) and throws on persistent failure instead of silently
  writing zeros — so a rate-limited day will fail the workflow rather than
  poison the baseline. Concurrency is fixed to 1.
- **`build-data.ts`** runs a self-check on every build, comparing the bridge
  backfill against the live `bridge-info` snapshot. If they differ by more
  than 5% or $1k (whichever is larger), it logs `WARN`. Fireblocks balances
  are excluded from the self-check because the live snapshot doesn't surface
  them.
- **Solana balance extraction** uses `(mint, owner)` matching against
  `postTokenBalances.owner` (RPC-encoding-agnostic), with `accountIndex` as a
  fallback for legacy/v0 transactions that omit the `owner` field.
- **Pagination of Solana signatures** is fixed to `api.mainnet-beta.solana.com`
  (deepest history). Lighter mirrors return empty page-2 responses that would
  silently truncate the walk.
- **BSC archive RPC**: the default `blastapi.io` public endpoint supports
  `eth_call` at arbitrary historical blocks. If you swap it out, make sure the
  replacement does too — most free RPCs only support a 128-block window.

## Open follow-ups

- **Boss feedback (pending)**: split daily "Volume" and "Fees" stat cards/
  charts into separate `Perp` and `Prediction (event contracts)` dimensions —
  these aren't comparable units and shouldn't be summed in one figure. The
  underlying `MetricRow.pv` (perp) and `MetricRow.ev` (event) are already
  separate; only UI presentation needs to change.
- This dashboard is **internal-only**. Public DefiLlama listing is handled by
  the separate `defillama-submission/` PRs against `DefiLlama-Adapters` and
  `DefiLlama/dimension-adapters`.
