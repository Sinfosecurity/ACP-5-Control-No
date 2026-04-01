// ============================================================
// services/db-service.ts
// Persist searches, properties, filings, and source logs to PostgreSQL
// ============================================================
import { query, transaction } from '@/lib/db';
import type {
  FilingRecord,
  NormalizedAddress,
  SearchSummary,
  SourceLog,
  SearchHistoryItem,
  DbSearch,
} from '@/types';

// -----------------------------------------------------------------------
// Upsert a property record, return its ID
// -----------------------------------------------------------------------
export async function upsertProperty(addr: NormalizedAddress): Promise<string | null> {
  try {
    const rows = await query<{ id: string }>(
      `INSERT INTO properties (house_number, street_name, borough, normalized_address)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (normalized_address) DO UPDATE
         SET updated_at = NOW()
       RETURNING id`,
      [addr.houseNumber, addr.streetName, addr.borough, addr.normalizedString]
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    console.error('[db] upsertProperty error:', err);
    return null;
  }
}

// -----------------------------------------------------------------------
// Create a search record (initially pending)
// -----------------------------------------------------------------------
export async function createSearch(params: {
  addr:         NormalizedAddress;
  propertyId:   string | null;
  liveVerify:   boolean;
  ipAddress?:   string;
  userAgent?:   string;
}): Promise<string | null> {
  try {
    const rows = await query<{ id: string }>(
      `INSERT INTO searches
         (property_id, house_number, street_name, borough, normalized_address,
          live_verify, status, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,'running',$7,$8)
       RETURNING id`,
      [
        params.propertyId,
        params.addr.houseNumber,
        params.addr.streetName,
        params.addr.borough,
        params.addr.normalizedString,
        params.liveVerify,
        params.ipAddress ?? null,
        params.userAgent ?? null,
      ]
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    console.error('[db] createSearch error:', err);
    return null;
  }
}

// -----------------------------------------------------------------------
// Update search after completion
// -----------------------------------------------------------------------
export async function completeSearch(params: {
  searchId:    string;
  summary:     SearchSummary;
  durationMs:  number;
  error?:      string;
}): Promise<void> {
  try {
    await query(
      `UPDATE searches SET
         status          = $1,
         error_message   = $2,
         duration_ms     = $3,
         total_results   = $4,
         open_data_results = $5,
         live_results    = $6,
         completed_at    = NOW()
       WHERE id = $7`,
      [
        params.error ? 'error' : 'complete',
        params.error ?? null,
        params.durationMs,
        params.summary.total,
        params.summary.openData,
        params.summary.livePortal,
        params.searchId,
      ]
    );
  } catch (err) {
    console.error('[db] completeSearch error:', err);
  }
}

// -----------------------------------------------------------------------
// Upsert filings and link to search
// -----------------------------------------------------------------------
export async function persistFilings(
  propertyId: string,
  searchId:   string,
  filings:    FilingRecord[]
): Promise<void> {
  if (filings.length === 0) return;

  try {
    await transaction(async client => {
      for (const f of filings) {
        // Upsert the filing
        const result = await client.query<{ id: string }>(
          `INSERT INTO filings
             (property_id, job_number, filing_number, filing_status, job_type,
              work_type, address, permit_number, filing_date, permit_issued_date,
              permit_expiration_date, signoff_date, description, source, dataset,
              dataset_name, raw)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
                   $9::date,$10::date,$11::date,$12::date,
                   $13,$14,$15,$16,$17)
           ON CONFLICT (property_id, job_number, filing_number, source) DO UPDATE SET
             filing_status         = EXCLUDED.filing_status,
             permit_issued_date    = EXCLUDED.permit_issued_date,
             permit_expiration_date= EXCLUDED.permit_expiration_date,
             signoff_date          = EXCLUDED.signoff_date,
             raw                   = EXCLUDED.raw,
             last_updated_at       = NOW()
           RETURNING id`,
          [
            propertyId,
            f.jobNumber    ?? null,
            f.filingNumber ?? null,
            f.filingStatus ?? null,
            f.jobType      ?? null,
            f.workType     ?? null,
            f.address      ?? null,
            f.permitNumber ?? null,
            f.filingDate   ? f.filingDate.slice(0, 10) : null,
            f.permitIssuedDate     ? f.permitIssuedDate.slice(0, 10)     : null,
            f.permitExpirationDate ? f.permitExpirationDate.slice(0, 10) : null,
            f.signoffDate  ? f.signoffDate.slice(0, 10) : null,
            f.description  ?? null,
            f.source,
            f.dataset      ?? null,
            f.datasetName  ?? null,
            f.raw ? JSON.stringify(f.raw) : null,
          ]
        );

        const filingId = result.rows[0]?.id;
        if (filingId) {
          await client.query(
            `INSERT INTO search_filings (search_id, filing_id)
             VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [searchId, filingId]
          );
        }
      }
    });
  } catch (err) {
    console.error('[db] persistFilings error:', err);
  }
}

// -----------------------------------------------------------------------
// Persist source logs
// -----------------------------------------------------------------------
export async function persistSourceLogs(
  searchId: string,
  logs: SourceLog[]
): Promise<void> {
  try {
    for (const log of logs) {
      await query(
        `INSERT INTO source_logs
           (search_id, source, dataset, status, records_found, duration_ms,
            error_message, request_url, screenshot_path, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          searchId,
          log.source,
          log.dataset   ?? null,
          log.status,
          log.recordsFound,
          log.durationMs,
          log.errorMessage    ?? null,
          log.requestUrl      ?? null,
          log.screenshotPath  ?? null,
          log.metadata ? JSON.stringify(log.metadata) : null,
        ]
      );
    }
  } catch (err) {
    console.error('[db] persistSourceLogs error:', err);
  }
}

// -----------------------------------------------------------------------
// Get recent search history
// -----------------------------------------------------------------------
export async function getSearchHistory(limit = 20): Promise<SearchHistoryItem[]> {
  try {
    const rows = await query<DbSearch>(
      `SELECT * FROM searches
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    return rows.map(r => ({
      id:               r.id,
      normalizedAddress: r.normalized_address,
      houseNumber:      r.house_number,
      streetName:       r.street_name,
      borough:          r.borough,
      totalResults:     r.total_results,
      openDataResults:  r.open_data_results,
      liveResults:      r.live_results,
      createdAt:        r.created_at.toISOString(),
      status:           r.status,
    }));
  } catch (err) {
    console.error('[db] getSearchHistory error:', err);
    return [];
  }
}

// -----------------------------------------------------------------------
// Asbestos persistence helpers
// -----------------------------------------------------------------------
import type { AsbestosACP7Record, AsbestosJobCompliance } from '@/types';

/** Upsert ACP7 records — idempotent on control_number */
export async function persistACP7Records(
  propertyId: string | null,
  records: AsbestosACP7Record[]
): Promise<void> {
  if (records.length === 0) return;
  try {
    for (const r of records) {
      await query(
        `INSERT INTO asbestos_acp7_records
           (property_id, control_number, status, start_date, end_date,
            house_no, street_name, borough, zip_code, bin, block, lot, bbl,
            facility_name, facility_type, floor, section, entire_floor,
            building_owner_name, contractor_name, air_monitor_name,
            acm_type, acm_amount, acm_unit, abatement_type, procedure_name,
            street_activity, latitude, longitude, community_board,
            council_district, census_tract, nta, raw)
         VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,$8,$9,$10,$11,$12,$13,
                 $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,
                 $27,$28,$29,$30,$31,$32,$33,$34)
         ON CONFLICT (control_number) DO UPDATE SET
           status      = EXCLUDED.status,
           end_date    = EXCLUDED.end_date,
           raw         = EXCLUDED.raw,
           fetched_at  = NOW()`,
        [
          propertyId,
          r.controlNumber,
          r.status        ?? null,
          r.startDate     ? r.startDate.slice(0, 10) : null,
          r.endDate       ? r.endDate.slice(0, 10)   : null,
          r.houseNo       ?? null,
          r.streetName    ?? null,
          r.borough       ?? null,
          r.zipCode       ?? null,
          r.bin           ?? null,
          r.block         ?? null,
          r.lot           ?? null,
          r.bbl           ?? null,
          r.facilityName  ?? null,
          r.facilityType  ?? null,
          r.floor         ?? null,
          r.section       ?? null,
          r.entireFloor   ?? null,
          r.buildingOwnerName  ?? null,
          r.contractorName     ?? null,
          r.airMonitorName     ?? null,
          r.acmType       ?? null,
          r.acmAmount     ?? null,
          r.acmUnit       ?? null,
          r.abatementType ?? null,
          r.procedureName ?? null,
          r.streetActivity ?? null,
          r.latitude      ? parseFloat(r.latitude)  : null,
          r.longitude     ? parseFloat(r.longitude) : null,
          r.communityBoard  ?? null,
          r.councilDistrict ?? null,
          r.censusTract   ?? null,
          r.nta           ?? null,
          r.raw ? JSON.stringify(r.raw) : null,
        ]
      );
    }
  } catch (err) {
    console.error('[db] persistACP7Records error:', err);
  }
}

/** Upsert per-job asbestos compliance record */
export async function persistJobCompliance(
  c: AsbestosJobCompliance
): Promise<void> {
  try {
    await query(
      `INSERT INTO asbestos_job_compliance
         (job_number, compliance_status, compliance_statement,
          dep_control_number, investigator_cert_number, scraped_at, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (job_number) DO UPDATE SET
         compliance_status        = EXCLUDED.compliance_status,
         compliance_statement     = EXCLUDED.compliance_statement,
         dep_control_number       = EXCLUDED.dep_control_number,
         investigator_cert_number = EXCLUDED.investigator_cert_number,
         scraped_at               = EXCLUDED.scraped_at,
         raw                      = EXCLUDED.raw`,
      [
        c.jobNumber,
        c.complianceStatus,
        c.complianceStatement ?? null,
        c.depControlNumber    ?? null,
        c.investigatorCertNumber ?? null,
        c.scrapedAt,
        c.raw ? JSON.stringify(c.raw) : null,
      ]
    );
  } catch (err) {
    console.error('[db] persistJobCompliance error:', err);
  }
}

/** Look up cached asbestos compliance for a job */
export async function getCachedJobCompliance(
  jobNumber: string
): Promise<AsbestosJobCompliance | null> {
  try {
    const rows = await query<{
      job_number: string;
      compliance_status: string;
      compliance_statement: string;
      dep_control_number: string | null;
      investigator_cert_number: string | null;
      scraped_at: Date;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      raw: Record<string, any> | null;
    }>(
      `SELECT * FROM asbestos_job_compliance WHERE job_number = $1`,
      [jobNumber.toUpperCase()]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      jobNumber:              r.job_number,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      complianceStatus:       r.compliance_status as any,
      complianceStatement:    r.compliance_statement,
      depControlNumber:       r.dep_control_number ?? undefined,
      investigatorCertNumber: r.investigator_cert_number ?? undefined,
      source:                 'dob_now_portal' as const,
      scrapedAt:              r.scraped_at.toISOString(),
      raw:                    r.raw ?? undefined,
    };
  } catch (err) {
    console.error('[db] getCachedJobCompliance error:', err);
    return null;
  }
}
