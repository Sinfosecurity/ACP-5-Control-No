'use client';

import { useState, useMemo } from 'react';
import { StatusBadge, SourceBadge } from './Badges';
import { DetailDrawer } from './DetailDrawer';
import { formatDateShort, truncate } from '@/lib/utils';
import type { FilingRecord, FilingSource } from '@/types';

interface ResultsTableProps {
  filings:      FilingRecord[];
  onExport:     () => void;
  isExporting:  boolean;
  houseNumber?: string;
  streetName?:  string;
  borough?:     string;
}

type SortField = 'filingDate' | 'jobNumber' | 'filingStatus' | 'source' | 'jobType' | 'workType';
type SortDir = 'asc' | 'desc';
type SourceFilter = 'all' | FilingSource;

const SOURCE_FILTER_OPTIONS: { label: string; value: SourceFilter }[] = [
  { label: 'All Records', value: 'all' },
  { label: 'DOB Portal',   value: 'dob_now_live' },
];

export function ResultsTable({ filings, onExport, isExporting, houseNumber, streetName, borough }: ResultsTableProps) {
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [sortField,    setSortField]    = useState<SortField>('filingDate');
  const [sortDir,      setSortDir]      = useState<SortDir>('desc');
  const [search,       setSearch]       = useState('');

  // ---- Filter ----
  const filtered = useMemo(() => {
    let rows = filings;

    if (sourceFilter !== 'all') {
      rows = rows.filter(f => f.source === sourceFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(f =>
        [f.jobNumber, f.filingNumber, f.description, f.jobType, f.workType,
         f.filingStatus, f.address, f.permitNumber]
          .some(v => v?.toLowerCase().includes(q))
      );
    }

    return rows;
  }, [filings, sourceFilter, search]);

  // ---- Sort ----
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = String(a[sortField as keyof FilingRecord] ?? '');
      const vb = String(b[sortField as keyof FilingRecord] ?? '');
      const cmp = va.localeCompare(vb);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function toggleExpand(idx: number) {
    const key = String(idx);
    setExpandedId(prev => prev === key ? null : key);
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-indigo-500 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  function ThSortable({ field, children }: { field: SortField; children: React.ReactNode }) {
    return (
      <th
        onClick={() => toggleSort(field)}
        className="cursor-pointer select-none hover:text-indigo-600 transition-colors"
      >
        {children}<SortIcon field={field} />
      </th>
    );
  }

  if (filings.length === 0) {
    return (
      <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-16 text-center animate-fade-in">
        <div className="text-5xl mb-4">🏛️</div>
        <h3 className="text-lg font-semibold text-gray-700 mb-1"
            style={{ fontFamily: 'var(--font-display)' }}>
          No Records Found
        </h3>
        <p className="text-sm text-gray-400 max-w-sm mx-auto">
          No DOB filings matched this address across any dataset.
          Try enabling <strong>Live Verify</strong> or check the address spelling.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden animate-fade-in shadow-sm">
      {/* Table toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 flex-wrap">
        {/* Search within results */}
        <div className="relative flex-1 min-w-48 max-w-xs">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">⌕</span>
          <input
            type="text"
            placeholder="Filter results…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input pl-7 py-1.5 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Source filter pills */}
          <div className="flex items-center gap-1">
            {SOURCE_FILTER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSourceFilter(opt.value)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors
                  ${sourceFilter === opt.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Export */}
          <button
            onClick={onExport}
            disabled={isExporting}
            className="btn-secondary text-xs py-1.5 px-3"
          >
            {isExporting ? '⏳' : '↓'} CSV
          </button>
        </div>
      </div>

      {/* Count */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
        Showing <strong className="text-gray-700">{sorted.length.toLocaleString()}</strong> of{' '}
        <strong className="text-gray-700">{filings.length.toLocaleString()}</strong> records
      </div>

      {/* Table wrapper */}
      <div className="overflow-x-auto">
        <table className="filing-table">
          <thead>
            <tr>
              <ThSortable field="source">Source</ThSortable>
              <ThSortable field="jobNumber">Job #</ThSortable>
              <th>Filing #</th>
              <ThSortable field="filingStatus">Status</ThSortable>
              <th>ACP Control #</th>
              <ThSortable field="jobType">Job Type</ThSortable>
              <ThSortable field="workType">Work Type</ThSortable>
              <ThSortable field="filingDate">Filed</ThSortable>
              <th>Description</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((filing, idx) => {
              const key = String(idx);
              const isExpanded = expandedId === key;
              return (
                <>
                  <tr
                    key={`row-${key}`}
                    onClick={() => toggleExpand(idx)}
                    className={isExpanded ? 'expanded' : ''}
                    title="Click to expand details"
                  >
                    <td>
                      <SourceBadge source={filing.source} dataset={filing.dataset} size="sm" />
                    </td>
                    <td>
                      <span className="font-mono text-xs text-indigo-700 font-semibold">
                        {filing.jobNumber ?? '—'}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono text-xs text-gray-600">
                        {filing.filingNumber ?? '—'}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={filing.filingStatus} size="sm" />
                    </td>
                    <td>
                      {filing.acpControlNumbers && filing.acpControlNumbers.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {filing.acpControlNumbers.map((num, i) => (
                            <span key={i} className="font-mono text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 inline-block">
                              {num}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="text-gray-700 text-xs">
                      {filing.jobType ?? '—'}
                    </td>
                    <td className="text-gray-700 text-xs">
                      {filing.workType ?? '—'}
                    </td>
                    <td className="text-gray-500 text-xs whitespace-nowrap">
                      {formatDateShort(filing.filingDate) || '—'}
                    </td>
                    <td className="text-gray-500 text-xs max-w-[260px]">
                      {truncate(filing.description ?? '', 70) || '—'}
                    </td>
                    <td className="text-center">
                      <span className={`text-gray-400 text-xs transition-transform inline-block duration-200
                        ${isExpanded ? 'rotate-90' : ''}`}>
                        ▶
                      </span>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr key={`detail-${key}`} className="bg-blue-50/30">
                      <td colSpan={10} className="p-0">
                        <DetailDrawer
                          filing={filing}
                          houseNumber={houseNumber}
                          streetName={streetName}
                          borough={borough}
                        />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 && (
        <div className="py-12 text-center text-sm text-gray-400">
          No results match your filter criteria.
        </div>
      )}
    </div>
  );
}
