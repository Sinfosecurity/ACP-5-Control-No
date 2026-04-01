'use client';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

export function Spinner({ size = 'md', color = 'var(--color-primary)' }: SpinnerProps) {
  const dim = { sm: 16, md: 24, lg: 40 }[size];
  const stroke = { sm: 2, md: 2.5, lg: 3 }[size];

  return (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: 'spin 0.75s linear infinite', color }}
      aria-label="Loading"
    >
      <circle
        cx="12" cy="12" r="10"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeOpacity={0.2}
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LoadingOverlay({ message = 'Searching…' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fade-in">
      <div className="relative">
        <div
          className="w-14 h-14 rounded-full border-2 border-blue-100"
          style={{ animation: 'pulse-ring 2s ease infinite' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner size="md" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-700">{message}</p>
        <p className="text-xs text-gray-400 mt-0.5">Scraping DOB NOW Portal…</p>
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <tr>
      {[80, 100, 120, 90, 80, 60, 70].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <div className="skeleton h-4 rounded" style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}
