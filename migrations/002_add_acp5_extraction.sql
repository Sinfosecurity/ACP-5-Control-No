-- ============================================================
-- Migration: Add ACP-5 Control Number and CAI Number extraction
-- Created: 2026-03-31
-- ============================================================

-- Add new columns to asbestos_job_compliance table
ALTER TABLE asbestos_job_compliance
ADD COLUMN IF NOT EXISTS acp5_control_number TEXT,
ADD COLUMN IF NOT EXISTS cai_number TEXT,
ADD COLUMN IF NOT EXISTS filing_number TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS borough TEXT,
ADD COLUMN IF NOT EXISTS bin TEXT,
ADD COLUMN IF NOT EXISTS block TEXT,
ADD COLUMN IF NOT EXISTS lot TEXT,
ADD COLUMN IF NOT EXISTS bbl TEXT,
ADD COLUMN IF NOT EXISTS proposed_work_summary TEXT,
ADD COLUMN IF NOT EXISTS asbestos_compliance_text TEXT,
ADD COLUMN IF NOT EXISTS source_url TEXT,
ADD COLUMN IF NOT EXISTS screenshot_path TEXT,
ADD COLUMN IF NOT EXISTS raw_html TEXT,
ADD COLUMN IF NOT EXISTS retrieval_status TEXT DEFAULT 'pending' CHECK (retrieval_status IN ('pending', 'success', 'partial', 'error', 'not_found')),
ADD COLUMN IF NOT EXISTS retrieval_error TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create indexes for the new fields
CREATE INDEX IF NOT EXISTS idx_job_compliance_acp5 ON asbestos_job_compliance (acp5_control_number) WHERE acp5_control_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_compliance_cai ON asbestos_job_compliance (cai_number) WHERE cai_number IS NOT EXISTS;
CREATE INDEX IF NOT EXISTS idx_job_compliance_retrieval_status ON asbestos_job_compliance (retrieval_status);

-- Create trigger for updated_at
CREATE TRIGGER trg_job_compliance_updated_at
  BEFORE UPDATE ON asbestos_job_compliance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Alternative: Create dedicated table for detailed ACP-5 extractions
-- This keeps the architecture flexible if we want to store multiple
-- extraction attempts or historical data
-- ============================================================
CREATE TABLE IF NOT EXISTS dob_acp5_extractions (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Address/Property identifiers
  house_number            TEXT NOT NULL,
  street_name             TEXT NOT NULL,
  borough                 TEXT NOT NULL,
  normalized_address      TEXT NOT NULL,
  bin                     TEXT,
  block                   TEXT,
  lot                     TEXT,
  bbl                     TEXT,
  
  -- Filing identifiers
  job_number              TEXT NOT NULL,
  filing_number           TEXT,
  
  -- ACP-5 extracted values (primary goal)
  acp5_control_number     TEXT,
  cai_number              TEXT,
  
  -- Additional compliance details
  asbestos_compliance_text TEXT,
  compliance_status       TEXT,              -- NOT_ASBESTOS_PROJECT | REQUIRES_ABATEMENT | EXEMPT
  investigator_cert_number TEXT,
  
  -- Job/filing metadata
  job_type                TEXT,
  work_type               TEXT,
  filing_status           TEXT,
  filing_date             DATE,
  proposed_work_summary   TEXT,
  
  -- Scraping metadata
  source_url              TEXT,
  screenshot_path         TEXT,
  raw_html                TEXT,
  raw_json                JSONB,
  
  -- Status tracking
  retrieval_status        TEXT NOT NULL DEFAULT 'pending' 
                            CHECK (retrieval_status IN ('pending', 'searching', 'extracting', 'success', 'partial', 'error', 'not_found')),
  retrieval_error         TEXT,
  retry_count             INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  extracted_at            TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT uq_dob_acp5_extraction UNIQUE (job_number, filing_number)
);

-- Indexes for lookups
CREATE INDEX IF NOT EXISTS idx_dob_acp5_address ON dob_acp5_extractions (normalized_address);
CREATE INDEX IF NOT EXISTS idx_dob_acp5_job ON dob_acp5_extractions (job_number);
CREATE INDEX IF NOT EXISTS idx_dob_acp5_control_number ON dob_acp5_extractions (acp5_control_number) WHERE acp5_control_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dob_acp5_cai ON dob_acp5_extractions (cai_number) WHERE cai_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dob_acp5_status ON dob_acp5_extractions (retrieval_status);
CREATE INDEX IF NOT EXISTS idx_dob_acp5_created ON dob_acp5_extractions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dob_acp5_borough ON dob_acp5_extractions (borough);

-- Auto-update trigger
CREATE TRIGGER trg_dob_acp5_updated_at
  BEFORE UPDATE ON dob_acp5_extractions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Comment the tables
COMMENT ON TABLE dob_acp5_extractions IS 'Stores ACP-5 Control Numbers and CAI numbers extracted from DOB NOW Portal Filing Details';
COMMENT ON COLUMN dob_acp5_extractions.acp5_control_number IS 'DEP ACP-5 Control Number from Asbestos Abatement Compliance section';
COMMENT ON COLUMN dob_acp5_extractions.cai_number IS 'CAI # from Asbestos Abatement Compliance section';
COMMENT ON COLUMN dob_acp5_extractions.retrieval_status IS 'Tracks extraction workflow: pending → searching → extracting → success/error';
