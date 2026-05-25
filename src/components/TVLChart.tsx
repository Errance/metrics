import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Day } from '../lib/types';
import { fmtDateShort, fmtUsd } from '../lib/format';
import { ChartShell } from './ChartShell';

type Props = {
  daily: Day[];
};

type Mode = 'stacked' | 'total';

const COLORS = {
  bscBridgeUsdt: 'var(--bsc-usdt)',
  bscBridgeUsdc: 'var(--bsc-usdc)',
  solBridgeUsdt: 'var(--sol-usdt)',
  solBridgeUsdc: 'var(--sol-usdc)',
  bscFireblocks: 'var(--accent-2, #c2a8ff)',
  solFireblocks: 'var(--accent, #e6c976)',
  total: 'var(--accent)',
};

export function TVLChart({ daily }: Props) {
  const [mode, setMode] = useState<Mode>('stacked');

  const hasFireblocks = daily.some(
    (d) =>
      d.tvlBscFireblocksUsdt +
        d.tvlBscFireblocksUsdc +
        d.tvlSolFireblocksUsdt +
        d.tvlSolFireblocksUsdc >
      0,
  );

  const data = daily.map((d) => ({
    d: fmtDateShort(d.d),
    full: d.d,
    bscBridgeUsdt: round(d.tvlBscBridgeUsdt),
    bscBridgeUsdc: round(d.tvlBscBridgeUsdc),
    solBridgeUsdt: round(d.tvlSolBridgeUsdt),
    solBridgeUsdc: round(d.tvlSolBridgeUsdc),
    bscFireblocks: round(d.tvlBscFireblocksUsdt + d.tvlBscFireblocksUsdc),
    solFireblocks: round(d.tvlSolFireblocksUsdt + d.tvlSolFireblocksUsdc),
    bridgeOnly: round(d.tvlBridgeOnly),
    fireblocks: round(d.tvlFireblocks),
    total: round(d.tvlTotal),
  }));

  const last = daily.at(-1);
  const peak = daily.reduce((acc, d) => (d.tvlTotal > acc ? d.tvlTotal : acc), 0);

  return (
    <ChartShell
      title="Bridge TVL"
      subtitle={
        hasFireblocks
          ? 'Bridge contract custody (BSC + Solana) + Fireblocks MPC operating reserves.'
          : 'On-chain bridge custody balances on BSC + Solana. Fireblocks MPC custody not yet wired in (Solana vault addresses pending confirmation).'
      }
      totals={[
        { label: 'Current', value: fmtUsd(last?.tvlTotal ?? 0) },
        { label: `Peak (${rangeLabel(daily)})`, value: fmtUsd(peak) },
      ]}
      right={
        <div className="btn-group" role="group" aria-label="TVL display mode">
          <button
            type="button"
            className={mode === 'stacked' ? 'active' : ''}
            onClick={() => setMode('stacked')}
          >
            Breakdown
          </button>
          <button
            type="button"
            className={mode === 'total' ? 'active' : ''}
            onClick={() => setMode('total')}
          >
            Total
          </button>
        </div>
      }
    >
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          {mode === 'stacked' ? (
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="d" stroke="var(--text-dim)" tick={{ fontSize: 11 }} />
              <YAxis
                stroke="var(--text-dim)"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => fmtUsd(v)}
                width={70}
              />
              <Tooltip content={<TvlTooltip mode="stacked" />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="bscBridgeUsdt" name="BSC bridge USDT" stackId="t" fill={COLORS.bscBridgeUsdt} />
              <Bar dataKey="bscBridgeUsdc" name="BSC bridge USDC" stackId="t" fill={COLORS.bscBridgeUsdc} />
              <Bar dataKey="solBridgeUsdt" name="SOL bridge USDT" stackId="t" fill={COLORS.solBridgeUsdt} />
              <Bar dataKey="solBridgeUsdc" name="SOL bridge USDC" stackId="t" fill={COLORS.solBridgeUsdc} />
              {hasFireblocks && (
                <Bar
                  dataKey="bscFireblocks"
                  name="BSC Fireblocks"
                  stackId="t"
                  fill={COLORS.bscFireblocks}
                />
              )}
              {hasFireblocks && (
                <Bar
                  dataKey="solFireblocks"
                  name="SOL Fireblocks"
                  stackId="t"
                  fill={COLORS.solFireblocks}
                />
              )}
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="d" stroke="var(--text-dim)" tick={{ fontSize: 11 }} />
              <YAxis
                stroke="var(--text-dim)"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => fmtUsd(v)}
                width={70}
              />
              <Tooltip content={<TvlTooltip mode="total" />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="bridgeOnly"
                name="Bridge contracts"
                stroke={COLORS.bscBridgeUsdt}
                strokeWidth={2}
                dot={false}
              />
              {hasFireblocks && (
                <Line
                  type="monotone"
                  dataKey="fireblocks"
                  name="Fireblocks"
                  stroke={COLORS.bscFireblocks}
                  strokeWidth={2}
                  dot={false}
                />
              )}
              <Line
                type="monotone"
                dataKey="total"
                name="Total"
                stroke={COLORS.total}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </ChartShell>
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function rangeLabel(daily: Day[]): string {
  if (daily.length === 0) return '';
  return `${daily.length}d`;
}

function TvlTooltip(props: { mode: Mode } & Record<string, unknown>) {
  const { mode } = props;
  const active = (props as { active?: boolean }).active;
  const payload = (props as { payload?: { payload: { full: string; [k: string]: unknown } }[] })
    .payload;
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  const total =
    Number(row.bscBridgeUsdt) +
    Number(row.bscBridgeUsdc) +
    Number(row.solBridgeUsdt) +
    Number(row.solBridgeUsdc) +
    Number(row.bscFireblocks) +
    Number(row.solFireblocks);
  return (
    <div className="card card-tight" style={{ minWidth: 200 }}>
      <div className="stat-label" style={{ marginBottom: 6 }}>
        {String(row.full)}
      </div>
      {mode === 'stacked' ? (
        <>
          <Line2 label="BSC bridge USDT" value={Number(row.bscBridgeUsdt)} />
          <Line2 label="BSC bridge USDC" value={Number(row.bscBridgeUsdc)} />
          <Line2 label="SOL bridge USDT" value={Number(row.solBridgeUsdt)} />
          <Line2 label="SOL bridge USDC" value={Number(row.solBridgeUsdc)} />
          {Number(row.bscFireblocks) + Number(row.solFireblocks) > 0 && (
            <>
              <Line2 label="BSC Fireblocks" value={Number(row.bscFireblocks)} />
              <Line2 label="SOL Fireblocks" value={Number(row.solFireblocks)} />
            </>
          )}
          <div className="divider" style={{ margin: '6px 0' }} />
          <Line2 label="Total" value={total} bold />
        </>
      ) : (
        <>
          <Line2 label="Bridge contracts" value={Number(row.bridgeOnly)} />
          {Number(row.fireblocks) > 0 && <Line2 label="Fireblocks" value={Number(row.fireblocks)} />}
          <div className="divider" style={{ margin: '6px 0' }} />
          <Line2 label="Total" value={Number(row.total)} bold />
        </>
      )}
    </div>
  );
}

function Line2({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="kv" style={{ borderBottom: 'none', padding: '2px 0' }}>
      <span className="kv-label">{label}</span>
      <span className="kv-value" style={{ fontWeight: bold ? 600 : 400 }}>
        {fmtUsd(value)}
      </span>
    </div>
  );
}
