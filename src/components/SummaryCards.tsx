'use client';

import type { SearchSummary } from '@/types';

interface SummaryCardsProps {
  summary: SearchSummary;
  address: string;
  durationMs: number;
}

export function SummaryCards({ summary, address, durationMs }: SummaryCardsProps) {
  const cards = [
    {
      label:    'Total Filings',
      value:    summary.total,
      icon:     '≡',
      color:    'text-indigo-600',
      bgColor:  'bg-indigo-50',
      border:   'border-indigo-100',
    },
    {
      label:    'DOB Portal',
      value:    summary.livePortal,
      icon:     '◉',
      color:    'text-green-600',
      bgColor:  'bg-green-50',
      border:   'border-green-100',
      sub:      summary.livePortal > 0 ? 'Live scraped' : 'No data',
    },
    {
      label:    'Search Time',
      value:    Math.round(durationMs / 1000),
      icon:     '⏱',
      color:    'text-blue-600',
      bgColor:  'bg-blue-50',
      border:   'border-blue-100',
      sub:      durationMs > 10000 ? 'Complex search' : 'Fast search',
    },
  ];

  return (
    <div className="animate-fade-in space-y-4">
      {/* Address header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Results for</p>
          <h2
            className="text-xl font-bold text-gray-900 mt-0.5"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {address}
          </h2>
        </div>
        <div className="text-xs text-gray-400 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Completed in {(durationMs / 1000).toFixed(1)}s
        </div>
      </div>

      {/* Stat cards grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map(card => (
          <div
            key={card.label}
            className={`stat-card flex items-start gap-3 ${card.border}`}
          >
            <div className={`w-9 h-9 rounded-lg ${card.bgColor} flex items-center justify-center flex-shrink-0`}>
              <span className={`text-lg ${card.color}`}>{card.icon}</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 leading-none">
                {card.value.toLocaleString()}
              </p>
              <p className="text-xs font-medium text-gray-500 mt-1">{card.label}</p>
              {card.sub && (
                <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
