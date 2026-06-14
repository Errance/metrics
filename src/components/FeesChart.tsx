import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Day } from '../lib/types';
import { fmtDateShort, fmtUsd } from '../lib/format';
import { ChartShell } from './ChartShell';

type Props = { daily: Day[] };

export function FeesChart({ daily }: Props) {
  const data = daily.map((d) => ({
    d: fmtDateShort(d.d),
    full: d.d,
    fees: Math.round(d.tf * 100) / 100,
    revenue: Math.round(d.pr * 100) / 100,
  }));
  const sumFees = daily.reduce((s, d) => s + d.tf, 0);
  const sumRevenue = daily.reduce((s, d) => s + d.pr, 0);
  const sumSupplySide = daily.reduce((s, d) => s + d.ssr, 0);
  const sumHolders = daily.reduce((s, d) => s + d.hr, 0);
  return (
    <ChartShell
      title="Fees & Revenue"
      subtitle="Aggregate protocol-level fees and revenue."
      totals={[
        { label: 'Fees', value: fmtUsd(sumFees) },
        { label: 'Revenue', value: fmtUsd(sumRevenue) },
        { label: 'Supply-side', value: fmtUsd(sumSupplySide) },
        { label: 'Holders', value: fmtUsd(sumHolders) },
      ]}
    >
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="gradFees" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.45} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--good)" stopOpacity={0.45} />
                <stop offset="95%" stopColor="var(--good)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="d" stroke="var(--text-dim)" tick={{ fontSize: 11 }} />
            <YAxis
              stroke="var(--text-dim)"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => fmtUsd(v)}
              width={70}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              formatter={(v: number) => fmtUsd(v)}
              labelFormatter={(_, p) => (p && p.length > 0 ? String(p[0].payload.full) : '')}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area
              type="monotone"
              dataKey="fees"
              name="Fees"
              stroke="var(--accent)"
              fill="url(#gradFees)"
            />
            <Area
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke="var(--good)"
              fill="url(#gradRevenue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  );
}

const tooltipStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
};
const tooltipLabelStyle = { color: 'var(--text-muted)' };
const tooltipItemStyle = { color: 'var(--text)' };
