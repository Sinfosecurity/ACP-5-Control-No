-- ============================================================
-- NYC DOB Filing Lookup — Database Schema
-- Compatible with PostgreSQL 14+ and Supabase
-- Run: psql $DATABASE_URL -f schema.sql
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for fuzzy address search

-- ============================================================
-- properties
-- Deduplicated property records derived from searches
-- ============================================================
CREATE TABLE IF NOT EXISTS properties (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  house_number  TEXT NOT NULL,
  street_name   TEXT NOT NULL,
  borough       TEXT NOT NULL,
  normalized_address TEXT NOT NULL,
  bin           TEXT,              -- Building Identification Number
  bbl           TEXT,              -- Borough Block Lot
  zip_code      TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_property_address UNIQUE (normalized_address)
);

CREATE INDEX IF NOT EXISTS idx_properties_normalized ON properties (normalized_address);
CREATE INDEX IF NOT EXISTS idx_properties_borough    ON properties (borough);
CREATE INDEX IF NOT EXISTS idx_properties_bin        ON properties (bin) WHERE bin IS NOT NULL;

-- ============================================================
-- searches
-- Each user search event
-- ============================================================
CREATE TABLE IF NOT EXISTS searches (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id   UUID REFERENCES properties(id) ON DELETE SET NULL,
  house_number  TEXT NOT NULL,
  street_name   TEXT NOT NULL,
  borough       TEXT NOT NULL,
  normalized_address TEXT NOT NULL,
  live_verify   BOOLEAN DEFAULT FALSE,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'complete', 'error')),
  error_message TEXT,
  duration_ms   INTEGER,
  total_results INTEGER DEFAULT 0,
  open_data_results INTEGER DEFAULT 0,
  live_results  INTEGER DEFAULT 0,
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_searches_property  ON searches (property_id);
CREATE INDEX IF NOT EXISTS idx_searches_created   ON searches (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_searches_normalized ON searches (normalized_address);
CREATE INDEX IF NOT EXISTS idx_searches_status    ON searches (status);

-- ============================================================
-- filings
-- Merged/deduplicated filing records
-- ============================================================
CREATE TABLE IF NOT EXISTS filings (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id           UUID REFERENCES properties(id) ON DELETE CASCADE,
  job_number            TEXT,
  filing_number         TEXT,
  filing_status         TEXT,
  job_type              TEXT,
  work_type             TEXT,
  address               TEXT,
  permit_number         TEXT,
  filing_date           DATE,
  permit_issued_date    DATE,
  permit_expiration_date DATE,
  signoff_date          DATE,
  description           TEXT,
  source                TEXT NOT NULL CHECK (source IN ('open_data', 'dob_now_live', 'merged')),
  dataset               TEXT,         -- e.g. 'w9ak-ipjd'
  dataset_name          TEXT,         -- human-readable
  raw                   JSONB,
  first_seen_at         TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_filing UNIQUE (property_id, job_number, filing_number, source)
);

CREATE INDEX IF NOT EXISTS idx_filings_property    ON filings (property_id);
CREATE INDEX IF NOT EXISTS idx_filings_job_number  ON filings (job_number) WHERE job_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_filings_source      ON filings (source);
CREATE INDEX IF NOT EXISTS idx_filings_status      ON filings (filing_status);
CREATE INDEX IF NOT EXISTS idx_filings_dataset     ON filings (dataset);

-- ============================================================
-- search_filings (junction)
-- Links which filings appeared in which searches
-- ============================================================
CREATE TABLE IF NOT EXISTS search_filings (
  search_id  UUID NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  filing_id  UUID NOT NULL REFERENCES filings(id) ON DELETE CASCADE,
  PRIMARY KEY (search_id, filing_id)
);

CREATE INDEX IF NOT EXISTS idx_sf_search ON search_filings (search_id);
CREATE INDEX IF NOT EXISTS idx_sf_filing ON search_filings (filing_id);

-- ============================================================
-- source_logs
-- Detailed logs of each data source invocation
-- ============================================================
CREATE TABLE IF NOT EXISTS source_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  search_id   UUID REFERENCES searches(id) ON DELETE CASCADE,
  source      TEXT NOT NULL,            -- 'open_data' | 'dob_now_live'
  dataset     TEXT,                     -- dataset identifier if applicable
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'success', 'error', 'skipped')),
  records_found INTEGER DEFAULT 0,
  duration_ms INTEGER,
  error_message TEXT,
  request_url TEXT,
  screenshot_path TEXT,                 -- for Playwright logs
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_source_logs_search  ON source_logs (search_id);
CREATE INDEX IF NOT EXISTS idx_source_logs_source  ON source_logs (source);
CREATE INDEX IF NOT EXISTS idx_source_logs_status  ON source_logs (status);

-- ============================================================
-- Helper: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Views
-- ============================================================

-- Latest search per address
CREATE OR REPLACE VIEW v_recent_searches AS
SELECT DISTINCT ON (normalized_address)
  s.*,
  p.bin,
  p.bbl,
  p.zip_code
FROM searches s
LEFT JOIN properties p ON p.id = s.property_id
ORDER BY normalized_address, s.created_at DESC;

-- Filing summary per property
CREATE OR REPLACE VIEW v_property_filing_summary AS
SELECT
  p.id AS property_id,
  p.normalized_address,
  p.borough,
  COUNT(f.id)                        AS total_filings,
  COUNT(f.id) FILTER (WHERE f.source = 'open_data')     AS open_data_filings,
  COUNT(f.id) FILTER (WHERE f.source = 'dob_now_live')  AS live_filings,
  COUNT(f.id) FILTER (WHERE f.source = 'merged')        AS merged_filings,
  MAX(f.filing_date)                 AS latest_filing_date,
  COUNT(DISTINCT f.job_number)       AS unique_jobs
FROM properties p
LEFT JOIN filings f ON f.property_id = p.id
GROUP BY p.id, p.normalized_address, p.borough;

-- ============================================================
-- asbestos_acp7_records
-- Cached ACP7 project notification records from DEP Open Data
-- ============================================================
CREATE TABLE IF NOT EXISTS asbestos_acp7_records (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id           UUID REFERENCES properties(id) ON DELETE SET NULL,
  control_number        TEXT NOT NULL,             -- TRU field, e.g. "TRU2484MN25"
  status                TEXT,                      -- "Submitted" | "Closed" | "Postponed"
  start_date            DATE,
  end_date              DATE,
  house_no              TEXT,
  street_name           TEXT,
  borough               TEXT,
  zip_code              TEXT,
  bin                   TEXT,
  block                 TEXT,
  lot                   TEXT,
  bbl                   TEXT,
  facility_name         TEXT,
  facility_type         TEXT,                      -- "Residence" | "Commercial" | "Other"
  floor                 TEXT,
  section               TEXT,                      -- work area description
  entire_floor          TEXT,
  building_owner_name   TEXT,
  contractor_name       TEXT,
  air_monitor_name      TEXT,
  acm_type              TEXT,                      -- asbestos-containing material type
  acm_amount            TEXT,
  acm_unit              TEXT,                      -- "Square Feet" | "Linear Feet"
  abatement_type        TEXT,                      -- "Removal" | "Encapsulation"
  procedure_name        TEXT,                      -- "Tent" | "Exterior Foam" | "DEP Variance"
  street_activity       TEXT,
  latitude              NUMERIC(10,6),
  longitude             NUMERIC(10,6),
  community_board       TEXT,
  council_district      TEXT,
  census_tract          TEXT,
  nta                   TEXT,
  raw                   JSONB,
  fetched_at            TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_acp7_control_number UNIQUE (control_number)
);

CREATE INDEX IF NOT EXISTS idx_acp7_property    ON asbestos_acp7_records (property_id);
CREATE INDEX IF NOT EXISTS idx_acp7_bin         ON asbestos_acp7_records (bin) WHERE bin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_acp7_control     ON asbestos_acp7_records (control_number);
CREATE INDEX IF NOT EXISTS idx_acp7_status      ON asbestos_acp7_records (status);

-- ============================================================
-- asbestos_job_compliance
-- Per-job asbestos abatement compliance scraped from DOB NOW portal
-- ============================================================
CREATE TABLE IF NOT EXISTS asbestos_job_compliance (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_number               TEXT NOT NULL,
  compliance_status        TEXT NOT NULL,           -- REQUIRES_ABATEMENT | NOT_ASBESTOS_PROJECT | EXEMPT | UNKNOWN
  compliance_statement     TEXT,                    -- raw radio-button text from portal
  dep_control_number       TEXT,                    -- ACP-5 / TRU# / ACP-20/21 control number
  investigator_cert_number TEXT,
  scraped_at               TIMESTAMPTZ DEFAULT NOW(),
  raw                      JSONB,
  CONSTRAINT uq_job_asbestos UNIQUE (job_number)
);

CREATE INDEX IF NOT EXISTS idx_job_compliance_job    ON asbestos_job_compliance (job_number);
CREATE INDEX IF NOT EXISTS idx_job_compliance_dep    ON asbestos_job_compliance (dep_control_number) WHERE dep_control_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_compliance_status ON asbestos_job_compliance (compliance_status);
