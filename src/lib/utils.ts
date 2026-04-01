// ============================================================
// lib/utils.ts — Shared helpers
// ============================================================
import { type ClassValue, clsx } from 'clsx';
import { format, parseISO, isValid } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// -----------------------------------------------------------------------
// Date helpers
// -----------------------------------------------------------------------
export function formatDate(value: string | Date | null | undefined, fmt = 'MMM d, yyyy'): string {
  if (!value) return '—';
  try {
    const d = typeof value === 'string' ? parseISO(value) : value;
    if (!isValid(d)) return String(value);
    return format(d, fmt);
  } catch {
    return String(value);
  }
}

export function formatDateShort(value: string | Date | null | undefined): string {
  return formatDate(value, 'MM/dd/yy');
}

// -----------------------------------------------------------------------
// String helpers
// -----------------------------------------------------------------------
export function truncate(str: string, max = 80): string {
  if (!str || str.length <= max) return str ?? '';
  return str.slice(0, max - 1) + '…';
}

export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function titleCase(str: string): string {
  return str.split(' ').map(capitalize).join(' ');
}

/** Remove leading/trailing whitespace and collapse internal whitespace */
export function cleanString(s: string | undefined | null): string | undefined {
  if (s == null) return undefined;
  const c = s.replace(/\s+/g, ' ').trim();
  return c || undefined;
}

// -----------------------------------------------------------------------
// Filing status color helpers
// -----------------------------------------------------------------------
export type StatusColor = 'green' | 'yellow' | 'red' | 'blue' | 'gray';

export function getStatusColor(status: string | undefined): StatusColor {
  if (!status) return 'gray';
  const s = status.toUpperCase();

  if (['APPROVED', 'ISSUED', 'ACTIVE', 'COMPLETE', 'SIGNOFF'].some(k => s.includes(k))) return 'green';
  if (['PENDING', 'SUBMITTED', 'IN PROCESS', 'UNDER REVIEW', 'PLAN EXAM'].some(k => s.includes(k))) return 'yellow';
  if (['EXPIRED', 'CANCELLED', 'REJECTED', 'REVOKED', 'DISAPPROVED'].some(k => s.includes(k))) return 'red';
  if (['FILED', 'ACCEPTED'].some(k => s.includes(k))) return 'blue';

  return 'gray';
}

// -----------------------------------------------------------------------
// CSV export helper
// -----------------------------------------------------------------------
import type { FilingRecord } from '@/types';

export function filingsToCsv(filings: FilingRecord[]): string {
  if (filings.length === 0) return '';

  const headers: (keyof FilingRecord)[] = [
    'source', 'datasetName', 'jobNumber', 'filingNumber', 'filingStatus',
    'jobType', 'workType', 'address', 'permitNumber', 'filingDate',
    'permitIssuedDate', 'permitExpirationDate', 'signoffDate', 'description',
  ];

  const escape = (v: unknown): string => {
    const s = v == null ? '' : String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const rows = [
    headers.join(','),
    ...filings.map(f => headers.map(h => escape(f[h])).join(',')),
  ];

  return rows.join('\n');
}

// -----------------------------------------------------------------------
// Sleep
// -----------------------------------------------------------------------
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// -----------------------------------------------------------------------
// Retry with exponential backoff
// -----------------------------------------------------------------------
export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 3, baseDelayMs = 500 } = {}
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await sleep(baseDelayMs * Math.pow(2, attempt));
      }
    }
  }
  throw lastError;
}
