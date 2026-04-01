'use client';

import { useState } from 'react';
import type { SourceLog } from '@/types';

const DATASET_NAMES: Record<string, string> = {
  'w9ak-ipjd': 'Job Application Filings',
  'xxbr-ypig': 'Limited Alteration Applications',
  'rbx6-tga4': 'Approved Permits',
  'kfp4-dz4h': 'Elevator Permit Applications',
  'ic3t-wcy2': 'Legacy Job Filings (BIS)',
  'dob_now_portal': 'DOB NOW Public Portal',
};

interface SourceLogsProps {
  logs: SourceLog[];
}

export function SourceLogsPanel({ logs }: SourceLogsProps) {
  const [expanded, setExpanded] = useState(false);

  if (logs.length === 0) return null;

  const hasErrors = logs.some(l => l.status === 'error');

  return (
    <div className={`border rounded-xl overflow-hidden text-xs
      ${hasErrors ? 'border-amber-200' : 'border-gray-200'}`}>
      <button
        onClick={() => setExpanded(p => !p)}
        className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors
          ${hasErrors ? 'bg-amber-50 hover:bg-amber-100' : 'bg-gray-50 hover:bg-gray-100'}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs">📋</span>
          <span className="font-semibold text-gray-600">
            Source Logs ({logs.length} sources)
          </span>
          {hasErrors && (
            <span className="text-amber-600 font-medium">⚠ Some sources had errors</span>
          )}
        </div>
        <span className={`text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {expanded && (
        <div className="divide-y divide-gray-100 animate-fade-in">
          {logs.map((log, i) => (
            <div key={i} className="px-4 py-2.5 flex items-start gap-3 bg-white">
              {/* Status dot */}
              <span className={`w-2 h-2 rounded-full mt-1 flex-shrink-0
                ${log.status === 'success' ? 'bg-green-500' :
                  log.status === 'error'   ? 'bg-red-500'   :
                  log.status === 'skipped' ? 'bg-gray-300'  : 'bg-yellow-400'}`}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-700">
                    {log.source === 'open_data' ? 'Open Data' : 'DOB NOW Live'}
                  </span>
                  {log.dataset && (
                    <span className="text-gray-400">
                      · {DATASET_NAMES[log.dataset] ?? log.dataset}
                    </span>
                  )}
                  <span className={`font-medium
                    ${log.status === 'success' ? 'text-green-600' :
                      log.status === 'error'   ? 'text-red-600'   : 'text-gray-400'}`}>
                    {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                  </span>
                </div>

                <div className="flex items-center gap-3 mt-0.5 text-gray-400">
                  <span>{log.recordsFound} record{log.recordsFound !== 1 ? 's' : ''}</span>
                  <span>{log.durationMs}ms</span>
                  {log.requestUrl && (
                    <a
                      href={log.requestUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-600 truncate max-w-[200px]"
                      onClick={e => e.stopPropagation()}
                    >
                      View request ↗
                    </a>
                  )}
                </div>

                {log.errorMessage && (
                  <p className="mt-1 text-red-500 bg-red-50 rounded px-2 py-1 text-xs">
                    {log.errorMessage}
                  </p>
                )}

                {log.screenshotPath && (
                  <p className="mt-1 text-gray-400">
                    📷 Screenshot: <code className="text-gray-600">{log.screenshotPath}</code>
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
