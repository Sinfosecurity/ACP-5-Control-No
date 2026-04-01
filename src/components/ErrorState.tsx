'use client';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center animate-fade-in">
      <div className="text-4xl mb-3">⚠️</div>
      <h3 className="text-base font-semibold text-red-800 mb-1"
          style={{ fontFamily: 'var(--font-display)' }}>
        Search Failed
      </h3>
      <p className="text-sm text-red-600 max-w-md mx-auto mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn-secondary text-sm border-red-200 text-red-700 hover:bg-red-100"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
