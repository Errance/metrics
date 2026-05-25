export function fmtUsd(n: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(n)) return '$0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (opts.compact === false) {
    return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function fmtNum(n: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (opts.compact === false) {
    return n.toLocaleString('en-US');
  }
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(2)}k`;
  return n.toLocaleString('en-US');
}

export function fmtDateShort(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${m}/${d}`;
}

export function fmtDateLong(iso: string): string {
  const dt = new Date(`${iso}T00:00:00Z`);
  return dt.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function fmtDateTime(iso: string): string {
  const dt = new Date(iso);
  return dt.toLocaleString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}
