// ============================================================
// app/api/asbestos/route.ts
// GET  /api/asbestos?jobNumber=B00123456&bin=3335261&scrape=true
// POST /api/asbestos  { jobNumber, bin, houseNumber, streetName, borough, scrapePortal }
//
// Behaviour:
//  1. Check DB for cached compliance result (< 7 days old) → return immediately
//  2. Otherwise: run Playwright scrape to get ACP-5 control number from DOB NOW portal
//  3. Persist results to DB (write-through cache)
//  4. Return merged result
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { lookupAsbestosForJob } from '@/services/asbestos-service';
import { normalizeAddress } from '@/lib/address-normalizer';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limiter';
import {
  getCachedJobCompliance,
  persistJobCompliance,
} from '@/services/db-service';

// 7-day cache TTL for compliance scrapes (portals change slowly)
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isFresh(scrapedAt: string): boolean {
  return Date.now() - new Date(scrapedAt).getTime() < CACHE_TTL_MS;
}

// ---- shared handler logic ----
async function handleLookup(params: {
  jobNumber:    string;
  bin?:         string;
  houseNumber?: string;
  streetName?:  string;
  borough?:     string;
  scrapePortal?: boolean;
}): Promise<NextResponse> {
  const { jobNumber, bin, houseNumber, streetName, borough, scrapePortal } = params;

  // Normalise job number
  const jn = jobNumber.trim().toUpperCase();

  // Resolve address if provided
  let addr;
  if (houseNumber && streetName && borough) {
    try { addr = normalizeAddress({ houseNumber, streetName, borough }); }
    catch { /* no addr */ }
  }

  // Check DB cache for compliance record
  const cached = await getCachedJobCompliance(jn).catch(() => null);
  if (cached && isFresh(cached.scrapedAt)) {
    return NextResponse.json({
      jobNumber:    jn,
      jobCompliance: cached,
      durationMs:    0,
      cached:        true,
    });
  }

  // Full lookup
  const result = await lookupAsbestosForJob({
    jobNumber: jn,
    bin,
    addr,
    scrapePortal,
  });

  // Write-through: persist results to DB (non-blocking)
  Promise.allSettled([
    result.jobCompliance
      ? persistJobCompliance(result.jobCompliance)
      : Promise.resolve(),
  ]).catch(err => console.error('[asbestos] persist error:', err));

  return NextResponse.json({ ...result, cached: false });
}

// ---- GET ----
export async function GET(req: NextRequest): Promise<NextResponse> {
  const clientId  = getClientIdentifier(req);
  const rateLimit = checkRateLimit(`asbestos:${clientId}`);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const sp         = new URL(req.url).searchParams;
  const jobNumber  = sp.get('jobNumber')?.trim();
  const bin        = sp.get('bin')?.trim() || undefined;
  const scrape     = sp.get('scrape') === 'true';

  if (!jobNumber) {
    return NextResponse.json({ error: 'jobNumber is required' }, { status: 400 });
  }

  try {
    return await handleLookup({ jobNumber, bin, scrapePortal: scrape });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// ---- POST ----
const PostSchema = z.object({
  jobNumber:    z.string().min(1),
  bin:          z.string().optional(),
  houseNumber:  z.string().optional(),
  streetName:   z.string().optional(),
  borough:      z.string().optional(),
  scrapePortal: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const clientId  = getClientIdentifier(req);
  const rateLimit = checkRateLimit(`asbestos:${clientId}`);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  try {
    return await handleLookup(parsed.data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
