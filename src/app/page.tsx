'use client';

import { useState, useCallback } from 'react';
import { SearchForm }       from '@/components/SearchForm';
import { SummaryCards }     from '@/components/SummaryCards';
import { ResultsTable }     from '@/components/ResultsTable';
import { SourceLogsPanel }  from '@/components/SourceLogsPanel';
import { SearchHistory }    from '@/components/SearchHistory';
import { LoadingOverlay }   from '@/components/LoadingSpinner';
import { ErrorState }       from '@/components/ErrorState';
import type {
  SearchRequest,
  SearchResponse,
  SearchHistoryItem,
} from '@/types';

export default function HomePage() {
  const [result,      setResult]      = useState<SearchResponse | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [isLoading,   setIsLoading]   = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lastRequest, setLastRequest] = useState<SearchRequest | null>(null);

  // -----------------------------------------------------------------------
  // Core search handler
  // -----------------------------------------------------------------------
  const handleSearch = useCallback(async (req: SearchRequest) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setLastRequest(req);

    try {
      const res = await fetch('/api/search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(req),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? `Server error ${res.status}`);
      }

      setResult(data as SearchResponse);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // -----------------------------------------------------------------------
  // Re-run last search (for retry)
  // -----------------------------------------------------------------------
  const handleRetry = useCallback(() => {
    if (lastRequest) handleSearch(lastRequest);
  }, [lastRequest, handleSearch]);

  // -----------------------------------------------------------------------
  // Fill form from history item and run search
  // -----------------------------------------------------------------------
  const handleHistorySelect = useCallback((item: SearchHistoryItem) => {
    handleSearch({
      houseNumber: item.houseNumber,
      streetName:  item.streetName,
      borough:     item.borough,
    });
  }, [handleSearch]);

  // -----------------------------------------------------------------------
  // CSV Export
  // -----------------------------------------------------------------------
  const handleExport = useCallback(async () => {
    if (!result || isExporting) return;
    setIsExporting(true);

    try {
      const res = await fetch('/api/export', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          filings:  result.filings,
          filename: `nyc-dob-${result.normalizedAddress.normalizedString.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`,
        }),
      });

      if (!res.ok) throw new Error('Export failed');

      const blob     = await res.blob();
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement('a');
      a.href         = url;
      a.download     = `nyc-dob-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setIsExporting(false);
    }
  }, [result, isExporting]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* ================================================================
          Top navigation bar
          ================================================================ */}
      <header className="bg-[var(--color-primary)] sticky top-0 z-50 shadow-lg">
        <div className="container-app">
          <div className="flex items-center justify-between h-14">
            {/* Wordmark */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm" style={{ fontFamily: 'var(--font-display)' }}>
                  🏛
                </span>
              </div>
              <div>
                <h1
                  className="text-white font-bold text-base leading-none"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  NYC DOB Filing Lookup
                </h1>
                <p className="text-blue-300 text-[10px] mt-0.5 uppercase tracking-widest">
                  Department of Buildings
                </p>
              </div>
            </div>

            {/* Status indicators */}
            <div className="hidden md:flex items-center gap-4 text-xs text-blue-200">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                DOB NOW Portal
              </div>
              <div className="text-blue-300 border-l border-blue-700 pl-4">
                Live Scraping Active
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ================================================================
          Main layout: sidebar + content
          ================================================================ */}
      <div className="container-app py-6">
        <div className="flex gap-6">

          {/* ---- Left sidebar (search history) ---- */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <div className="sticky top-20">
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">
                    Recent Searches
                  </h3>
                </div>
                <SearchHistory onSelect={handleHistorySelect} />
              </div>

              {/* Dataset legend */}
              <div className="mt-4 bg-white border border-gray-200 rounded-2xl p-3 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                  Datasets
                </h3>
                <ul className="space-y-1.5 text-xs text-gray-500">
                  {[
                    { id: 'w9ak-ipjd', name: 'Job Filings' },
                    { id: 'xxbr-ypig', name: 'Ltd. Alterations' },
                    { id: 'rbx6-tga4', name: 'Approved Permits' },
                    { id: 'kfp4-dz4h', name: 'Elevator Permits' },
                    { id: 'ic3t-wcy2', name: 'Legacy BIS Filings' },
                  ].map(d => (
                    <li key={d.id} className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                      <span>{d.name}</span>
                    </li>
                  ))}
                  <li className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                    <span>DOB NOW Portal</span>
                  </li>
                </ul>
              </div>
            </div>
          </aside>

          {/* ---- Main content ---- */}
          <main className="flex-1 min-w-0 space-y-5">

            {/* Search form */}
            <SearchForm onSearch={handleSearch} isLoading={isLoading} />

            {/* Loading state */}
            {isLoading && (
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
                <LoadingOverlay
                  message={lastRequest?.liveVerify
                    ? 'Searching Open Data + DOB NOW Portal…'
                    : 'Querying NYC Open Data…'}
                />
              </div>
            )}

            {/* Error state */}
            {!isLoading && error && (
              <ErrorState message={error} onRetry={handleRetry} />
            )}

            {/* Results */}
            {!isLoading && result && (
              <>
                {/* Summary cards */}
                <SummaryCards
                  summary={result.summary}
                  address={result.normalizedAddress.normalizedString}
                  durationMs={result.durationMs}
                />

                {/* Results table */}
                <ResultsTable
                  filings={result.filings}
                  onExport={handleExport}
                  isExporting={isExporting}
                  houseNumber={result.normalizedAddress.houseNumber}
                  streetName={result.normalizedAddress.streetName}
                  borough={result.normalizedAddress.borough}
                />

                {/* Source logs (collapsible) */}
                <SourceLogsPanel logs={result.logs} />

                {/* Footer note */}
                <p className="text-xs text-gray-400 text-center pb-4">
                  Data sourced from{' '}
                  <a
                    href="https://data.cityofnewyork.us"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:underline"
                  >
                    NYC Open Data
                  </a>
                  {' '}and the{' '}
                  <a
                    href="https://a810-dobnow.nyc.gov"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:underline"
                  >
                    DOB NOW Public Portal
                  </a>
                  . Search ID: <code className="text-gray-500">{result.searchId}</code>
                </p>
              </>
            )}

            {/* Initial empty state */}
            {!isLoading && !error && !result && (
              <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-16 text-center">
                <div className="text-6xl mb-5">🗽</div>
                <h3
                  className="text-xl font-semibold text-gray-700 mb-2"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Search NYC DOB Records
                </h3>
                <p className="text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
                  Enter a property address above to retrieve job filings, building permits,
                  limited alteration applications, and elevator permit records from the
                  NYC Department of Buildings.
                </p>
                <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-xl mx-auto text-xs">
                  {[
                    { icon: '📋', label: 'Job Filings' },
                    { icon: '🔧', label: 'Permits' },
                    { icon: '🏗️', label: 'Alterations' },
                    { icon: '🛗', label: 'Elevators' },
                  ].map(item => (
                    <div
                      key={item.label}
                      className="bg-indigo-50 rounded-xl p-3 text-indigo-600"
                    >
                      <div className="text-2xl mb-1">{item.icon}</div>
                      <div className="font-medium">{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
