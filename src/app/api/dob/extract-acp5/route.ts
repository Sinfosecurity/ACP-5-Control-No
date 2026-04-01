// ============================================================
// app/api/dob/extract-acp5/route.ts
// POST /api/dob/extract-acp5
// Comprehensive endpoint for extracting ACP-5 Control Numbers
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { scrapeACP5ControlNumbers } from '@/services/dob-acp5-scraper';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limiter';
import { normalizeAddress } from '@/lib/address-normalizer';

// -----------------------------------------------------------------------
// Validation Schema
// -----------------------------------------------------------------------
const ExtractACP5Schema = z.object({
  houseNumber: z.string().min(1, 'House number is required').max(20),
  streetName: z.string().min(1, 'Street name is required').max(200),
  borough: z.string().min(1, 'Borough is required'),
  block: z.string().optional(),
  lot: z.string().optional(),
  bin: z.string().optional(),
  // Options
  maxFilingsToProcess: z.number().int().min(1).max(50).optional().default(10),
  preferLAAWorkType: z.boolean().optional().default(true),
  mockMode: z.boolean().optional().default(false),
});

type ExtractACP5Request = z.infer<typeof ExtractACP5Schema>;

// -----------------------------------------------------------------------
// Database persistence helper
// -----------------------------------------------------------------------
async function persistACP5Extraction(extraction: any, searchParams: any) {
  try {
    const { query } = await import('@/lib/db');
    
    // Normalize address
    const normalizedAddr = normalizeAddress({
      houseNumber: searchParams.houseNumber,
      streetName: searchParams.streetName,
      borough: searchParams.borough,
    });

    await query(`
      INSERT INTO dob_acp5_extractions (
        house_number,
        street_name,
        borough,
        normalized_address,
        job_number,
        filing_number,
        acp5_control_number,
        cai_number,
        asbestos_compliance_text,
        compliance_status,
        bin,
        block,
        lot,
        bbl,
        proposed_work_summary,
        source_url,
        screenshot_path,
        raw_json,
        retrieval_status,
        retrieval_error,
        extracted_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      )
      ON CONFLICT (job_number, filing_number)
      DO UPDATE SET
        acp5_control_number = EXCLUDED.acp5_control_number,
        cai_number = EXCLUDED.cai_number,
        asbestos_compliance_text = EXCLUDED.asbestos_compliance_text,
        compliance_status = EXCLUDED.compliance_status,
        bin = EXCLUDED.bin,
        block = EXCLUDED.block,
        lot = EXCLUDED.lot,
        source_url = EXCLUDED.source_url,
        screenshot_path = EXCLUDED.screenshot_path,
        raw_json = EXCLUDED.raw_json,
        retrieval_status = EXCLUDED.retrieval_status,
        retrieval_error = EXCLUDED.retrieval_error,
        extracted_at = EXCLUDED.extracted_at,
        updated_at = NOW()
    `, [
      searchParams.houseNumber,
      searchParams.streetName,
      searchParams.borough,
      normalizedAddr.normalizedString,
      extraction.jobNumber,
      extraction.filingNumber || null,
      extraction.acp5ControlNumber || null,
      extraction.caiNumber || null,
      extraction.asbestosComplianceText || null,
      extraction.complianceStatus || 'UNKNOWN',
      extraction.bin || null,
      extraction.block || null,
      extraction.lot || null,
      extraction.bbl || null,
      extraction.proposedWorkSummary || null,
      extraction.sourceUrl || null,
      extraction.screenshotPath || null,
      JSON.stringify(extraction),
      extraction.error ? 'error' : extraction.acp5ControlNumber ? 'success' : 'partial',
      extraction.error || null,
      extraction.error ? null : new Date().toISOString(),
    ]);

    console.log(`[acp5-api] Persisted extraction for job ${extraction.jobNumber}`);
  } catch (err) {
    console.error('[acp5-api] Failed to persist extraction:', err);
    // Don't fail the request if persistence fails
  }
}

// -----------------------------------------------------------------------
// Route Handler
// -----------------------------------------------------------------------
export async function POST(req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Rate limiting
  const clientId = getClientIdentifier(req);
  const rateLimit = checkRateLimit(`acp5:${clientId}`);

  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(parseInt(process.env.RATE_LIMIT_MAX ?? '20', 10)),
    'X-RateLimit-Remaining': String(rateLimit.remaining),
    'X-RateLimit-Reset': String(rateLimit.resetAt),
  };

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before making another request.' },
      { status: 429, headers }
    );
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers }
    );
  }

  const parsed = ExtractACP5Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        details: parsed.error.flatten(),
      },
      { status: 422, headers }
    );
  }

  const params = parsed.data;

  console.log(`[acp5-api] Starting ACP-5 extraction for ${params.houseNumber} ${params.streetName}, ${params.borough}`);

  try {
    // Execute scraper
    const result = await scrapeACP5ControlNumbers(
      {
        houseNumber: params.houseNumber,
        streetName: params.streetName,
        borough: params.borough,
        block: params.block,
        lot: params.lot,
        bin: params.bin,
      },
      {
        maxFilingsToProcess: params.maxFilingsToProcess,
        preferLAAWorkType: params.preferLAAWorkType,
        mockMode: params.mockMode,
      }
    );

    // Persist extractions to database (async, non-blocking)
    if (result.success && result.extractions.length > 0) {
      Promise.allSettled(
        result.extractions.map((extraction) =>
          persistACP5Extraction(extraction, params)
        )
      ).catch((err) => console.error('[acp5-api] Persistence error:', err));
    }

    const duration = Date.now() - startTime;

    return NextResponse.json(
      {
        success: result.success,
        searchParams: result.searchParams,
        jobFilings: result.jobFilings,
        extractions: result.extractions,
        summary: {
          totalFilingsFound: result.jobFilings.length,
          extractionsAttempted: result.extractions.length,
          extractionsSuccessful: result.extractions.filter(
            (e) => e.acp5ControlNumber || e.caiNumber
          ).length,
          extractionsWithACP5: result.extractions.filter((e) => e.acp5ControlNumber).length,
          extractionsWithCAI: result.extractions.filter((e) => e.caiNumber).length,
        },
        logs: result.logs,
        durationMs: duration,
      },
      { status: 200, headers }
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Internal server error';
    console.error('[acp5-api] Extraction failed:', err);

    return NextResponse.json(
      {
        success: false,
        error,
        searchParams: params,
        jobFilings: [],
        extractions: [],
        logs: [
          {
            step: 'api_error',
            timestamp: Date.now(),
            status: 'error',
            message: error,
          },
        ],
        durationMs: Date.now() - startTime,
      },
      { status: 500, headers }
    );
  }
}

// -----------------------------------------------------------------------
// GET Handler - Retrieve stored extractions
// -----------------------------------------------------------------------
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const jobNumber = searchParams.get('jobNumber');
  const address = searchParams.get('address');

  if (!jobNumber && !address) {
    return NextResponse.json(
      { error: 'Either jobNumber or address parameter is required' },
      { status: 400 }
    );
  }

  try {
    const { query } = await import('@/lib/db');

    let sql: string;
    let params: any[];

    if (jobNumber) {
      sql = `
        SELECT * FROM dob_acp5_extractions
        WHERE job_number = $1
        ORDER BY created_at DESC
        LIMIT 10
      `;
      params = [jobNumber];
    } else {
      sql = `
        SELECT * FROM dob_acp5_extractions
        WHERE normalized_address ILIKE $1
        ORDER BY created_at DESC
        LIMIT 50
      `;
      params = [`%${address}%`];
    }

    const result = await query(sql, params);

    return NextResponse.json({
      success: true,
      extractions: result,
      count: result.length,
    });
  } catch (err) {
    console.error('[acp5-api] Failed to retrieve extractions:', err);
    return NextResponse.json(
      { error: 'Failed to retrieve stored extractions' },
      { status: 500 }
    );
  }
}
