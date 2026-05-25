# TurboFlow Metrics Dashboard (internal)

Daily TVL, volume, fees, users, and tx counts for TurboFlow, back-filled from
on-chain RPC and Jerry's internal metrics API. Built as a static site, deployed
to GitHub Pages, refreshed once a day via GitHub Actions.

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

# refresh data + build daily.json
npm run refresh

# run UI locally
npm run dev        # → http://localhost:5173/
```

### Refresh data only (no rebuild)

```bash
npm run fetch:metrics
npm run fetch:tvl-bsc
npm run fetch:tvl-solana
npm run fetch:snapshot
npm run build:data
```

### Tunable env vars

| Var | Default | Notes |
| --- | --- | --- |
| `GENESIS_DATE` | `2025-10-19` | Earliest day to backfill |
| `BSC_RPC` | `https://bsc-mainnet.public.blastapi.io` | Must support `eth_call` at arbitrary historical blocks |
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

- `0 1 * * *` (01:00 UTC daily, ≈ 09:00 Beijing)
- `workflow_dispatch` (manual button)
- Push to `main` (e.g. UI tweaks)

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

- **`build-data.ts`** runs a self-check on every build, comparing today's
  back-filled total against the live `bridge-info` snapshot. If they differ by
  more than 5% or $1k (whichever is larger), it logs a `WARN`. Current run is
  within `$62` of live ($416,562 vs $416,624).
- **Forward-fill**: if an RPC call fails for a given day after retries, that
  day inherits the previous EOD balance (instead of going to zero). This keeps
  the chart visually monotone during transient outages.
- **Pagination of Solana signatures** is fixed to `api.mainnet-beta.solana.com`
  (deepest history). Lighter mirrors return empty page-2 responses that would
  silently truncate the walk.
- **BSC archive RPC**: the default `blastapi.io` public endpoint supports
  `eth_call` at arbitrary historical blocks. If you swap it out, make sure the
  replacement does too — most free RPCs only support a 128-block window.

## Open follow-ups

- `SIG Solana USDT` and `TFUSERS Solana USDC` addresses provided by ops are
  not yet indexed on chain (no signatures, no `getAccountInfo`). Once these
  vaults receive their first transfer, the fetcher will pick them up
  automatically; `4wHL...` is already listed in `HOLDERS`, `6FaXz...` will be
  added once the address is reconfirmed.
- This dashboard is **internal-only**. Public DefiLlama listing is handled by
  the separate `defillama-submission/` PRs against `DefiLlama-Adapters` and
  `DefiLlama/dimension-adapters`.
