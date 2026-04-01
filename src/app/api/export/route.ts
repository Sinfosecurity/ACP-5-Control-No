// ============================================================
// app/api/export/route.ts
// POST /api/export — Export filings as CSV
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { filingsToCsv } from '@/lib/utils';
import type { FilingRecord } from '@/types';

const ExportSchema = z.object({
  filings:  z.array(z.unknown()),
  filename: z.string().optional().default('nyc-dob-filings'),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = ExportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 422 });
  }

  const { filings, filename } = parsed.data;
  const csv = filingsToCsv(filings as FilingRecord[]);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.csv"`,
      'Cache-Control':       'no-cache',
    },
  });
}
