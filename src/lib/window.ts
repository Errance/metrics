import type { Day, Window } from './types';

export const WINDOW_OPTIONS: { value: Window; label: string }[] = [
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: '180d', label: '180D' },
  { value: 'all', label: 'All' },
];

export function sliceWindow(rows: Day[], win: Window): Day[] {
  if (win === 'all') return rows;
  const n = win === '30d' ? 30 : win === '90d' ? 90 : 180;
  return rows.slice(-n);
}

export function sum<T extends Record<string, number | string>>(rows: T[], key: keyof T): number {
  let total = 0;
  for (const r of rows) {
    const v = r[key];
    if (typeof v === 'number' && Number.isFinite(v)) total += v;
  }
  return total;
}

export function latest<T>(rows: T[]): T | undefined {
  return rows.length > 0 ? rows[rows.length - 1] : undefined;
}
