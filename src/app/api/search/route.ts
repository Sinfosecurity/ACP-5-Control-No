// ============================================================
// app/api/search/route.ts
// POST /api/search — Main search endpoint
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeAddress } from '@/lib/address-normalizer';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limiter';
import { scrapeDobnowPortal } from '@/services/playwright-scraper';
import { buildSummary, sortFilings } from '@/services/merge';
import {
  upsertProperty,
  createSearch,
  completeSearch,
  persistFilings,
  persistSourceLogs,
} from '@/services/db-service';
import type { SearchResponse, FilingRecord } from '@/types';

// -----------------------------------------------------------------------
// Request validation schema
// -----------------------------------------------------------------------
const SearchSchema = z.object({
  houseNumber: z.string().min(1, 'House number is required').max(20),
  streetName:  z.string().min(1, 'Street name is required').max(200),
  borough:     z.string().min(1, 'Borough is required'),
  liveVerify:  z.boolean().optional().default(false),
  searchByBin: z.string().optional(), // future BIN search mode
});

// -----------------------------------------------------------------------
// Route handler
// -----------------------------------------------------------------------
export async function POST(req: NextRequest): Promise<NextResponse> {
  const globalStart = Date.now();

  // ---- Rate limiting ----
  const clientId = getClientIdentifier(req);
  const rateLimit = checkRateLimit(clientId);

  const headers: Record<string, string> = {
    'X-RateLimit-Limit':     String(parseInt(process.env.RATE_LIMIT_MAX ?? '20', 10)),
    'X-RateLimit-Remaining': String(rateLimit.remaining),
    'X-RateLimit-Reset':     String(rateLimit.resetAt),
  };

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before searching again.' },
      { status: 429, headers }
    );
  }

  // ---- Parse & validate body ----
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
  }

  const parsed = SearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422, headers }
    );
  }

  const { houseNumber, streetName, borough } = parsed.data;

  // ---- Normalize address ----
  let normalizedAddress;
  try {
    normalizedAddress = normalizeAddress({ houseNumber, streetName, borough });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Address normalization failed';
    return NextResponse.json({ error: msg }, { status: 422, headers });
  }

  console.log(`[search] Normalized: "${normalizedAddress.normalizedString}" - DOB scraping only`);

  // ---- DB: create property + search records ----
  const propertyId = await upsertProperty(normalizedAddress);
  const searchId   = await createSearch({
    addr: normalizedAddress,
    propertyId,
    liveVerify: true, // Always scraping DOB portal now
    ipAddress: clientId.replace('ip:', ''),
    userAgent: req.headers.get('user-agent') ?? undefined,
  });

  const allLogs = [];

  try {
    // ----------------------------------------------------------------
    // Step 1: Scrape DOB NOW Portal for filing records with basic ACP data
    // ----------------------------------------------------------------
    console.log('[search] Scraping DOB NOW portal for filing records...');
    const { records, log } = await scrapeDobnowPortal(normalizedAddress);
    allLogs.push(log);
    console.log(`[search] DOB Portal: ${records.length} filing records found`);

    // Note: The playwright-scraper already extracts ACP-5 numbers from the detail view
    // for the first 10 filings, so we don't need the expensive deep scraper here.
    // The deep ACP-5 scraper is available at /api/dob/extract-acp5 if needed.

    // ----------------------------------------------------------------
    // Step 2: Sort and build summary
    // ----------------------------------------------------------------
    const sorted  = sortFilings(records);
    const summary = buildSummary(sorted);

    const durationMs = Date.now() - globalStart;

    // ----------------------------------------------------------------
    // Step 3: Persist to database (non-blocking — errors don't fail search)  
    // ----------------------------------------------------------------
    if (searchId) {
      await Promise.allSettled([
        completeSearch({ searchId, summary, durationMs }),
        propertyId ? persistFilings(propertyId, searchId, sorted) : Promise.resolve(),
        persistSourceLogs(searchId, allLogs),
      ]);
    }

    // ----------------------------------------------------------------
    // Step 4: Return response
    // ----------------------------------------------------------------
    const response: SearchResponse = {
      searchId:          searchId ?? 'no-db',
      normalizedAddress,
      filings:           sorted,
      summary,
      logs:              allLogs,
      durationMs,
      asbestosData:      {
        acp7Records: [], // No longer using ACP7 Open Data
        jobCompliance: {}, // ACP-5 data included in filing records
      },
    };

    return NextResponse.json(response, { status: 200, headers });

  } catch (err) {
    const error = err instanceof Error ? err.message : 'Internal server error';
    console.error('[search] Unhandled error:', err);

    if (searchId) {
      await completeSearch({
        searchId,
        summary: { total: 0, openData: 0, livePortal: 0, merged: 0, datasets: [] },
        durationMs: Date.now() - globalStart,
        error,
      }).catch(() => null);
    }

    return NextResponse.json({ error }, { status: 500, headers });
  }
}

// Allow GET for health check
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, service: 'nyc-dob-lookup-search' });
}
