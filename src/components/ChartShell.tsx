import type { ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: string;
  totals?: { label: string; value: string }[];
  right?: ReactNode;
  children: ReactNode;
};

export function ChartShell({ title, subtitle, totals, right, children }: Props) {
  return (
    <section className="card">
      <header className="section-head" style={{ marginBottom: 14 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>{title}</h2>
          {subtitle ? <div className="section-sub">{subtitle}</div> : null}
        </div>
        <div className="row" style={{ gap: 20, flexWrap: 'wrap' }}>
          {totals?.map((t) => (
            <div key={t.label}>
              <div className="stat-label" style={{ marginBottom: 2 }}>{t.label}</div>
              <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 16 }}>
                {t.value}
              </div>
            </div>
          ))}
          {right}
        </div>
      </header>
      {children}
    </section>
  );
}
