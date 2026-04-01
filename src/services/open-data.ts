// ============================================================
// services/open-data.ts
// NYC Open Data (Socrata SODA) — DOB filing datasets
//
// Column names verified against live CSV exports on 2026-03-30:
//   w9ak-ipjd: house_no, street_name, borough, job_filing_number, filing_status
//   xxbr-ypig: location_house_no, location_street_name, location_borough_name
//   rbx6-tga4: house_no, street_name, borough, job_filing_number, permit_status
//   kfp4-dz4h: house_number, street_name, borough, job_filling_number
//   ic3t-wcy2: house__, streetname, borough (legacy BIS dataset)
// ============================================================
import type { FilingRecord, NormalizedAddress, SourceLog } from '@/types';
import {
  whereForJobFilings,
  whereForLimitedAlts,
  whereForApprovedPermits,
  whereForElevatorPermits,
  whereForLegacyJobFilings,
} from '@/lib/address-normalizer';
import { cleanString, withRetry } from '@/lib/utils';

const BASE_URL    = 'https://data.cityofnewyork.us/resource';
const APP_TOKEN   = process.env.NYC_OPEN_DATA_APP_TOKEN ?? '';
const LIMIT       = 200;

// -----------------------------------------------------------------------
// Shared fetch helper
// -----------------------------------------------------------------------
async function socrataFetch<T>(
  datasetId: string,
  params: Record<string, string>
): Promise<{ rows: T[]; requestUrl: string }> {
  const url = new URL(`${BASE_URL}/${datasetId}.json`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const headers: HeadersInit = { Accept: 'application/json' };
  if (APP_TOKEN) headers['X-App-Token'] = APP_TOKEN;

  const requestUrl = url.toString();

  const res = await withRetry(async () => {
    const r = await fetch(requestUrl, {
      headers,
      // 5-minute ISR cache — stale data is fine for Open Data
      next: { revalidate: 300 },
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`Socrata ${datasetId} HTTP ${r.status}: ${body.slice(0, 200)}`);
    }
    return r;
  }, { retries: 2, baseDelayMs: 600 });

  const rows = (await res.json()) as T[];
  return { rows, requestUrl };
}

// -----------------------------------------------------------------------
// Helper to build a consistent SourceLog entry
// -----------------------------------------------------------------------
function makeLog(
  dataset: string,
  status: 'success' | 'error',
  recordsFound: number,
  durationMs: number,
  requestUrl: string,
  errorMessage?: string
): SourceLog {
  return { source: 'open_data', dataset, status, recordsFound, durationMs, requestUrl, errorMessage };
}

// -----------------------------------------------------------------------
// Dataset 1: w9ak-ipjd — DOB NOW Build Job Application Filings
//
// Key columns (verified):
//   job_filing_number  — combined job+filing id, e.g. "B00123456-I1"
//   filing_status      — e.g. "Permit Issued", "Approved", "Pre-Filing"
//   house_no           — house number
//   street_name        — street name (UPPER)
//   borough            — BROOKLYN / MANHATTAN / etc.
//   bin                — Building Identification Number
//   applicant_first_name, applicant_last_name
//   owner_s_business_name
//   building_type, existing_stories, existing_height, proposed_no_of_stories
// -----------------------------------------------------------------------
interface W9akRow {
  job_filing_number:       string;
  filing_status:           string;
  house_no:                string;
  street_name:             string;
  borough:                 string;
  bin:                     string;
  block:                   string;
  lot:                     string;
  applicant_first_name:    string;
  applicants_middle_initial: string;
  applicant_last_name:     string;
  owner_s_business_name:   string;
  owner_s_street_name:     string;
  building_type:           string;
  existing_stories:        string;
  existing_height:         string;
  proposed_no_of_stories:  string;
  proposed_height:         string;
  existing_dwelling_units: string;
  proposed_dwelling_units: string;
  initial_cost:            string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

export async function queryJobFilings(addr: NormalizedAddress): Promise<{
  records: FilingRecord[]; log: SourceLog;
}> {
  const id   = 'w9ak-ipjd';
  const name = 'Job Application Filings';
  const t0   = Date.now();

  try {
    const where = whereForJobFilings(addr);
    const { rows, requestUrl } = await socrataFetch<W9akRow>(id, {
      '$where': where,
      '$limit': String(LIMIT),
      '$order': 'job_filing_number DESC',
    });

    const records: FilingRecord[] = rows.map(r => {
      // job_filing_number is like "B00123456-I1" — job = "B00123456", filing = "I1"
      const parts       = (r.job_filing_number ?? '').split('-');
      const jobNumber   = parts[0] ?? undefined;
      const filingPart  = parts.slice(1).join('-') || undefined;

      return {
        source:       'open_data' as const,
        dataset:      id,
        datasetName:  name,
        jobNumber:    cleanString(jobNumber),
        filingNumber: cleanString(filingPart),
        filingStatus: cleanString(r.filing_status),
        jobType:      undefined, // not present in this dataset's top-level fields
        workType:     undefined,
        address:      [r.house_no, r.street_name, r.borough].filter(Boolean).join(' '),
        bin:          cleanString(r.bin),
        bbl:          r.block && r.lot
          ? `${r.borough === 'BROOKLYN' ? '3' : ''}${r.block}${r.lot}`
          : undefined,
        applicantFirstName:  cleanString(r.applicant_first_name),
        applicantLastName:   cleanString(r.applicant_last_name),
        ownerBusinessName:   cleanString(r.owner_s_business_name),
        buildingType:        cleanString(r.building_type),
        existingStories:     cleanString(r.existing_stories),
        proposedStories:     cleanString(r.proposed_no_of_stories),
        existingHeight:      cleanString(r.existing_height),
        proposedHeight:      cleanString(r.proposed_height),
        raw: r as Record<string, unknown>,
      };
    });

    return {
      records,
      log: makeLog(id, 'success', records.length, Date.now() - t0, requestUrl),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[open-data] ${id}:`, error);
    return {
      records: [],
      log: makeLog(id, 'error', 0, Date.now() - t0, `${BASE_URL}/${id}.json`, error),
    };
  }
}

// -----------------------------------------------------------------------
// Dataset 2: xxbr-ypig — DOB NOW Build Limited Alteration Applications
//
// Key columns (verified):
//   job_number             — e.g. "X01303441"
//   filing_number          — e.g. "I1"
//   filing_status_name     — e.g. "Signed off", "Pre-Filing"
//   permit_number          — e.g. "X01303441-I1-LA"
//   filing_date            — ISO date string
//   permit_issued_date
//   permit_expiration_date
//   laasign_off_date
//   work_type_name         — e.g. "Gas Plumbing Work"
//   location_house_no
//   location_street_name
//   location_borough_name
//   location_bin
//   proposed_work_summary
//   building_type_name
//   bbl
// -----------------------------------------------------------------------
interface XxbrRow {
  job_number:              string;
  filing_number:           string;
  filing_type_name:        string;
  filing_status_name:      string;
  permit_number:           string;
  filing_date:             string;
  permit_issued_date:      string;
  permit_expiration_date:  string;
  laasign_off_date:        string;
  work_type_name:          string;
  location_bin:            string;
  location_house_no:       string;
  location_street_name:    string;
  location_borough_name:   string;
  proposed_work_summary:   string;
  building_type_name:      string;
  bbl:                     string;
  zip_code:                string;
  community_board:         string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

export async function queryLimitedAlterations(addr: NormalizedAddress): Promise<{
  records: FilingRecord[]; log: SourceLog;
}> {
  const id   = 'xxbr-ypig';
  const name = 'Limited Alteration Applications';
  const t0   = Date.now();

  try {
    const where = whereForLimitedAlts(addr);
    const { rows, requestUrl } = await socrataFetch<XxbrRow>(id, {
      '$where': where,
      '$limit': String(LIMIT),
      '$order': 'filing_date DESC',
    });

    const records: FilingRecord[] = rows.map(r => ({
      source:               'open_data' as const,
      dataset:              id,
      datasetName:          name,
      jobNumber:            cleanString(r.job_number),
      filingNumber:         cleanString(r.filing_number),
      filingStatus:         cleanString(r.filing_status_name),
      jobType:              cleanString(r.filing_type_name),
      workType:             cleanString(r.work_type_name),
      address:              [r.location_house_no, r.location_street_name, r.location_borough_name]
                              .filter(Boolean).join(' '),
      permitNumber:         cleanString(r.permit_number),
      filingDate:           cleanString(r.filing_date),
      permitIssuedDate:     cleanString(r.permit_issued_date),
      permitExpirationDate: cleanString(r.permit_expiration_date),
      signoffDate:          cleanString(r.laasign_off_date),
      description:          cleanString(r.proposed_work_summary),
      buildingType:         cleanString(r.building_type_name),
      bin:                  cleanString(r.location_bin),
      bbl:                  cleanString(r.bbl),
      communityBoard:       cleanString(r.community_board),
      raw: r as Record<string, unknown>,
    }));

    return {
      records,
      log: makeLog(id, 'success', records.length, Date.now() - t0, requestUrl),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[open-data] ${id}:`, error);
    return {
      records: [],
      log: makeLog(id, 'error', 0, Date.now() - t0, `${BASE_URL}/${id}.json`, error),
    };
  }
}

// -----------------------------------------------------------------------
// Dataset 3: rbx6-tga4 — DOB NOW Build Approved Permits
//
// Key columns (verified):
//   job_filing_number   — e.g. "M01052483-I1"
//   work_permit         — e.g. "M01052483-I1-GC"
//   sequence_number     — e.g. "2"
//   filing_reason       — "Initial Permit" | "Renewal Permit Without Changes"
//   house_no
//   street_name
//   borough
//   bin
//   work_type           — e.g. "General Construction", "Construction Fence"
//   approved_date
//   issued_date
//   expired_date
//   job_description
//   owner_business_name
//   permit_status       — e.g. "Permit Issued", "Signed-off"
// -----------------------------------------------------------------------
interface Rbx6Row {
  job_filing_number:   string;
  work_permit:         string;
  sequence_number:     string;
  filing_reason:       string;
  house_no:            string;
  street_name:         string;
  borough:             string;
  lot:                 string;
  bin:                 string;
  block:               string;
  c_b_no:              string;
  work_type:           string;
  approved_date:       string;
  issued_date:         string;
  expired_date:        string;
  job_description:     string;
  estimated_job_costs: string;
  owner_business_name: string;
  owner_name:          string;
  permit_status:       string;
  tracking_number:     string;
  zip_code:            string;
  applicant_first_name: string;
  applicant_last_name: string;
  applicant_business_name: string;
  permittee_s_license_type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

export async function queryApprovedPermits(addr: NormalizedAddress): Promise<{
  records: FilingRecord[]; log: SourceLog;
}> {
  const id   = 'rbx6-tga4';
  const name = 'Approved Permits';
  const t0   = Date.now();

  try {
    const where = whereForApprovedPermits(addr);
    const { rows, requestUrl } = await socrataFetch<Rbx6Row>(id, {
      '$where': where,
      '$limit': String(LIMIT),
      '$order': 'issued_date DESC',
    });

    const records: FilingRecord[] = rows.map(r => {
      const parts      = (r.job_filing_number ?? '').split('-');
      const jobNumber  = parts[0] ?? undefined;
      const filingPart = parts.slice(1).join('-') || undefined;

      return {
        source:               'open_data' as const,
        dataset:              id,
        datasetName:          name,
        jobNumber:            cleanString(jobNumber),
        filingNumber:         cleanString(filingPart),
        filingStatus:         cleanString(r.permit_status),
        jobType:              cleanString(r.filing_reason),
        workType:             cleanString(r.work_type),
        address:              [r.house_no, r.street_name, r.borough].filter(Boolean).join(' '),
        permitNumber:         cleanString(r.work_permit),
        permitIssuedDate:     cleanString(r.issued_date),
        permitExpirationDate: cleanString(r.expired_date),
        description:          cleanString(r.job_description),
        ownerBusinessName:    cleanString(r.owner_business_name),
        contractorBusinessName: cleanString(r.applicant_business_name),
        applicantFirstName:   cleanString(r.applicant_first_name),
        applicantLastName:    cleanString(r.applicant_last_name),
        communityBoard:       cleanString(r.c_b_no),
        bin:                  cleanString(r.bin),
        raw: r as Record<string, unknown>,
      };
    });

    return {
      records,
      log: makeLog(id, 'success', records.length, Date.now() - t0, requestUrl),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[open-data] ${id}:`, error);
    return {
      records: [],
      log: makeLog(id, 'error', 0, Date.now() - t0, `${BASE_URL}/${id}.json`, error),
    };
  }
}

// -----------------------------------------------------------------------
// Dataset 4: kfp4-dz4h — DOB NOW Build Elevator Permit Applications
//
// Key columns (verified):
//   job_filling_number  — note: "filling" (typo in dataset), e.g. "B00001234-I1"
//   job_number          — e.g. "B00001234"
//   filing_number       — e.g. "I1"
//   filing_date
//   filing_type         — "New Job Filing", "Post Approval Amendment"
//   elevator_device_type — e.g. "Passenger Elevator"
//   filing_status       — e.g. "Permit Entire", "Signed Off"
//   signed_off_date
//   house_number        — NOTE: "house_number" not "house_no"
//   street_name
//   borough
//   bin
//   building_stories
// -----------------------------------------------------------------------
interface Kfp4Row {
  job_filling_number:  string;  // typo in dataset — "filling" not "filing"
  job_number:          string;
  filing_number:       string;
  filing_date:         string;
  filing_type:         string;
  elevator_device_type: string;
  filing_status:       string;
  filing_status_or_filing_includes: string;
  building_code:       string;
  electrical_permit_number: string;
  bin:                 string;
  house_number:        string;  // NOTE: "house_number" not "house_no"
  street_name:         string;
  zip:                 string;
  borough:             string;
  block:               string;
  lot:                 string;
  buildingtype:        string;
  building_stories:    string;
  signed_off_date:     string;
  applicant_first_name: string;
  applicant_last_name: string;
  applicant_business_name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

export async function queryElevatorPermits(addr: NormalizedAddress): Promise<{
  records: FilingRecord[]; log: SourceLog;
}> {
  const id   = 'kfp4-dz4h';
  const name = 'Elevator Permit Applications';
  const t0   = Date.now();

  try {
    const where = whereForElevatorPermits(addr);
    const { rows, requestUrl } = await socrataFetch<Kfp4Row>(id, {
      '$where': where,
      '$limit': String(LIMIT),
      '$order': 'filing_date DESC',
    });

    const records: FilingRecord[] = rows.map(r => ({
      source:           'open_data' as const,
      dataset:          id,
      datasetName:      name,
      jobNumber:        cleanString(r.job_number),
      filingNumber:     cleanString(r.filing_number),
      filingStatus:     cleanString(r.filing_status),
      jobType:          cleanString(r.filing_type),
      workType:         cleanString(r.elevator_device_type),
      address:          [r.house_number, r.street_name, r.borough].filter(Boolean).join(' '),
      filingDate:       cleanString(r.filing_date),
      signoffDate:      cleanString(r.signed_off_date),
      buildingType:     cleanString(r.buildingtype),
      existingStories:  cleanString(r.building_stories),
      bin:              cleanString(r.bin),
      applicantFirstName: cleanString(r.applicant_first_name),
      applicantLastName:  cleanString(r.applicant_last_name),
      contractorBusinessName: cleanString(r.applicant_business_name),
      raw: r as Record<string, unknown>,
    }));

    return {
      records,
      log: makeLog(id, 'success', records.length, Date.now() - t0, requestUrl),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[open-data] ${id}:`, error);
    return {
      records: [],
      log: makeLog(id, 'error', 0, Date.now() - t0, `${BASE_URL}/${id}.json`, error),
    };
  }
}

// -----------------------------------------------------------------------
// Dataset 5: ic3t-wcy2 — Legacy DOB Job Application Filings (BIS era)
// Covers pre-DOB NOW filings (roughly 2000–2018)
//
// Key columns:
//   job__         — job number
//   doc__         — document / filing number
//   job_type      — "A2", "A1", "NB", "DM"
//   job_status_descrp — human-readable status
//   house__       — house number
//   streetname    — NOTE: one word, no underscore
//   borough
//   bin__
//   date_filed
//   job_description
// -----------------------------------------------------------------------
interface Ic3tRow {
  job__:              string;
  doc__:              string;
  borough:            string;
  house__:            string;
  streetname:         string;  // one word — no underscore
  block:              string;
  lot:                string;
  bin__:              string;
  job_type:           string;
  job_status:         string;
  job_status_descrp:  string;
  job_description:    string;
  owner_s_first_name: string;
  owner_s_last_name:  string;
  owner_s_business_name: string;
  applicant_s_first_name: string;
  applicant_s_last_name:  string;
  date_filed:         string;
  latest_action_date: string;
  community___board:  string;
  building_type:      string;
  existing_occupancy: string;
  proposed_occupancy: string;
  existing_no_of_stories: string;
  proposed_no_of_stories: string;
  existing_height:    string;
  proposed_height:    string;
  zoning_dist1:       string;
  work_type:          string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

export async function queryLegacyJobFilings(addr: NormalizedAddress): Promise<{
  records: FilingRecord[]; log: SourceLog;
}> {
  const id   = 'ic3t-wcy2';
  const name = 'Legacy Job Application Filings (BIS)';
  const t0   = Date.now();

  try {
    const where = whereForLegacyJobFilings(addr);
    const { rows, requestUrl } = await socrataFetch<Ic3tRow>(id, {
      '$where': where,
      '$limit': String(LIMIT),
      '$order': 'date_filed DESC',
    });

    const records: FilingRecord[] = rows.map(r => ({
      source:           'open_data' as const,
      dataset:          id,
      datasetName:      name,
      jobNumber:        cleanString(r.job__),
      filingNumber:     cleanString(r.doc__),
      filingStatus:     cleanString(r.job_status_descrp ?? r.job_status),
      jobType:          cleanString(r.job_type),
      workType:         cleanString(r.work_type),
      address:          [r.house__, r.streetname, r.borough].filter(Boolean).join(' '),
      filingDate:       cleanString(r.date_filed),
      description:      cleanString(r.job_description),
      applicantFirstName:  cleanString(r.applicant_s_first_name),
      applicantLastName:   cleanString(r.applicant_s_last_name),
      ownerBusinessName:   cleanString(r.owner_s_business_name),
      communityBoard:   cleanString(r.community___board),
      buildingType:     cleanString(r.building_type),
      existingOccupancy:  cleanString(r.existing_occupancy),
      proposedOccupancy:  cleanString(r.proposed_occupancy),
      existingStories:    cleanString(r.existing_no_of_stories),
      proposedStories:    cleanString(r.proposed_no_of_stories),
      existingHeight:     cleanString(r.existing_height),
      proposedHeight:     cleanString(r.proposed_height),
      zoningDistrict:     cleanString(r.zoning_dist1),
      bin:              cleanString(r.bin__),
      raw: r as Record<string, unknown>,
    }));

    return {
      records,
      log: makeLog(id, 'success', records.length, Date.now() - t0, requestUrl),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[open-data] ${id}:`, error);
    return {
      records: [],
      log: makeLog(id, 'error', 0, Date.now() - t0, `${BASE_URL}/${id}.json`, error),
    };
  }
}

// -----------------------------------------------------------------------
// Run all 5 datasets in parallel
// -----------------------------------------------------------------------
export async function queryAllOpenData(addr: NormalizedAddress): Promise<{
  records: FilingRecord[];
  logs:    SourceLog[];
}> {
  const results = await Promise.allSettled([
    queryJobFilings(addr),
    queryLimitedAlterations(addr),
    queryApprovedPermits(addr),
    queryElevatorPermits(addr),
    queryLegacyJobFilings(addr),
  ]);

  const allRecords: FilingRecord[] = [];
  const allLogs:    SourceLog[]    = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allRecords.push(...result.value.records);
      allLogs.push(result.value.log);
    } else {
      const error = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
      console.error('[open-data] dataset promise rejected:', error);
      allLogs.push({
        source: 'open_data',
        status: 'error',
        recordsFound: 0,
        durationMs: 0,
        errorMessage: error,
      });
    }
  }

  return { records: allRecords, logs: allLogs };
}
