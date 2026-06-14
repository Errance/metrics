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
    perpFees: round(d.ff + d.pf),
    predictionFees: round(predictionFees(d)),
    perpRevenue: round(splitRevenue(d).perp),
    predictionRevenue: round(splitRevenue(d).prediction),
  }));
  const sumPerpFees = daily.reduce((s, d) => s + d.ff + d.pf, 0);
  const sumPredictionFees = daily.reduce((s, d) => s + predictionFees(d), 0);
  const sumPerpRevenue = daily.reduce((s, d) => s + splitRevenue(d).perp, 0);
  const sumPredictionRevenue = daily.reduce((s, d) => s + splitRevenue(d).prediction, 0);
  return (
    <ChartShell
      title="Fees & Revenue"
      subtitle="Split by product line. Prediction fees and revenue are shown only as aggregate product-line metrics."
      totals={[
        { label: 'Perp fees', value: fmtUsd(sumPerpFees) },
        { label: 'Prediction fees', value: fmtUsd(sumPredictionFees) },
        { label: 'Perp revenue', value: fmtUsd(sumPerpRevenue) },
        { label: 'Prediction revenue', value: fmtUsd(sumPredictionRevenue) },
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
              <linearGradient id="gradPredictionFees" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent-2)" stopOpacity={0.45} />
                <stop offset="95%" stopColor="var(--accent-2)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--good)" stopOpacity={0.45} />
                <stop offset="95%" stopColor="var(--good)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradPredictionRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--series-pred)" stopOpacity={0.45} />
                <stop offset="95%" stopColor="var(--series-pred)" stopOpacity={0} />
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
              dataKey="perpFees"
              name="Perp fees"
              stroke="var(--accent)"
              fill="url(#gradFees)"
            />
            <Area
              type="monotone"
              dataKey="predictionFees"
              name="Prediction fees"
              stroke="var(--accent-2)"
              fill="url(#gradPredictionFees)"
            />
            <Area
              type="monotone"
              dataKey="perpRevenue"
              name="Perp revenue"
              stroke="var(--good)"
              fill="url(#gradRevenue)"
            />
            <Area
              type="monotone"
              dataKey="predictionRevenue"
              name="Prediction revenue"
              stroke="var(--series-pred)"
              fill="url(#gradPredictionRevenue)"
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

function predictionFees(d: Day): number {
  return Math.max(d.tf - d.ff - d.pf, 0);
}

function splitRevenue(d: Day): { perp: number; prediction: number } {
  const perpFees = d.ff + d.pf;
  const predFees = predictionFees(d);
  const totalFees = perpFees + predFees;
  if (totalFees <= 0) return { perp: 0, prediction: 0 };

  const perp = d.pr * (perpFees / totalFees);
  return { perp, prediction: d.pr - perp };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
