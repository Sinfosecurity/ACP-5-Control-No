// ============================================================
// app/layout.tsx
// ============================================================
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    template: '%s | NYC DOB Filing Lookup',
    default: 'NYC DOB Filing Lookup',
  },
  description:
    'Search NYC Department of Buildings filing records, job applications, permits, and elevator filings by property address.',
  keywords: ['NYC', 'DOB', 'Department of Buildings', 'permits', 'filings', 'construction'],
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
