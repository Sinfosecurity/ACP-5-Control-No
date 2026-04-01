// ============================================================
// types/index.ts — All shared TypeScript interfaces & literals
// Column names verified against live NYC Open Data exports 2026-03-30
// ============================================================

// -----------------------------------------------------------------------
// Enums / Literals
// -----------------------------------------------------------------------
export type Borough =
  | 'MANHATTAN'
  | 'BRONX'
  | 'BROOKLYN'
  | 'QUEENS'
  | 'STATEN ISLAND';

export type FilingSource = 'open_data' | 'dob_now_live' | 'merged';

export type DatasetId =
  | 'w9ak-ipjd'  // DOB NOW Build Job Application Filings
  | 'xxbr-ypig'  // DOB NOW Build Limited Alteration Applications
  | 'rbx6-tga4'  // DOB NOW Build Approved Permits
  | 'kfp4-dz4h'  // DOB NOW Build Elevator Permit Applications
  | 'ic3t-wcy2'; // Legacy BIS Job Application Filings (pre-DOB NOW)

export type SearchStatus = 'pending' | 'running' | 'complete' | 'error';
export type SourceLogStatus = 'pending' | 'success' | 'error' | 'skipped';

// -----------------------------------------------------------------------
// Address
// -----------------------------------------------------------------------
export interface RawAddress {
  houseNumber: string;
  streetName:  string;
  borough:     string;
}

export interface NormalizedAddress extends RawAddress {
  houseNumber:      string;
  streetName:       string;
  borough:          Borough;
  normalizedString: string; // "79 NORTH OXFORD WALK, BROOKLYN"
}

// -----------------------------------------------------------------------
// Unified Filing Record — canonical shape used across all sources
// -----------------------------------------------------------------------
export interface FilingRecord {
  id?:          string;
  source:       FilingSource;
  dataset?:     string;
  datasetName?: string;

  jobNumber?:    string;  // e.g. "B00123456" or "123456789"
  filingNumber?: string;  // e.g. "I1" or "01"
  filingStatus?: string;

  jobType?:  string;   // "New Job Filing", "A2", "NB" etc.
  workType?: string;   // "General Construction", "Gas Plumbing Work" etc.
  address?:  string;   // assembled display address

  permitNumber?:         string;
  filingDate?:           string;
  permitIssuedDate?:     string;
  permitExpirationDate?: string;
  signoffDate?:          string;

  description?: string;

  // People
  applicantFirstName?:      string;
  applicantLastName?:       string;
  ownerBusinessName?:       string;
  contractorBusinessName?:  string;

  // Building characteristics
  buildingType?:      string;
  communityBoard?:    string;
  existingOccupancy?: string;
  proposedOccupancy?: string;
  existingHeight?:    string;
  proposedHeight?:    string;
  existingStories?:   string;
  proposedStories?:   string;
  zoningDistrict?:    string;

  // Identifiers
  bin?: string;
  bbl?: string;

  // Asbestos control numbers (ACP-5, ACP-7, ACP-20/21)
  acpControlNumbers?: string[];  // e.g. ["TRU1600BK22", "31273241"]
  asbestosStatus?: string;       // e.g. "Abatement Required", "Not an Asbestos Project"
  caiNumber?: string;            // CAI # (Compliance Application ID) e.g. "120831"

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw?: Record<string, any>;
}

// -----------------------------------------------------------------------
// Search Request / Response
// -----------------------------------------------------------------------
export interface SearchRequest {
  houseNumber: string;
  streetName:  string;
  borough:     string;
  liveVerify?: boolean;
  searchByBin?: string; // future BIN-mode
}

export interface SearchResponse {
  searchId:          string;
  normalizedAddress: NormalizedAddress;
  filings:           FilingRecord[];
  asbestosData?:     {
    acp7Records: AsbestosACP7Record[];
    jobCompliance: Record<string, AsbestosJobCompliance>; // keyed by job number
  };
  summary:           SearchSummary;
  logs:              SourceLog[];
  durationMs:        number;
  error?:            string;
}

export interface SearchSummary {
  total:       number;
  openData:    number;
  livePortal:  number;
  merged:      number;
  datasets:    DatasetSummary[];
}

export interface DatasetSummary {
  datasetId:   string;
  datasetName: string;
  count:       number;
}

// -----------------------------------------------------------------------
// Source Logs
// -----------------------------------------------------------------------
export interface SourceLog {
  id?:             string;
  source:          FilingSource | string;
  dataset?:        string;
  status:          SourceLogStatus;
  recordsFound:    number;
  durationMs:      number;
  errorMessage?:   string;
  requestUrl?:     string;
  screenshotPath?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?:       Record<string, any>;
}

// -----------------------------------------------------------------------
// Database Row Types (snake_case — matches PostgreSQL columns)
// -----------------------------------------------------------------------
export interface DbSearch {
  id:                  string;
  property_id:         string | null;
  house_number:        string;
  street_name:         string;
  borough:             string;
  normalized_address:  string;
  live_verify:         boolean;
  status:              SearchStatus;
  error_message:       string | null;
  duration_ms:         number | null;
  total_results:       number;
  open_data_results:   number;
  live_results:        number;
  ip_address:          string | null;
  user_agent:          string | null;
  created_at:          Date;
  completed_at:        Date | null;
}

export interface DbProperty {
  id:                 string;
  house_number:       string;
  street_name:        string;
  borough:            string;
  normalized_address: string;
  bin:                string | null;
  bbl:                string | null;
  zip_code:           string | null;
  created_at:         Date;
  updated_at:         Date;
}

export interface DbFiling {
  id:                      string;
  property_id:             string;
  job_number:              string | null;
  filing_number:           string | null;
  filing_status:           string | null;
  job_type:                string | null;
  work_type:               string | null;
  address:                 string | null;
  permit_number:           string | null;
  filing_date:             Date | null;
  permit_issued_date:      Date | null;
  permit_expiration_date:  Date | null;
  signoff_date:            Date | null;
  description:             string | null;
  source:                  FilingSource;
  dataset:                 string | null;
  dataset_name:            string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw:                     Record<string, any> | null;
  first_seen_at:           Date;
  last_updated_at:         Date;
}

export interface DbSourceLog {
  id:               string;
  search_id:        string;
  source:           string;
  dataset:          string | null;
  status:           SourceLogStatus;
  records_found:    number;
  duration_ms:      number | null;
  error_message:    string | null;
  request_url:      string | null;
  screenshot_path:  string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata:         Record<string, any> | null;
  created_at:       Date;
}

// -----------------------------------------------------------------------
// History / Persistence
// -----------------------------------------------------------------------
export interface SearchHistoryItem {
  id:               string;
  normalizedAddress: string;
  houseNumber:      string;
  streetName:       string;
  borough:          string;
  totalResults:     number;
  openDataResults:  number;
  liveResults:      number;
  createdAt:        string;
  status:           SearchStatus;
}

// -----------------------------------------------------------------------
// Asbestos Abatement types
// -----------------------------------------------------------------------

/**
 * The three compliance states a DOB NOW job can be in for asbestos.
 * Mirrors the radio-button selection on the PW1 form General Information tab.
 */
export type AsbestosComplianceStatus =
  | 'REQUIRES_ABATEMENT'   // "scope of work requires related asbestos abatement"
  | 'NOT_ASBESTOS_PROJECT' // "scope of work is not an asbestos project" (ACP-5 filed)
  | 'EXEMPT'               // "scope of work is exempt from the asbestos requirement"
  | 'UNKNOWN';

/**
 * Per-job asbestos abatement compliance record —
 * sourced from DOB NOW portal scrape (General Information → Asbestos Abatement Compliance)
 */
export interface AsbestosJobCompliance {
  jobNumber:           string;
  complianceStatus:    AsbestosComplianceStatus;
  complianceStatement: string;   // raw text of the selected radio button
  depControlNumber?:   string;   // ACP-5 or ACP-7 (TRU#) or ACP-20/21 control number
  investigatorCertNumber?: string;
  source:              'dob_now_portal';
  scrapedAt:           string;   // ISO timestamp
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw?: Record<string, any>;
}

/**
 * ACP7 project notification record from NYC DEP Open Data (vq35-j9qm)
 * One record per work area / abatement scope.
 */
export interface AsbestosACP7Record {
  // Core identification
  controlNumber:   string;   // TRU field — e.g. "TRU2484MN25"
  status:          string;   // "Submitted" | "Closed" | "Postponed"
  startDate?:      string;
  endDate?:        string;

  // Location
  houseNo?:        string;
  streetName?:     string;
  borough?:        string;
  zipCode?:        string;
  bin?:            string;
  block?:          string;
  lot?:            string;
  bbl?:            string;
  facilityName?:   string;
  facilityType?:   string;   // "Residence" | "Commercial" | "Hospital" | "Other"
  floor?:          string;
  section?:        string;   // work area description
  entireFloor?:    string;

  // People / companies
  buildingOwnerName?: string;
  contractorName?:    string;
  airMonitorName?:    string;

  // Abatement details
  acmType?:        string;   // "VAT & Mastic", "Pipe Insulation", etc.
  acmAmount?:      string;
  acmUnit?:        string;   // "Square Feet" | "Linear Feet"
  abatementType?:  string;   // "Removal" | "Encapsulation"
  procedureName?:  string;   // "Tent" | "Exterior Foam" | "DEP Variance" | etc.
  streetActivity?: string;

  // Geographic
  latitude?:       string;
  longitude?:      string;
  communityBoard?: string;
  councilDistrict?: string;
  censusTract?:    string;
  nta?:            string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw?: Record<string, any>;
}

/**
 * Full asbestos lookup result for one job number.
 */
export interface AsbestosLookupResult {
  jobNumber:      string;
  jobCompliance?: AsbestosJobCompliance;     // from DOB NOW portal scrape
  acp7Records:    AsbestosACP7Record[];       // from DEP Open Data, matched by BIN/address
  durationMs:     number;
  error?:         string;
}

// -----------------------------------------------------------------------
// Dataset human-readable names map (extend existing)
// -----------------------------------------------------------------------
export const DATASET_NAMES: Record<string, string> = {
  'w9ak-ipjd':      'Job Application Filings',
  'xxbr-ypig':      'Limited Alteration Applications',
  'rbx6-tga4':      'Approved Permits',
  'kfp4-dz4h':      'Elevator Permit Applications',
  'ic3t-wcy2':      'Legacy Job Filings (BIS)',
  'vq35-j9qm':      'DEP Asbestos Control Program (ACP7)',
  'dob_now_portal': 'DOB NOW Live Portal',
};
