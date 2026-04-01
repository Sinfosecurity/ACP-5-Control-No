'use client';

import { useState, useEffect } from 'react';
import { formatDate } from '@/lib/utils';
import type { SearchHistoryItem } from '@/types';

interface SearchHistoryProps {
  onSelect: (item: SearchHistoryItem) => void;
}

export function SearchHistory({ onSelect }: SearchHistoryProps) {
  const [history,  setHistory]  = useState<SearchHistoryItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch('/api/history?limit=10')
      .then(r => r.json())
      .then(d => { setHistory(d.history ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton h-10 rounded-lg" />
        ))}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="p-4 text-xs text-gray-400 text-center">
        No searches yet
      </div>
    );
  }

  const visible = expanded ? history : history.slice(0, 5);

  return (
    <div>
      <ul className="divide-y divide-gray-100">
        {visible.map(item => (
          <li key={item.id}>
            <button
              onClick={() => onSelect(item)}
              className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 transition-colors group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate group-hover:text-indigo-700">
                    {item.houseNumber} {item.streetName}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.borough}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-bold text-indigo-600">
                    {item.totalResults}
                  </p>
                  <p className="text-[10px] text-gray-400">results</p>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                {formatDate(item.createdAt, 'MMM d, h:mm a')}
              </p>
            </button>
          </li>
        ))}
      </ul>

      {history.length > 5 && (
        <button
          onClick={() => setExpanded(p => !p)}
          className="w-full text-xs text-indigo-500 hover:text-indigo-700 py-2 border-t border-gray-100"
        >
          {expanded ? 'Show less ↑' : `Show all ${history.length} ↓`}
        </button>
      )}
    </div>
  );
}
