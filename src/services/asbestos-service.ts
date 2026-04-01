// ============================================================
// services/asbestos-service.ts — SERVER ONLY (Playwright scraper)
// ============================================================
// Asbestos abatement information via DOB NOW portal scraping:
//
// Playwright — DOB NOW portal job detail page
//    Navigate to a specific job number, open General Information →
//    Asbestos Abatement Compliance, extract compliance state and
//    ACP-5 Control Number from DOB.
//
// Note: This service previously used NYC Open Data (ACP7 dataset)
// but now exclusively retrieves ACP-5 control numbers directly from DOB.
// The ACP7 query functions remain available but are not actively used.
// ============================================================
'use server';

import type {
  AsbestosACP7Record,
  AsbestosComplianceStatus,
  AsbestosJobCompliance,
  AsbestosLookupResult,
  NormalizedAddress,
} from '@/types';
import { cleanString, withRetry, sleep } from '@/lib/utils';

const BASE_URL  = 'https://data.cityofnewyork.us/resource';
const APP_TOKEN = process.env.NYC_OPEN_DATA_APP_TOKEN ?? '';
const TIMEOUT   = parseInt(process.env.PLAYWRIGHT_TIMEOUT ?? '30000', 10);
const HEADLESS  = process.env.PLAYWRIGHT_HEADLESS !== 'false';

// ============================================================
// Part 1: ACP7 Open Data query
// Dataset: vq35-j9qm — DEP Asbestos Control Program ACP7
// ============================================================

interface ACP7Row {
  tru:                string;  // Control Number — e.g. "TRU2484MN25"
  start_date:         string;
  end_date:           string;
  status_description: string;
  street_activity:    string;
  premise_no:         string;
  street_name:        string;
  borough:            string;
  zip_code:           string;
  facility_aka:       string;
  facility_type:      string;
  bin:                string;
  block:              string;
  lot:                string;
  cross_street_on:    string;
  cross_street_between: string;
  cross_street_and:   string;
  building_owner_name: string;
  contractor_name:    string;
  air_monitor_name:   string;
  entire_floor:       string;
  floor:              string;
  section:            string;
  acm_type:           string;
  acm_amount:         string;
  acm_unit:           string;
  abatement_type:     string;
  procedure_name:     string;
  latitude:           string;
  longitude:          string;
  community_board:    string;
  council_district:   string;
  census_tract:       string;
  bbl:                string;
  nta:                string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

function mapACP7Row(r: ACP7Row): AsbestosACP7Record {
  return {
    controlNumber:    cleanString(r.tru)                ?? '',
    status:           cleanString(r.status_description) ?? '',
    startDate:        cleanString(r.start_date),
    endDate:          cleanString(r.end_date),
    houseNo:          cleanString(r.premise_no),
    streetName:       cleanString(r.street_name),
    borough:          cleanString(r.borough),
    zipCode:          cleanString(r.zip_code),
    bin:              cleanString(r.bin),
    block:            cleanString(r.block),
    lot:              cleanString(r.lot),
    bbl:              cleanString(r.bbl),
    facilityName:     cleanString(r.facility_aka),
    facilityType:     cleanString(r.facility_type),
    floor:            cleanString(r.floor),
    section:          cleanString(r.section),
    entireFloor:      cleanString(r.entire_floor),
    buildingOwnerName: cleanString(r.building_owner_name),
    contractorName:   cleanString(r.contractor_name),
    airMonitorName:   cleanString(r.air_monitor_name),
    acmType:          cleanString(r.acm_type),
    acmAmount:        cleanString(r.acm_amount),
    acmUnit:          cleanString(r.acm_unit),
    abatementType:    cleanString(r.abatement_type),
    procedureName:    cleanString(r.procedure_name),
    streetActivity:   cleanString(r.street_activity),
    latitude:         cleanString(r.latitude),
    longitude:        cleanString(r.longitude),
    communityBoard:   cleanString(r.community_board),
    councilDistrict:  cleanString(r.council_district),
    censusTract:      cleanString(r.census_tract),
    nta:              cleanString(r.nta),
    raw: r as Record<string, unknown>,
  };
}

async function socrataACP7<T>(where: string, limit = 200): Promise<T[]> {
  const url = new URL(`${BASE_URL}/vq35-j9qm.json`);
  url.searchParams.set('$where', where);
  url.searchParams.set('$limit', String(limit));
  url.searchParams.set('$order', 'start_date DESC');

  const headers: HeadersInit = { Accept: 'application/json' };
  if (APP_TOKEN) headers['X-App-Token'] = APP_TOKEN;

  const res = await withRetry(async () => {
    const r = await fetch(url.toString(), { headers, next: { revalidate: 300 } });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`ACP7 Socrata HTTP ${r.status}: ${body.slice(0, 200)}`);
    }
    return r;
  }, { retries: 2, baseDelayMs: 600 });

  return res.json() as Promise<T[]>;
}

/** Query ACP7 by property address */
export async function queryACP7ByAddress(
  addr: NormalizedAddress
): Promise<AsbestosACP7Record[]> {
  const esc = (s: string) => s.replace(/'/g, "''");
  const where =
    `UPPER(premise_no)='${esc(addr.houseNumber)}' AND ` +
    `UPPER(street_name) LIKE '${esc(addr.streetName)}%' AND ` +
    `UPPER(borough)='${esc(addr.borough)}'`;

  const rows = await socrataACP7<ACP7Row>(where);
  return rows.map(mapACP7Row);
}

/** Query ACP7 by BIN — faster and more precise than address */
export async function queryACP7ByBin(bin: string): Promise<AsbestosACP7Record[]> {
  const where = `bin='${bin.replace(/'/g, "''")}'`;
  const rows  = await socrataACP7<ACP7Row>(where);
  return rows.map(mapACP7Row);
}

/** Query ACP7 by Control Number (TRU###) */
export async function queryACP7ByControlNumber(
  controlNumber: string
): Promise<AsbestosACP7Record | null> {
  const where = `UPPER(tru)='${controlNumber.toUpperCase().replace(/'/g, "''")}'`;
  const rows  = await socrataACP7<ACP7Row>(where, 1);
  return rows.length > 0 ? mapACP7Row(rows[0]) : null;
}

// ============================================================
// Part 2: DOB NOW portal Playwright scraper — job detail asbestos section
//
// Flow:
//   1. Go to DOB NOW public portal
//   2. Select "Job Filing" search mode
//   3. Enter job number
//   4. Click Search
//   5. Click "View" on the result row
//   6. Expand "General Information" section
//   7. Expand "Asbestos Abatement Compliance" section
//   8. Extract:
//      - compliance status (radio button selection text)
//      - DEP control number (ACP-5 / TRU / ACP-20/21)
//      - Investigator certificate number (when ACP-5)
// ============================================================

function classifyComplianceText(text: string): AsbestosComplianceStatus {
  const t = text.toUpperCase();
  if (t.includes('REQUIRES') || t.includes('ABATEMENT') && t.includes('RELATED')) {
    return 'REQUIRES_ABATEMENT';
  }
  if (t.includes('NOT AN ASBESTOS') || t.includes('NOT A ASBESTOS') || t.includes('ACP-5')) {
    return 'NOT_ASBESTOS_PROJECT';
  }
  if (t.includes('EXEMPT')) {
    return 'EXEMPT';
  }
  return 'UNKNOWN';
}

export async function scrapeJobAsbestosDetails(
  jobNumber: string
): Promise<AsbestosJobCompliance> {
  const start = Date.now();

  let chromium: import('playwright').BrowserType;
  try {
    const pw = await import('playwright');
    chromium  = pw.chromium;
  } catch (err) {
    throw new Error(`Playwright unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    // ---- Step 1: Load portal ----
    await page.goto('https://a810-dobnow.nyc.gov/publish/Index.html#!/', {
      waitUntil: 'networkidle',
      timeout: TIMEOUT,
    });
    await sleep(1500);

    // ---- Step 2: Select "Job Filing" search tab ----
    const jobTabSelectors = [
      'a:has-text("Job Filing")',
      'li:has-text("Job Filing")',
      '[ng-click*="jobFiling" i]',
      '.nav-tabs a:nth-child(2)',
      'button:has-text("Job")',
    ];
    for (const sel of jobTabSelectors) {
      try {
        const el = await page.$(sel);
        if (el) { await el.click(); break; }
      } catch { continue; }
    }
    await sleep(800);

    // ---- Step 3: Enter job number ----
    const jobInputSelectors = [
      'input[placeholder*="Job" i]',
      'input[name*="job" i]',
      'input[id*="job" i]',
      '#jobNum',
      '.job-number input',
      'input[type="text"]:first-of-type',
    ];
    let filled = false;
    for (const sel of jobInputSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.fill(jobNumber.trim().toUpperCase());
          filled = true;
          break;
        }
      } catch { continue; }
    }
    if (!filled) throw new Error('Could not find job number input field');

    // ---- Step 4: Submit search ----
    const submitSelectors = [
      'button[type="submit"]',
      'button:has-text("Search")',
      '[ng-click*="search" i]',
      '.search-btn',
      'button.btn-primary',
    ];
    let submitted = false;
    for (const sel of submitSelectors) {
      try {
        const el = await page.$(sel);
        if (el) { await el.click(); submitted = true; break; }
      } catch { continue; }
    }
    if (!submitted) {
      for (const sel of jobInputSelectors) {
        try { await page.press(sel, 'Enter'); submitted = true; break; }
        catch { continue; }
      }
    }
    if (!submitted) throw new Error('Could not submit job number search');

    // ---- Step 5: Wait for results and click "View" ----
    await Promise.race([
      page.waitForSelector('table tbody tr, .result-row, [ng-repeat]', { timeout: TIMEOUT }),
      sleep(TIMEOUT),
    ]).catch(() => null);
    await sleep(1500);

    // Try clicking a "View" button / link in the results
    const viewSelectors = [
      'a:has-text("View")',
      'button:has-text("View")',
      '[ng-click*="view" i]',
      '.view-btn',
      'a.btn:has-text("View")',
      'td a:first-child',
    ];
    let viewed = false;
    for (const sel of viewSelectors) {
      try {
        const el = await page.$(sel);
        if (el) { await el.click(); viewed = true; break; }
      } catch { continue; }
    }
    if (!viewed) {
      // Fallback: click the first result row
      try {
        await page.click('table tbody tr:first-child');
        viewed = true;
      } catch { /* ignore */ }
    }

    await sleep(2000);

    // ---- Step 6: Expand "General Information" accordion ----
    const genInfoSelectors = [
      '[ng-click*="general" i]',
      'h3:has-text("General Information")',
      '.accordion-toggle:has-text("General")',
      '[data-target*="general" i]',
      'a:has-text("General Information")',
      '.panel-heading:has-text("General")',
    ];
    for (const sel of genInfoSelectors) {
      try {
        const el = await page.$(sel);
        if (el) { await el.click(); break; }
      } catch { continue; }
    }
    await sleep(1000);

    // ---- Step 7: Expand "Asbestos Abatement Compliance" accordion ----
    const asbestosSelectors = [
      '[ng-click*="asbestos" i]',
      'h3:has-text("Asbestos")',
      '.accordion-toggle:has-text("Asbestos")',
      '[data-target*="asbestos" i]',
      'a:has-text("Asbestos")',
      '.panel-heading:has-text("Asbestos")',
      'div:has-text("Asbestos Abatement")',
    ];
    for (const sel of asbestosSelectors) {
      try {
        const el = await page.$(sel);
        if (el) { await el.click(); break; }
      } catch { continue; }
    }
    await sleep(1200);

    // ---- Step 8: Extract all asbestos fields ----
    const extracted = await page.evaluate(() => {
      const result: Record<string, string> = {};

      // Try to find the asbestos compliance section container
      const asbestosSection = (() => {
        const allText = document.querySelectorAll('*');
        for (const el of Array.from(allText)) {
          const text = el.textContent?.trim() ?? '';
          if (text.includes('Asbestos Abatement') && el.children.length > 0) {
            return el;
          }
        }
        return document.body;
      })();

      // Extract the selected radio button text (compliance status)
      const radioLabels = asbestosSection.querySelectorAll('input[type="radio"]:checked + label, .radio.selected label, [class*="selected"] label, [class*="active"] label');
      if (radioLabels.length > 0) {
        result.complianceStatement = radioLabels[0].textContent?.trim() ?? '';
      }

      // Fallback: look for pre-filled text in the section
      if (!result.complianceStatement) {
        const paragraphs = asbestosSection.querySelectorAll('p, span, div');
        for (const p of Array.from(paragraphs)) {
          const t = p.textContent?.trim() ?? '';
          if (
            t.includes('scope of work') ||
            t.includes('asbestos project') ||
            t.includes('exempt')
          ) {
            result.complianceStatement = t.substring(0, 300);
            break;
          }
        }
      }

      // Look for DEP control number field
      const allInputs = document.querySelectorAll('input[type="text"], input:not([type])');
      for (const input of Array.from(allInputs) as HTMLInputElement[]) {
        const label = (
          input.labels?.[0]?.textContent ??
          input.placeholder ??
          input.closest('[class*="form-group"]')?.querySelector('label')?.textContent ??
          ''
        ).toUpperCase();

        const val = input.value?.trim();
        if (!val) continue;

        if (label.includes('CONTROL') || label.includes('ACP') || label.includes('TRU')) {
          result.depControlNumber = val;
        }
        if (label.includes('CERTIFICATE') || label.includes('INVESTIGATOR')) {
          result.investigatorCertNumber = val;
        }
      }

      // Also look for span/div fields (read-only view)
      const allLabels = document.querySelectorAll('label, .field-label, .control-label, dt');
      for (const lbl of Array.from(allLabels)) {
        const labelText = (lbl.textContent ?? '').toUpperCase().trim();
        const sibling   =
          lbl.nextElementSibling?.textContent?.trim() ??
          lbl.closest('.form-group, .field-row, .row')
            ?.querySelector('span, div:not(label), p, .field-value')
            ?.textContent?.trim() ?? '';

        if (!sibling) continue;

        if (
          labelText.includes('CONTROL') ||
          labelText.includes('ACP-5') ||
          labelText.includes('ACP5') ||
          labelText.includes('TRU')
        ) {
          result.depControlNumber = result.depControlNumber ?? sibling;
        }
        if (labelText.includes('CERTIFICATE') || labelText.includes('INVESTIGATOR')) {
          result.investigatorCertNumber = result.investigatorCertNumber ?? sibling;
        }
      }

      return result;
    });

    const complianceStatus = classifyComplianceText(
      extracted.complianceStatement ?? ''
    );

    return {
      jobNumber:           jobNumber.trim().toUpperCase(),
      complianceStatus,
      complianceStatement: extracted.complianceStatement ?? '',
      depControlNumber:    cleanString(extracted.depControlNumber),
      investigatorCertNumber: cleanString(extracted.investigatorCertNumber),
      source:              'dob_now_portal' as const,
      scrapedAt:           new Date().toISOString(),
      raw:                 extracted,
    };

  } finally {
    await browser.close();
  }
}

// ============================================================
// Orchestrator: DOB NOW portal scrape for ACP-5 control numbers
// ============================================================
export async function lookupAsbestosForJob(params: {
  jobNumber:  string;
  bin?:       string;
  addr?:      NormalizedAddress;
  scrapePortal?: boolean;
}): Promise<AsbestosLookupResult> {
  const t0 = Date.now();
  const { jobNumber, scrapePortal = true } = params;

  // Run DOB NOW portal scrape to get ACP-5 control number
  let jobCompliance: AsbestosJobCompliance | undefined;
  let error: string | undefined;

  if (scrapePortal) {
    try {
      jobCompliance = await scrapeJobAsbestosDetails(jobNumber);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      console.error('[asbestos] Portal scrape error:', error);
    }
  }

  return {
    jobNumber:  jobNumber.trim().toUpperCase(),
    jobCompliance,
    acp7Records: [], // No longer using ACP7 Open Data
    durationMs: Date.now() - t0,
    error,
  };
}
