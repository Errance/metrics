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

const COLOR_PERP = 'var(--series-perp)';
const COLOR_PRED = 'var(--series-pred)';

/**
 * DefiLlama-style dual-axis overlapping bars. Perp uses the LEFT y-axis,
 * Prediction (event contracts) uses the RIGHT y-axis. They are NOT summed —
 * each occupies the same x-position with two thin bars overlaid, so it's
 * visually obvious that they're two independent dimensions of the business.
 */
export function VolumeChart({ daily }: Props) {
  const data = daily.map((d) => ({
    d: fmtDateShort(d.d),
    full: d.d,
    perp: Math.round(d.pv * 100) / 100,
    pred: Math.round(d.ev * 100) / 100,
  }));
  const sumPerp = daily.reduce((s, d) => s + d.pv, 0);
  const sumPred = daily.reduce((s, d) => s + d.ev, 0);
  return (
    <ChartShell
      title="Daily Volume"
      subtitle="Perp (left axis) and prediction-market (right axis) are independent dimensions — not summed."
      totals={[
        { label: 'Perp total', value: fmtUsd(sumPerp) },
        { label: 'Prediction total', value: fmtUsd(sumPred) },
      ]}
    >
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <BarChart
            data={data}
            margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
            // barGap=-100% makes the two series occupy the same x-slot
            // (overlapping), instead of being placed side-by-side.
            barGap="-100%"
            barCategoryGap="20%"
          >
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="d" stroke="var(--text-dim)" tick={{ fontSize: 11 }} />
            <YAxis
              yAxisId="perp"
              orientation="left"
              stroke={COLOR_PERP}
              tick={{ fontSize: 11, fill: COLOR_PERP }}
              tickFormatter={(v) => fmtUsd(v)}
              width={70}
            />
            <YAxis
              yAxisId="pred"
              orientation="right"
              stroke={COLOR_PRED}
              tick={{ fontSize: 11, fill: COLOR_PRED }}
              tickFormatter={(v) => fmtUsd(v)}
              width={70}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              formatter={(v: number, name) => [fmtUsd(v), name]}
              labelFormatter={(_, p) => (p && p.length > 0 ? String(p[0].payload.full) : '')}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="perp" dataKey="perp" name="Perp volume" fill={COLOR_PERP} />
            {/* fillOpacity lets the perp bar bleed through visually on big
                 perp days — the goal is "two independent series at the same
                 date", not a stacked sum. */}
            <Bar
              yAxisId="pred"
              dataKey="pred"
              name="Prediction volume"
              fill={COLOR_PRED}
              fillOpacity={0.78}
            />
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
