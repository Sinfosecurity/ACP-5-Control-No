// ============================================================
// components/Badges.tsx
// StatusBadge and SourceBadge components
// ============================================================
'use client';

import { getStatusColor } from '@/lib/utils';
import type { FilingSource } from '@/types';

// -----------------------------------------------------------------------
// Status Badge
// -----------------------------------------------------------------------
interface StatusBadgeProps {
  status: string | undefined;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  if (!status) return <span className="text-gray-400 text-xs">—</span>;

  const color = getStatusColor(status);

  const colorMap = {
    green:  'bg-green-50 text-green-700 border-green-200 ring-green-600/20',
    yellow: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-600/20',
    red:    'bg-red-50  text-red-700   border-red-200   ring-red-600/20',
    blue:   'bg-blue-50 text-blue-700  border-blue-200  ring-blue-600/20',
    gray:   'bg-gray-50 text-gray-600  border-gray-200  ring-gray-500/20',
  };

  const dotMap = {
    green:  'bg-green-500',
    yellow: 'bg-amber-500',
    red:    'bg-red-500',
    blue:   'bg-blue-500',
    gray:   'bg-gray-400',
  };

  const sizeClass = size === 'sm'
    ? 'text-xs px-1.5 py-0.5'
    : 'text-xs px-2 py-0.5';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ring-1 ring-inset
        ${colorMap[color]} ${sizeClass}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotMap[color]}`} />
      {status}
    </span>
  );
}

// -----------------------------------------------------------------------
// Source Badge
// -----------------------------------------------------------------------
interface SourceBadgeProps {
  source: FilingSource | string;
  dataset?: string;
  size?: 'sm' | 'md';
}

const SOURCE_CONFIG: Record<string, { label: string; icon: string; className: string }> = {
  open_data: {
    label: 'DOB Portal',
    icon: '◉',
    className: 'bg-green-50 text-green-700 border-green-200 ring-green-600/10',
  },
  dob_now_live: {
    label: 'DOB Portal',
    icon: '◉',
    className: 'bg-green-50 text-green-700 border-green-200 ring-green-600/10',
  },
  merged: {
    label: 'DOB Portal',
    icon: '◉',
    className: 'bg-green-50 text-green-700 border-green-200 ring-green-600/10',
  },
};

const DATASET_LABELS: Record<string, string> = {
  'w9ak-ipjd': 'Job Filings',
  'xxbr-ypig': 'Ltd. Alt.',
  'rbx6-tga4': 'Permits',
  'kfp4-dz4h': 'Elevator',
  'ic3t-wcy2': 'Legacy BIS',
};

export function SourceBadge({ source, dataset, size = 'md' }: SourceBadgeProps) {
  const config = SOURCE_CONFIG[source] ?? {
    label: source,
    icon: '○',
    className: 'bg-gray-50 text-gray-600 border-gray-200 ring-gray-500/10',
  };

  const label = dataset && DATASET_LABELS[dataset]
    ? `${config.label} · ${DATASET_LABELS[dataset]}`
    : config.label;

  const sizeClass = size === 'sm'
    ? 'text-xs px-1.5 py-0.5'
    : 'text-xs px-2 py-0.5';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ring-1 ring-inset
        ${config.className} ${sizeClass}`}
    >
      <span className="opacity-70 text-[10px]">{config.icon}</span>
      {label}
    </span>
  );
}
