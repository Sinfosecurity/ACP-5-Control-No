'use client';

import { formatDate } from '@/lib/utils';
import { StatusBadge, SourceBadge } from './Badges';
import { AsbestosPanel } from './AsbestosPanel';
import type { FilingRecord } from '@/types';

interface DetailDrawerProps {
  filing:       FilingRecord;
  houseNumber?: string;
  streetName?:  string;
  borough?:     string;
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-800 font-medium">{value}</dd>
    </div>
  );
}

export function DetailDrawer({ filing, houseNumber, streetName, borough }: DetailDrawerProps) {
  const hasPermitDates =
    filing.filingDate || filing.permitIssuedDate ||
    filing.permitExpirationDate || filing.signoffDate;

  return (
    <div className="detail-drawer">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <SourceBadge source={filing.source} dataset={filing.dataset} />
          <StatusBadge status={filing.filingStatus} />
          {filing.datasetName && (
            <span className="text-xs text-gray-400">{filing.datasetName}</span>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
        {/* Core identifiers */}
        <DetailRow label="Job Number"    value={filing.jobNumber} />
        <DetailRow label="Filing Number" value={filing.filingNumber} />
        <DetailRow label="Permit Number" value={filing.permitNumber} />
        <DetailRow label="Job Type"      value={filing.jobType} />
        <DetailRow label="Work Type"     value={filing.workType} />
        <DetailRow label="Address"       value={filing.address} />

        {/* Dates */}
        {hasPermitDates && (
          <>
            <DetailRow label="Filed"           value={formatDate(filing.filingDate)} />
            <DetailRow label="Permit Issued"   value={formatDate(filing.permitIssuedDate)} />
            <DetailRow label="Permit Expires"  value={formatDate(filing.permitExpirationDate)} />
            <DetailRow label="Sign Off"        value={formatDate(filing.signoffDate)} />
          </>
        )}

        {/* Building details */}
        <DetailRow label="Building Type"   value={filing.buildingType} />
        <DetailRow label="Community Board" value={filing.communityBoard} />
        <DetailRow label="BIN"             value={filing.bin} />
        <DetailRow label="BBL"             value={filing.bbl} />
        <DetailRow label="Zoning"          value={filing.zoningDistrict} />

        {/* People */}
        {(filing.applicantFirstName || filing.applicantLastName) && (
          <DetailRow
            label="Applicant"
            value={[filing.applicantFirstName, filing.applicantLastName].filter(Boolean).join(' ')}
          />
        )}
        <DetailRow label="Owner / Business"      value={filing.ownerBusinessName} />
        <DetailRow label="Contractor / Business" value={filing.contractorBusinessName} />

        {/* Dimensions */}
        {filing.existingStories && (
          <DetailRow
            label="Stories"
            value={`${filing.existingStories} → ${filing.proposedStories ?? '—'}`}
          />
        )}
        {filing.existingHeight && (
          <DetailRow
            label="Height (ft)"
            value={`${filing.existingHeight} → ${filing.proposedHeight ?? '—'}`}
          />
        )}
        {filing.existingOccupancy && (
          <DetailRow
            label="Occupancy"
            value={`${filing.existingOccupancy} → ${filing.proposedOccupancy ?? '—'}`}
          />
        )}
      </dl>

      {/* Description */}
      {filing.description && (
        <div className="mt-4 pt-4 border-t border-blue-100">
          <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
            Description
          </dt>
          <dd className="text-sm text-gray-700 leading-relaxed">
            {filing.description}
          </dd>
        </div>
      )}

      {/* Raw data toggle */}
      {filing.raw && (
        <details className="mt-4 pt-3 border-t border-blue-100">
          <summary className="text-xs font-semibold uppercase tracking-wider text-gray-400 cursor-pointer hover:text-gray-600 select-none">
            Raw Source Data ↓
          </summary>
          <pre className="mt-2 text-xs bg-gray-900 text-green-300 rounded-lg p-3 overflow-x-auto max-h-64 font-mono">
            {JSON.stringify(filing.raw, null, 2)}
          </pre>
        </details>
      )}

      {/* Asbestos / Environmental Compliance */}
      {(filing.acpControlNumbers || filing.asbestosStatus || filing.caiNumber) && (
        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <h3 className="text-sm font-semibold text-amber-900 mb-3">
            Asbestos Abatement Compliance
          </h3>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
            {filing.acpControlNumbers && filing.acpControlNumbers.length > 0 && (
              <div className="flex flex-col gap-0.5 col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                  ACP Control Numbers
                </dt>
                <dd className="flex flex-wrap gap-2">
                  {filing.acpControlNumbers.map((num, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-amber-100 text-amber-800 border border-amber-300"
                    >
                      {num}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            <DetailRow label="Asbestos Status" value={filing.asbestosStatus} />
            <DetailRow label="CAI Number" value={filing.caiNumber} />
          </dl>
        </div>
      )}

      {/* Asbestos Abatement Compliance — lazy-loaded on demand */}
      <AsbestosPanel
        jobNumber={filing.jobNumber ?? ''}
        bin={filing.bin}
        address={houseNumber && streetName && borough
          ? { houseNumber, streetName, borough }
          : undefined}
      />
    </div>
  );
}
