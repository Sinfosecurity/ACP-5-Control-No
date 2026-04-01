'use client';

import { useState } from 'react';
import { formatDate } from '@/lib/utils';
import type { AsbestosACP7Record, AsbestosJobCompliance, AsbestosLookupResult } from '@/types';

// -----------------------------------------------------------------------
// Compliance status indicator
// -----------------------------------------------------------------------
function ComplianceBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; dot: string }> = {
    REQUIRES_ABATEMENT:   { label: 'Abatement Required',   cls: 'bg-red-50 text-red-700 border-red-200',    dot: 'bg-red-500' },
    NOT_ASBESTOS_PROJECT: { label: 'Not an Asbestos Project', cls: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500' },
    EXEMPT:               { label: 'Exempt',                cls: 'bg-blue-50 text-blue-700 border-blue-200',  dot: 'bg-blue-500' },
    UNKNOWN:              { label: 'Unknown',               cls: 'bg-gray-50 text-gray-600 border-gray-200',  dot: 'bg-gray-400' },
  };
  const cfg = map[status] ?? map.UNKNOWN;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${cfg.cls}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// -----------------------------------------------------------------------
// Status badge for ACP7 project status
// -----------------------------------------------------------------------
function ACP7StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const cls =
    s === 'CLOSED'     ? 'bg-green-50 text-green-700 border-green-200' :
    s === 'SUBMITTED'  ? 'bg-yellow-50 text-amber-700 border-amber-200' :
    s === 'POSTPONED'  ? 'bg-orange-50 text-orange-700 border-orange-200' :
                         'bg-gray-50 text-gray-600 border-gray-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

// -----------------------------------------------------------------------
// Individual ACP7 record card
// -----------------------------------------------------------------------
function ACP7Card({ record, index }: { record: AsbestosACP7Record; index: number }) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="border border-amber-200 rounded-xl overflow-hidden bg-amber-50/30">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 border-b border-amber-200">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-bold text-amber-800">
            {record.controlNumber || `Record #${index + 1}`}
          </span>
          {record.status && <ACP7StatusBadge status={record.status} />}
          {record.facilityType && (
            <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
              {record.facilityType}
            </span>
          )}
        </div>
        <span className="text-xs text-amber-500">
          {formatDate(record.startDate)} – {formatDate(record.endDate)}
        </span>
      </div>

      {/* Card body */}
      <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3 text-xs">

        {/* Location */}
        {record.floor && (
          <Field label="Floor" value={record.floor} />
        )}
        {record.section && (
          <div className="col-span-2">
            <Field label="Work Area / Section" value={record.section} />
          </div>
        )}
        {record.entireFloor && (
          <Field label="Entire Floor?" value={record.entireFloor} />
        )}

        {/* ACM details */}
        {record.acmType && (
          <div className="col-span-2">
            <Field label="ACM Type" value={record.acmType} />
          </div>
        )}
        {(record.acmAmount || record.acmUnit) && (
          <Field label="Quantity" value={`${record.acmAmount ?? ''} ${record.acmUnit ?? ''}`.trim()} />
        )}
        {record.abatementType && (
          <Field label="Abatement Type" value={record.abatementType} />
        )}
        {record.procedureName && (
          <Field label="Procedure" value={record.procedureName} />
        )}
        {record.streetActivity && (
          <Field label="Street Activity" value={record.streetActivity} />
        )}

        {/* People */}
        {record.buildingOwnerName && (
          <div className="col-span-2">
            <Field label="Building Owner" value={record.buildingOwnerName} />
          </div>
        )}
        {record.contractorName && (
          <div className="col-span-2">
            <Field label="Abatement Contractor" value={record.contractorName} />
          </div>
        )}
        {record.airMonitorName && (
          <div className="col-span-2">
            <Field label="Air Monitor Firm" value={record.airMonitorName} />
          </div>
        )}

        {/* Location cross-ref */}
        {record.bin && <Field label="BIN" value={record.bin} />}
        {record.bbl && <Field label="BBL" value={record.bbl} />}
        {record.communityBoard && <Field label="Community Board" value={record.communityBoard} />}
        {record.nta && <Field label="Neighborhood (NTA)" value={record.nta} />}
      </div>

      {/* Raw data toggle */}
      <div className="px-4 pb-3">
        <button
          onClick={() => setShowRaw(p => !p)}
          className="text-[10px] text-amber-500 hover:text-amber-700 uppercase tracking-wider"
        >
          {showRaw ? '▲ Hide raw data' : '▼ Show raw data'}
        </button>
        {showRaw && record.raw && (
          <pre className="mt-2 text-xs bg-gray-900 text-green-300 rounded-lg p-3 overflow-x-auto max-h-48 font-mono">
            {JSON.stringify(record.raw, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{label}</dt>
      <dd className="text-xs text-gray-800 font-medium leading-snug">{value}</dd>
    </div>
  );
}

// -----------------------------------------------------------------------
// DOB NOW job compliance card (from Playwright scrape)
// -----------------------------------------------------------------------
function JobComplianceCard({ compliance }: { compliance: AsbestosJobCompliance }) {
  return (
    <div className="border border-indigo-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-50 border-b border-indigo-200">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">
            DOB NOW — Asbestos Abatement Compliance
          </span>
          <span className="text-[10px] text-indigo-400">
            Job {compliance.jobNumber}
          </span>
        </div>
        <span className="text-[10px] text-indigo-400">
          Scraped {formatDate(compliance.scrapedAt)}
        </span>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <ComplianceBadge status={compliance.complianceStatus} />
          {compliance.depControlNumber && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                DEP Control #
              </span>
              <code className="text-xs font-mono bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded font-bold">
                {compliance.depControlNumber}
              </code>
            </div>
          )}
          {compliance.investigatorCertNumber && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Investigator Cert #
              </span>
              <code className="text-xs font-mono bg-gray-50 border border-gray-200 text-gray-700 px-2 py-0.5 rounded">
                {compliance.investigatorCertNumber}
              </code>
            </div>
          )}
        </div>

        {compliance.complianceStatement && (
          <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-2.5 leading-relaxed">
            &ldquo;{compliance.complianceStatement}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Main AsbestosPanel — trigger button + full results display
// -----------------------------------------------------------------------
interface AsbestosPanelProps {
  jobNumber:  string;
  bin?:       string;
  address?:   { houseNumber: string; streetName: string; borough: string };
}

export function AsbestosPanel({ jobNumber, bin, address }: AsbestosPanelProps) {
  const [result,   setResult]   = useState<AsbestosLookupResult | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [useScrape, setUseScrape] = useState(false);

  async function fetchAsbestos() {
    setLoading(true);
    setError(null);
    try {
      const body = {
        jobNumber,
        bin,
        ...(address ?? {}),
        scrapePortal: useScrape,
      };
      const res = await fetch('/api/asbestos', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as AsbestosLookupResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Asbestos lookup failed');
    } finally {
      setLoading(false);
    }
  }

  // ---- Initial state: show trigger button ----
  if (!result && !loading) {
    return (
      <div className="mt-4 pt-4 border-t border-blue-100">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              🧪 Asbestos Abatement Compliance
            </h4>
            <p className="text-xs text-gray-400 mt-0.5">
              Fetches ACP7 project records from DEP Open Data
              {bin ? ` (BIN ${bin})` : ''}.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Live scrape toggle */}
            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-500">
              <div
                onClick={() => setUseScrape(p => !p)}
                className={`w-8 h-4 rounded-full transition-colors cursor-pointer relative ${
                  useScrape ? 'bg-indigo-600' : 'bg-gray-300'
                }`}
              >
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                  useScrape ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </div>
              Portal scrape
            </label>
            <button
              onClick={fetchAsbestos}
              className="btn-secondary text-xs py-1 px-3"
            >
              🔍 Load Asbestos Data
            </button>
          </div>
        </div>
        {error && (
          <p className="mt-2 text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>
        )}
      </div>
    );
  }

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="mt-4 pt-4 border-t border-blue-100">
        <div className="flex items-center gap-2 text-xs text-gray-500 animate-pulse">
          <span className="w-3 h-3 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
          Fetching asbestos abatement records…
        </div>
      </div>
    );
  }

  // ---- Results ----
  if (!result) return null;

  return (
    <div className="mt-4 pt-4 border-t border-blue-100 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          🧪 Asbestos Abatement Compliance
        </h4>
        <div className="flex items-center gap-2 text-[10px] text-gray-400">
          <span>{result.acp7Records.length} ACP7 record{result.acp7Records.length !== 1 ? 's' : ''}</span>
          <span>•</span>
          <span>{result.durationMs}ms</span>
          <button
            onClick={() => { setResult(null); setError(null); }}
            className="text-indigo-400 hover:text-indigo-600 ml-1"
          >
            ↺ Refresh
          </button>
        </div>
      </div>

      {result.error && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          ⚠ {result.error}
        </p>
      )}

      {/* DOB NOW compliance from Playwright scrape */}
      {result.jobCompliance && (
        <JobComplianceCard compliance={result.jobCompliance} />
      )}

      {/* ACP7 records from Open Data */}
      {result.acp7Records.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            DEP ACP7 Project Notifications ({result.acp7Records.length})
          </p>
          {result.acp7Records.map((rec, i) => (
            <ACP7Card key={rec.controlNumber || i} record={rec} index={i} />
          ))}
        </div>
      ) : (
        <div className="text-xs text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-lg p-3 text-center">
          No ACP7 asbestos project notifications found for this property.
        </div>
      )}
    </div>
  );
}
