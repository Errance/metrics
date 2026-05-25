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
    flat: Math.round(d.ff * 100) / 100,
    profit: Math.round(d.pf * 100) / 100,
    event: Math.round(d.ef * 100) / 100,
  }));
  const sumFlat = daily.reduce((s, d) => s + d.ff, 0);
  const sumProfit = daily.reduce((s, d) => s + d.pf, 0);
  const sumEvent = daily.reduce((s, d) => s + d.ef, 0);
  return (
    <ChartShell
      title="Fees & Revenue"
      subtitle="Flat fee + profit share + event-contract fee"
      totals={[
        { label: 'Flat', value: fmtUsd(sumFlat) },
        { label: 'Profit share', value: fmtUsd(sumProfit) },
        { label: 'Event', value: fmtUsd(sumEvent) },
        { label: 'Total', value: fmtUsd(sumFlat + sumProfit + sumEvent) },
      ]}
    >
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="gradFlat" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.45} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--good)" stopOpacity={0.45} />
                <stop offset="95%" stopColor="var(--good)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradEvent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent-2)" stopOpacity={0.45} />
                <stop offset="95%" stopColor="var(--accent-2)" stopOpacity={0} />
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
              dataKey="flat"
              name="Flat fee"
              stackId="f"
              stroke="var(--accent)"
              fill="url(#gradFlat)"
            />
            <Area
              type="monotone"
              dataKey="profit"
              name="Profit share"
              stackId="f"
              stroke="var(--good)"
              fill="url(#gradProfit)"
            />
            <Area
              type="monotone"
              dataKey="event"
              name="Event fee"
              stackId="f"
              stroke="var(--accent-2)"
              fill="url(#gradEvent)"
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
