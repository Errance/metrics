type Props = {
  label: string;
  value: string;
  sub?: string;
};

export function StatCard({ label, value, sub }: Props) {
  return (
    <div className="card card-tight">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}
