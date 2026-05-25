import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Day } from '../lib/types';
import { fmtDateShort, fmtNum } from '../lib/format';
import { ChartShell } from './ChartShell';

type Props = { daily: Day[] };

export function UsersChart({ daily }: Props) {
  const data = daily.map((d) => ({
    d: fmtDateShort(d.d),
    full: d.d,
    total: d.u,
    dau: d.dau,
    nu: d.nu,
  }));
  const totalUsersLast = daily.at(-1)?.u ?? 0;
  const newUsersSum = daily.reduce((s, d) => s + d.nu, 0);
  const avgDau =
    daily.length > 0 ? daily.reduce((s, d) => s + d.dau, 0) / daily.length : 0;
  return (
    <ChartShell
      title="Users"
      subtitle="Cumulative wallets, daily active, and new wallets"
      totals={[
        { label: 'Total wallets', value: fmtNum(totalUsersLast) },
        { label: 'Avg DAU', value: fmtNum(Math.round(avgDau * 10) / 10) },
        { label: 'New (window)', value: fmtNum(newUsersSum) },
      ]}
    >
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="d" stroke="var(--text-dim)" tick={{ fontSize: 11 }} />
            <YAxis
              yAxisId="left"
              stroke="var(--text-dim)"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => fmtNum(v)}
              width={50}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="var(--text-dim)"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => fmtNum(v)}
              width={50}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              formatter={(v: number) => fmtNum(v)}
              labelFormatter={(_, p) => (p && p.length > 0 ? String(p[0].payload.full) : '')}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              yAxisId="right"
              dataKey="dau"
              name="Daily active"
              fill="var(--accent-2)"
              opacity={0.7}
            />
            <Bar
              yAxisId="right"
              dataKey="nu"
              name="New wallets"
              fill="var(--warn)"
              opacity={0.85}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="total"
              name="Total wallets (cumulative)"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
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
