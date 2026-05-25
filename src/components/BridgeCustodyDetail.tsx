import type { Day, Snapshot } from '../lib/types';
import { fmtUsd } from '../lib/format';

type Props = {
  snapshot: Snapshot;
  latest: Day;
};

const BSC_BRIDGE = '0x145CD0d5C3dD0eF1405dCf1b4D2BCE7c611625dB';
const SOL_USDC_ACCOUNT = '9ayXbTyhkJ49WtG6DA2PCN6EAKtM8DCneMzhJPTMRWcj';
const SOL_USDT_ACCOUNT = '6hVp2UaWWQwGo2c6yHj39WJWDNenR48GsLGKPzSa7EU2';
const SOL_OWNER = '8iquHJQyXUq8ykTEKZjtS4wSHKnxiw4ghGWUNzPnA9Q4';

const FIREBLOCKS_BSC_SIG = '0x8757f9E16d775759671e95e50D749CECCDA375AE';
const FIREBLOCKS_BSC_TFUSERS = '0x077Ab3f5D4372cA14c6AA417215Af3d91B55bAFc';
// Solana Fireblocks vault SPL token accounts: pending confirmation from ops
// (addresses provided so far do not resolve as SPL token accounts on chain).

export function BridgeCustodyDetail({ snapshot, latest }: Props) {
  const bscFireblocksTotal = latest.tvlBscFireblocksUsdt + latest.tvlBscFireblocksUsdc;
  const solFireblocksTotal = latest.tvlSolFireblocksUsdt + latest.tvlSolFireblocksUsdc;
  const fireblocksTotal = bscFireblocksTotal + solFireblocksTotal;
  const grandTotal = latest.tvlTotal;

  return (
    <section className="card">
      <header className="section-head" style={{ marginBottom: 14 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Custody Detail (current)</h2>
          <div className="section-sub">
            On-chain bridge balances from{' '}
            <a href="https://bridge-info.turboflow.xyz/explorer/" target="_blank" rel="noreferrer">
              bridge-info.turboflow.xyz
            </a>{' '}
            + Fireblocks MPC vault balances from BSC RPC (read at last refresh{' '}
            <span className="mono">{latest.d}</span>).
          </div>
        </div>
      </header>

      <div className="grid grid-2">
        <div>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>BSC bridge contract</h3>
          <div className="kv">
            <span className="kv-label">Address</span>
            <a
              className="kv-value mono"
              href={`https://bscscan.com/address/${BSC_BRIDGE}`}
              target="_blank"
              rel="noreferrer"
            >
              {short(BSC_BRIDGE)}
            </a>
          </div>
          <div className="kv">
            <span className="kv-label">USDT</span>
            <span className="kv-value">{fmtUsd(snapshot.bsc.usdt, { compact: false })}</span>
          </div>
          <div className="kv">
            <span className="kv-label">USDC</span>
            <span className="kv-value">{fmtUsd(snapshot.bsc.usdc, { compact: false })}</span>
          </div>
          <div className="kv">
            <span className="kv-label">Subtotal</span>
            <span className="kv-value" style={{ fontWeight: 600 }}>
              {fmtUsd(snapshot.bsc.usdt + snapshot.bsc.usdc, { compact: false })}
            </span>
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Solana bridge SPL accounts</h3>
          <div className="kv">
            <span className="kv-label">Owner / authority</span>
            <a
              className="kv-value mono"
              href={`https://solscan.io/account/${SOL_OWNER}`}
              target="_blank"
              rel="noreferrer"
            >
              {short(SOL_OWNER)}
            </a>
          </div>
          <div className="kv">
            <span className="kv-label">USDT account</span>
            <a
              className="kv-value mono"
              href={`https://solscan.io/account/${SOL_USDT_ACCOUNT}`}
              target="_blank"
              rel="noreferrer"
            >
              {short(SOL_USDT_ACCOUNT)}
            </a>
          </div>
          <div className="kv">
            <span className="kv-label">USDC account</span>
            <a
              className="kv-value mono"
              href={`https://solscan.io/account/${SOL_USDC_ACCOUNT}`}
              target="_blank"
              rel="noreferrer"
            >
              {short(SOL_USDC_ACCOUNT)}
            </a>
          </div>
          <div className="kv">
            <span className="kv-label">USDT</span>
            <span className="kv-value">{fmtUsd(snapshot.solana.usdt, { compact: false })}</span>
          </div>
          <div className="kv">
            <span className="kv-label">USDC</span>
            <span className="kv-value">{fmtUsd(snapshot.solana.usdc, { compact: false })}</span>
          </div>
          <div className="kv">
            <span className="kv-label">Subtotal</span>
            <span className="kv-value" style={{ fontWeight: 600 }}>
              {fmtUsd(snapshot.solana.usdt + snapshot.solana.usdc, { compact: false })}
            </span>
          </div>
        </div>
      </div>

      <div className="divider" />

      <div>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>
          Fireblocks MPC custody (operating reserves)
        </h3>
        <div className="grid grid-2">
          <div>
            <div className="kv">
              <span className="kv-label">BSC vault — SIG</span>
              <a
                className="kv-value mono"
                href={`https://bscscan.com/address/${FIREBLOCKS_BSC_SIG}`}
                target="_blank"
                rel="noreferrer"
              >
                {short(FIREBLOCKS_BSC_SIG)}
              </a>
            </div>
            <div className="kv">
              <span className="kv-label">BSC vault — TFUSERS</span>
              <a
                className="kv-value mono"
                href={`https://bscscan.com/address/${FIREBLOCKS_BSC_TFUSERS}`}
                target="_blank"
                rel="noreferrer"
              >
                {short(FIREBLOCKS_BSC_TFUSERS)}
              </a>
            </div>
            <div className="kv">
              <span className="kv-label">USDT (BSC, combined)</span>
              <span className="kv-value">
                {fmtUsd(latest.tvlBscFireblocksUsdt, { compact: false })}
              </span>
            </div>
            <div className="kv">
              <span className="kv-label">USDC (BSC, combined)</span>
              <span className="kv-value">
                {fmtUsd(latest.tvlBscFireblocksUsdc, { compact: false })}
              </span>
            </div>
            <div className="kv">
              <span className="kv-label">Subtotal (BSC vaults)</span>
              <span className="kv-value" style={{ fontWeight: 600 }}>
                {fmtUsd(bscFireblocksTotal, { compact: false })}
              </span>
            </div>
          </div>
          <div>
            <div className="kv">
              <span className="kv-label">Solana SPL vaults</span>
              <span className="kv-value" style={{ color: 'var(--text-dim)' }}>
                {solFireblocksTotal > 0
                  ? fmtUsd(solFireblocksTotal, { compact: false })
                  : 'pending on-chain init'}
              </span>
            </div>
            <div className="kv">
              <span className="kv-label">Subtotal (all Fireblocks)</span>
              <span className="kv-value" style={{ fontWeight: 600 }}>
                {fmtUsd(fireblocksTotal, { compact: false })}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="divider" />

      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div className="stat-label">Total custody (bridge contracts + Fireblocks)</div>
          <div className="stat-value" style={{ fontSize: 22 }}>
            {fmtUsd(grandTotal, { compact: false })}
          </div>
          <div className="stat-label" style={{ marginTop: 4, fontSize: 11 }}>
            = bridge {fmtUsd(latest.tvlBridgeOnly, { compact: false })} + Fireblocks{' '}
            {fmtUsd(fireblocksTotal, { compact: false })}
          </div>
        </div>
        {snapshot.fireblocksPending ? (
          <span className="pill pill-warn">Solana Fireblocks vault pending</span>
        ) : (
          <span className="pill pill-good">All custody addresses verified</span>
        )}
      </div>
    </section>
  );
}

function short(s: string): string {
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}
