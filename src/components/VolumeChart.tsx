import {
  Bar,
  BarChart,
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

export function VolumeChart({ daily }: Props) {
  const data = daily.map((d) => ({
    d: fmtDateShort(d.d),
    full: d.d,
    perp: Math.round(d.pv * 100) / 100,
    event: Math.round(d.ev * 100) / 100,
  }));
  const sumPerp = daily.reduce((s, d) => s + d.pv, 0);
  const sumEvent = daily.reduce((s, d) => s + d.ev, 0);
  return (
    <ChartShell
      title="Daily Volume"
      subtitle="Perpetual notional + prediction-market settled volume"
      totals={[
        { label: 'Perp total', value: fmtUsd(sumPerp) },
        { label: 'Event total', value: fmtUsd(sumEvent) },
        { label: 'Total', value: fmtUsd(sumPerp + sumEvent) },
      ]}
    >
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="d" stroke="var(--text-dim)" tick={{ fontSize: 11 }} />
            <YAxis
              stroke="var(--text-dim)"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => fmtUsd(v)}
              width={70}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              formatter={(v: number) => fmtUsd(v)}
              labelFormatter={(_, p) => (p && p.length > 0 ? String(p[0].payload.full) : '')}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="perp" name="Perp volume" stackId="v" fill="var(--accent)" />
            <Bar dataKey="event" name="Event volume" stackId="v" fill="var(--accent-2)" />
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
