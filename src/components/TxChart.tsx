import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Day } from '../lib/types';
import { fmtDateShort, fmtNum } from '../lib/format';
import { ChartShell } from './ChartShell';

type Props = { daily: Day[] };

export function TxChart({ daily }: Props) {
  const data = daily.map((d) => ({
    d: fmtDateShort(d.d),
    full: d.d,
    tx: d.tx,
  }));
  const total = daily.reduce((s, d) => s + d.tx, 0);
  const avg = daily.length > 0 ? total / daily.length : 0;
  return (
    <ChartShell
      title="Transactions"
      subtitle="Daily on-chain transactions"
      totals={[
        { label: 'Total', value: fmtNum(total) },
        { label: 'Avg/day', value: fmtNum(Math.round(avg)) },
      ]}
    >
      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="d" stroke="var(--text-dim)" tick={{ fontSize: 11 }} />
            <YAxis
              stroke="var(--text-dim)"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => fmtNum(v)}
              width={50}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              formatter={(v: number) => fmtNum(v)}
              labelFormatter={(_, p) => (p && p.length > 0 ? String(p[0].payload.full) : '')}
            />
            <Bar dataKey="tx" name="Transactions" fill="var(--accent)" />
          </BarChart>
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
