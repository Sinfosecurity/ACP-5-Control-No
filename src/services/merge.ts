// ============================================================
// services/merge.ts
// Merge and deduplicate filing records across sources
// ============================================================
import type { FilingRecord, FilingSource, SearchSummary } from '@/types';

// -----------------------------------------------------------------------
// Build a deduplication key from a record
// -----------------------------------------------------------------------
function dedupeKey(r: FilingRecord): string {
  const job  = (r.jobNumber    ?? '').trim().toUpperCase();
  const doc  = (r.filingNumber ?? '').trim().toUpperCase();
  if (job && doc) return `${job}::${doc}`;
  if (job)        return `job::${job}`;
  if (doc)        return `doc::${doc}`;
  // Fall back to source + description
  return `${r.source}::${r.datasetName ?? ''}::${r.description ?? ''}::${r.filingDate ?? ''}`;
}

// -----------------------------------------------------------------------
// Merge two records that share the same job/filing number
// -----------------------------------------------------------------------
function mergeRecords(primary: FilingRecord, secondary: FilingRecord): FilingRecord {
  // Prefer non-null values; prefer open_data as authoritative for status
  const merged: FilingRecord = { ...primary };

  for (const key of Object.keys(secondary) as (keyof FilingRecord)[]) {
    if (key === 'source' || key === 'raw') continue;
    // Fill in missing fields from secondary
    if (merged[key] == null && secondary[key] != null) {
      // @ts-ignore: dynamic key assignment
      merged[key] = secondary[key];
    }
  }

  merged.source = 'merged';
  merged.raw = {
    ...(primary.raw ?? {}),
    [`_from_${secondary.source}`]: secondary.raw ?? {},
  };

  return merged;
}

// -----------------------------------------------------------------------
// Main merge function
// -----------------------------------------------------------------------
export function mergeFilings(
  openDataRecords: FilingRecord[],
  liveRecords:     FilingRecord[]
): FilingRecord[] {
  const map = new Map<string, FilingRecord>();

  // Add open data first (authoritative)
  for (const r of openDataRecords) {
    const key = dedupeKey(r);
    map.set(key, r);
  }

  // Merge or add live records
  for (const r of liveRecords) {
    const key = dedupeKey(r);
    if (map.has(key)) {
      // Merge with existing open data record
      map.set(key, mergeRecords(map.get(key)!, r));
    } else {
      // New record only from live portal
      map.set(key, r);
    }
  }

  return Array.from(map.values());
}

// -----------------------------------------------------------------------
// Build summary statistics
// -----------------------------------------------------------------------
export function buildSummary(filings: FilingRecord[]): SearchSummary {
  const openData   = filings.filter(f => f.source === 'open_data').length;
  const livePortal = filings.filter(f => f.source === 'dob_now_live').length;
  const merged     = filings.filter(f => f.source === 'merged').length;

  // Dataset breakdown
  const datasetMap = new Map<string, { name: string; count: number }>();
  for (const f of filings) {
    if (!f.dataset) continue;
    const key = f.dataset;
    if (!datasetMap.has(key)) {
      datasetMap.set(key, { name: f.datasetName ?? key, count: 0 });
    }
    datasetMap.get(key)!.count += 1;
  }

  return {
    total:       filings.length,
    openData:    openData + merged,  // merged means it came from open data too
    livePortal:  livePortal + merged,
    merged,
    datasets:    Array.from(datasetMap.entries()).map(([id, d]) => ({
      datasetId:   id,
      datasetName: d.name,
      count:       d.count,
    })),
  };
}

// -----------------------------------------------------------------------
// Sort filings — most recent first, then by job number
// -----------------------------------------------------------------------
export function sortFilings(filings: FilingRecord[]): FilingRecord[] {
  return [...filings].sort((a, b) => {
    // Primary: filing date descending
    const dateA = a.filingDate ?? a.permitIssuedDate ?? '';
    const dateB = b.filingDate ?? b.permitIssuedDate ?? '';
    if (dateA && dateB) {
      return dateB.localeCompare(dateA);
    }
    if (dateA) return -1;
    if (dateB) return  1;

    // Secondary: job number descending (higher = more recent in NYC DOB)
    const jobA = a.jobNumber ?? '';
    const jobB = b.jobNumber ?? '';
    return jobB.localeCompare(jobA);
  });
}

// -----------------------------------------------------------------------
// Filter by source for UI
// -----------------------------------------------------------------------
export function filterBySource(
  filings: FilingRecord[],
  source: FilingSource | 'all'
): FilingRecord[] {
  if (source === 'all') return filings;
  return filings.filter(f => f.source === source || f.source === 'merged');
}
