// ============================================================
// app/api/history/route.ts
// GET /api/history — Return recent search history
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getSearchHistory } from '@/services/db-service';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);

  try {
    const history = await getSearchHistory(limit);
    return NextResponse.json({ history });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to load history';
    console.error('[history]', error);
    return NextResponse.json({ history: [], error }, { status: 500 });
  }
}
