// ============================================================
// services/playwright-scraper.ts
// DOB NOW Public Portal scraper — SERVER ONLY
// Uses Playwright to extract live filing data as a fallback/verification
// ============================================================
'use server';

import type { FilingRecord, NormalizedAddress, SourceLog } from '@/types';
import { BOROUGH_TO_CODE } from '@/lib/address-normalizer';
import { cleanString, sleep } from '@/lib/utils';
import path from 'path';
import fs from 'fs';

const DOB_NOW_URL = 'https://a810-dobnow.nyc.gov/publish/Index.html#!/';
const TIMEOUT     = parseInt(process.env.PLAYWRIGHT_TIMEOUT ?? '30000', 10);
const HEADLESS    = process.env.PLAYWRIGHT_HEADLESS !== 'false';
const USE_MOCK_DATA = process.env.USE_MOCK_SCRAPER === 'true'; // Fast mock mode for development
const SCREENSHOT_DIR = path.resolve(
  process.cwd(),
  process.env.PLAYWRIGHT_SCREENSHOT_DIR ?? './tmp/screenshots'
);

// -----------------------------------------------------------------------
// Screenshot helper
// -----------------------------------------------------------------------
async function saveScreenshot(
  page: import('playwright').Page,
  label: string
): Promise<string | undefined> {
  try {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const timestamp = Date.now();
    const filePath  = path.join(SCREENSHOT_DIR, `${label}-${timestamp}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    console.log(`[playwright] Screenshot saved: ${filePath}`);
    return filePath;
  } catch (err) {
    console.warn('[playwright] Failed to save screenshot:', err);
    return undefined;
  }
}

// -----------------------------------------------------------------------
// Retry helper for unreliable network calls
// -----------------------------------------------------------------------
async function retryAsync<T>(
  fn: () => Promise<T>,
  retries: number = 2,
  delayMs: number = 2000
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`[playwright] Retry ${attempt + 1}/${retries} after error:`, 
        err instanceof Error ? err.message : String(err));
      await sleep(delayMs * (attempt + 1)); // Exponential backoff
    }
  }
  throw new Error('Retry exhausted');
}

// -----------------------------------------------------------------------
// Extract ACP-5 control numbers from job detail popup
// -----------------------------------------------------------------------
async function extractAcpControlNumbers(
  page: import('playwright').Page,
  jobNumber: string
): Promise<{ acp5?: string; cai?: string }> {
  try {
    console.log(`[playwright] Extracting ACP numbers for job ${jobNumber}...`);
    
    // Look for "Asbestos Abatement Compliance" section
    const asbestosSection = await page.locator('text=/Asbestos.*Compliance/i').first();
    
    if (await asbestosSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Scroll the section into view within the popup
      await asbestosSection.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => null);
      await sleep(500);
      
      // Extract the entire section text
      const sectionText = await page.evaluate(() => {
        const headers = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, .section-header, div[class*="header"]'));
        const asbestosHeader = headers.find(h => 
          h.textContent?.toLowerCase().includes('asbestos') && 
          h.textContent?.toLowerCase().includes('compliance')
        );
        
        if (!asbestosHeader) return '';
        
        // Get all following siblings until next section header
        let currentElement = asbestosHeader.nextElementSibling;
        let sectionContent = '';
        
        while (currentElement) {
          // Stop if we hit another major section header
          const tagName = currentElement.tagName.toLowerCase();
          if (['h1', 'h2', 'h3', 'h4'].includes(tagName)) break;
          
          sectionContent += currentElement.textContent + '\n';
          currentElement = currentElement.nextElementSibling;
        }
        
        return sectionContent;
      });
      
      // Parse ACP-5 Control Number
      const acp5Match = sectionText.match(/ACP[-\s]?5\s+Control\s+No\.?\s*[:\s]*(\S+)/i) ||
                        sectionText.match(/DEP\s+ACP[-\s]?5\s+Control\s+No\.?\s*[:\s]*(\S+)/i);
      
      // Parse CAI Number
      const caiMatch = sectionText.match(/CAI\s*#?\s*[:\s]*(\S+)/i);
      
      const result = {
        acp5: acp5Match?.[1]?.trim(),
        cai: caiMatch?.[1]?.trim(),
      };
      
      if (result.acp5 || result.cai) {
        console.log(`[playwright] Found ACP numbers for ${jobNumber}:`, result);
      }
      
      return result;
    }
    
    return {};
  } catch (err) {
    console.warn(`[playwright] Failed to extract ACP for ${jobNumber}:`, err);
    return {};
  }
}

// -----------------------------------------------------------------------
// Click job detail view button and extract ACP numbers
// -----------------------------------------------------------------------
async function enrichWithAcpNumbers(
  page: import('playwright').Page,
  records: FilingRecord[]
): Promise<FilingRecord[]> {
  const enriched: FilingRecord[] = [];
  
  // Limit to first 10 jobs to avoid excessive scraping time
  const recordsToEnrich = records.slice(0, 10);
  
  for (let i = 0; i < recordsToEnrich.length; i++) {
    const record = recordsToEnrich[i];
    
    try {
      // Find the view/detail button for this job
      // The table row should have a clickable icon in the first column
      const viewButton = await page.locator(`
        tbody tr:has-text("${record.jobNumber}") a[title*="View" i],
        tbody tr:has-text("${record.jobNumber}") button[title*="View" i],
        tbody tr:has-text("${record.jobNumber}") .view-icon,
        tbody tr:has-text("${record.jobNumber}") td:first-child a,
        tbody tr:has-text("${record.jobNumber}") td:first-child [class*="icon"]
      `).first();
      
      if (await viewButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await viewButton.click();
        console.log(`[playwright] Clicked view button for ${record.jobNumber}`);
        
        // Wait for popup to appear
        await page.waitForSelector('.modal, [role="dialog"], .popup, [class*="detail"]', { 
          timeout: 5000,
          state: 'visible' 
        }).catch(() => null);
        
        await sleep(1000);
        
        // Extract ACP numbers from the popup
        const acpData = await extractAcpControlNumbers(page, record.jobNumber || 'unknown');
        
        // Add ACP numbers to the record
        const acpNumbers: string[] = [];
        if (acpData.acp5) acpNumbers.push(acpData.acp5);
        
        enriched.push({
          ...record,
          acpControlNumbers: acpNumbers.length > 0 ? acpNumbers : undefined,
          caiNumber: acpData.cai,
          raw: {
            ...record.raw,
            acp5_control_number: acpData.acp5,
            cai_number: acpData.cai,
          },
        });
        
        // Close the popup
        const closeButton = await page.locator('button:has-text("Close"), button.close, button[aria-label*="Close" i], .modal-header button, [class*="close"]').first();
        if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await closeButton.click();
          await sleep(500);
        } else {
          // Try pressing Escape
          await page.keyboard.press('Escape');
          await sleep(500);
        }
      } else {
        // No view button found, add record as-is
        enriched.push(record);
      }
    } catch (err) {
      console.warn(`[playwright] Failed to enrich ${record.jobNumber}:`, err);
      // Add record as-is on error
      enriched.push(record);
    }
  }
  
  // Add remaining records without enrichment
  enriched.push(...records.slice(recordsToEnrich.length));
  
  return enriched;
}

// -----------------------------------------------------------------------
// Extract filing rows from the DOB NOW results table
// The portal renders a SPA — selectors may need updates if DOB changes HTML
// -----------------------------------------------------------------------
async function extractFilingRows(
  page: import('playwright').Page
): Promise<FilingRecord[]> {
  // Wait for results section to appear
  await page.waitForSelector(
    '.job-filings-table, table[class*="filing"], .ng-scope table, .dob-table',
    { timeout: TIMEOUT, state: 'visible' }
  ).catch(() => null);

  // DOB NOW portal uses AngularJS — give it time to render
  await sleep(2000);

  // Try multiple table selector strategies for resilience
  const tableSelectors = [
    'table',
    '.container table',
    '[ng-controller] table',
    '.job-filings table',
  ];

  let rows: FilingRecord[] = [];

  for (const selector of tableSelectors) {
    try {
      const tables = await page.$$(selector);
      if (tables.length === 0) continue;

      // Look for the "BUILD: Job Filings" section
      // The portal groups results by category
      for (const table of tables) {
        const headerText = await table.evaluate(el => {
          // Check nearby heading elements
          const preceding = el.previousElementSibling;
          const parent    = el.parentElement;
          const heading   = preceding?.textContent ?? parent?.querySelector('h2,h3,h4,h5')?.textContent ?? '';
          return heading.toUpperCase();
        });

        // Prefer the BUILD section; fall back to any table with job number column
        const headers = await table.$$eval('th', ths =>
          ths.map(th => th.textContent?.trim().toUpperCase() ?? '')
        );

        const hasJobNumber = headers.some(h =>
          h.includes('JOB') || h.includes('FILING') || h.includes('NUMBER')
        );

        if (!hasJobNumber && !headerText.includes('BUILD') && !headerText.includes('JOB')) {
          continue;
        }

        const extracted = await table.evaluate(tableEl => {
          const headerCells = Array.from(tableEl.querySelectorAll('thead th, thead td'));
          const headerLabels = headerCells.map(th => th.textContent?.trim() ?? '');

          const bodyRows = Array.from(tableEl.querySelectorAll('tbody tr'));

          return bodyRows.map(tr => {
            const cells = Array.from(tr.querySelectorAll('td'));
            const rowData: Record<string, string> = {};
            cells.forEach((td, i) => {
              const label = headerLabels[i] ?? `col_${i}`;
              rowData[label] = td.textContent?.trim() ?? '';
            });
            return rowData;
          }).filter(r => Object.values(r).some(v => v.length > 0));
        });

        if (extracted.length > 0) {
          rows = extracted.map(r => mapDobNowRowToFiling(r));
          break;
        }
      }

      if (rows.length > 0) break;
    } catch {
      continue;
    }
  }

  return rows;
}

// -----------------------------------------------------------------------
// Map a raw DOB NOW portal row to a FilingRecord
// Column names vary; try multiple possible header labels
// -----------------------------------------------------------------------
function mapDobNowRowToFiling(row: Record<string, string>): FilingRecord {
  const get = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const match = Object.entries(row).find(
        ([key]) => key.toUpperCase().includes(k.toUpperCase())
      );
      if (match?.[1]) return cleanString(match[1]);
    }
    return undefined;
  };

  return {
    source:       'dob_now_live',
    dataset:      'dob_now_portal',
    datasetName:  'DOB NOW Live Portal',
    jobNumber:    get('JOB #', 'JOB NUMBER', 'JOB NO'),
    filingNumber: get('DOC #', 'FILING #', 'FILING NUMBER', 'DOC NO'),
    filingStatus: get('STATUS', 'JOB STATUS', 'FILING STATUS'),
    jobType:      get('JOB TYPE', 'TYPE'),
    workType:     get('WORK TYPE'),
    address:      get('ADDRESS', 'HOUSE'),
    description:  get('DESCRIPTION', 'JOB DESC'),
    filingDate:   get('DATE FILED', 'FILING DATE', 'FILED'),
    raw:          row as Record<string, unknown>,
  };
}

// -----------------------------------------------------------------------
// Main scraper function
// -----------------------------------------------------------------------
export async function scrapeDobnowPortal(
  addr: NormalizedAddress
): Promise<{ records: FilingRecord[]; log: SourceLog }> {
  const start = Date.now();
  
  // Fast mock mode for testing/development - returns sample data instantly
  if (USE_MOCK_DATA) {
    console.log('[playwright] Using MOCK mode - returning sample data');
    await sleep(500); // Simulate minimal delay
    
    return {
      records: [
        {
          id: 'B01327203-I1',
          source: 'dob_now_live',
          jobNumber: 'B01327203',
          filingNumber: 'I1',
          filingStatus: 'Signed off',
          jobType: 'LAA',
          workType: 'Limited Alteration Application',
          address: addr.normalizedString,
          filingDate: '2016-01-15',
          description: 'Limited Alteration Application - Asbestos Abatement',
          acpControlNumbers: ['31273241'],
          caiNumber: '120831',
          asbestosStatus: 'Not an asbestos project - ACP-5',
          bin: '3112345',
          bbl: '3014560025',
        },
        {
          id: 'B01327203-NB',
          source: 'dob_now_live',
          jobNumber: 'B01327203',
          filingNumber: 'NB',
          filingStatus: 'Approved',
          jobType: 'NB',
          workType: 'New Building',
          address: addr.normalizedString,
          filingDate: '2015-12-01',
          description: 'New Building Construction',
          bin: '3112345',
          bbl: '3014560025',
        },
      ],
      log: {
        source: 'dob_now_live',
        dataset: 'mock_data',
        status: 'success',
        recordsFound: 2,
        durationMs: Date.now() - start,
        metadata: {
          url: 'MOCK_MODE',
          note: 'Mock data enabled - set USE_MOCK_SCRAPER=false to use real scraping',
        },
      },
    };
  }
  
  let screenshotPath: string | undefined;

  // Dynamic import — Playwright must only run on the server
  let firefox: import('playwright').BrowserType;
  try {
    const pw = await import('playwright');
    firefox = pw.firefox; // Try Firefox instead of Chromium
  } catch (err) {
    const error = `Playwright not available: ${err instanceof Error ? err.message : String(err)}`;
    console.error('[playwright]', error);
    return {
      records: [],
      log: {
        source: 'dob_now_live',
        status: 'error',
        recordsFound: 0,
        durationMs: Date.now() - start,
        errorMessage: error,
      },
    };
  }

  const browser = await firefox.launch({
    headless: HEADLESS,
    args: [],  // Firefox doesn't need the same flags
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();

  // Collect console errors for debugging
  const pageErrors: string[] = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  try {
    console.log('[playwright] Navigating to DOB NOW portal with Firefox...');
    
    // Retry navigation up to 2 times due to portal instability
    await retryAsync(async () => {
      console.log('[playwright] Attempting navigation...');
      await page.goto(DOB_NOW_URL, { 
        waitUntil: 'load',  // Wait for page load event
        timeout: TIMEOUT 
      });
      console.log('[playwright] Page loaded successfully');
    });
    
    console.log('[playwright] Waiting for page to initialize...');
    await sleep(5000);  // Give AngularJS plenty of time to initialize

    screenshotPath = await saveScreenshot(page, 'dob-now-loaded');

    // Close any login/modal dialogs that might be blocking the form
    // The DOB NOW portal shows a login modal that blocks the address search form
    try {
      console.log('[playwright] Attempting to close login modal...');
      
      // Wait for modal to appear (if it exists)
      await sleep(2000);
      
      // Try clicking "No Thanks" or similar dismiss buttons first
      const dismissButtons = [
        'button:has-text("No Thanks")',
        'button:has-text("Not Now")',
        'button:has-text("Maybe Later")',
        'button:has-text("Skip")',
        'button:has-text("Continue without")',
        'a:has-text("Continue as Guest")',
        'button[aria-label="Close"]',
        'button.close',
        '.modal-footer button:last-child',
        '.modal-footer button.btn-secondary',
      ];
      
      for (const selector of dismissButtons) {
        const btn = await page.$(selector);
        if (btn && await btn.isVisible().catch(() => false)) {
          await btn.click();
          console.log(`[playwright] Closed modal via: ${selector}`);
          await sleep(1500);
          break;
        }
      }
      
      // Press Escape multiple times as backup
      await page.keyboard.press('Escape');
      await sleep(500);
      await page.keyboard.press('Escape');
      await sleep(500);
      console.log('[playwright] Pressed Escape to close modal');
      
      // Click outside the modal to dismiss it
      await page.mouse.click(50, 50);
      await sleep(1000);
      
    } catch (err) {
      console.log('[playwright] Failed to close modal:', err instanceof Error ? err.message : String(err));
    }

    // ---------------------------------------------------------------
    // Navigate to Address search tab
    // The portal has multiple search modes; we want "Address"
    // ---------------------------------------------------------------
    
    // Wait for page to be interactive and modal to be gone
    await page.waitForLoadState('networkidle').catch(() => null);
    await sleep(1000);
    
    // Verify modal is closed by checking if address form is accessible
    const modalGone = await page.evaluate(() => {
      // Check if there's a visible modal backdrop
      const backdrop = document.querySelector('.modal-backdrop, .overlay, [class*="backdrop"]');
      if (backdrop && window.getComputedStyle(backdrop).display !== 'none') {
        return false;
      }
      // Check if address search is visible
      const addressField = document.querySelector('textarea[name*="address" i], textarea.form-control');
      return addressField !== null;
    });
    
    if (!modalGone) {
      console.log('[playwright] Modal still present, trying force close...');
      // Force remove modal backdrop
      await page.evaluate(() => {
        document.querySelectorAll('.modal-backdrop, .overlay, [class*="backdrop"], .modal').forEach(el => {
          (el as HTMLElement).style.display = 'none';
          el.remove();
        });
        // Also remove any overlay classes from body
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
      });
      await sleep(1000);
    }
    
    const addressTabSelectors = [
      'a[href*="address"]',
      'li[title*="Address"]',
      'button:has-text("Address")',
      '[ng-click*="address" i]',
      '.nav-tabs a:has-text("Address")',
      'a.nav-link:has-text("Address")',
    ];

    let tabClicked = false;
    for (const sel of addressTabSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          // Scroll the tab into view
          await el.scrollIntoViewIfNeeded();
          await sleep(500);
          await el.click();
          tabClicked = true;
          console.log(`[playwright] Clicked address tab via: ${sel}`);
          await sleep(2000); // Wait for tab content to load
          break;
        }
      } catch { continue; }
    }

    if (!tabClicked) {
      console.warn('[playwright] Could not find address tab — trying to proceed anyway');
    }

    // Scroll down to make sure the address form is visible
    await page.evaluate(() => {
      window.scrollTo(0, 300);
    });
    await sleep(2000);
    
    screenshotPath = await saveScreenshot(page, 'dob-now-address-tab');

    // ---------------------------------------------------------------
    // Fill the search form
    // ---------------------------------------------------------------

    // Wait for the Address search section to be visible
    await page.waitForSelector('text=Search the Public Portal', { timeout: 10000, state: 'visible' }).catch(() => null);
    await sleep(1000);

    // The portal uses a text field for the address  - could be input or textarea
    // Build the full address string
    const fullAddress = `${addr.houseNumber} ${addr.streetName}, ${addr.borough}`;
    console.log('[playwright] Looking for address field...');
    
    const addressFieldSelectors = [
      'input[placeholder*="Address" i]',
      'input[name*="address" i]',
      'textarea[name*="address" i]',
      'input.form-control:visible',
      'input[type="text"]:near(:text("Address"))',
      'textarea:near(:text("Address"))',
      'textarea[placeholder*="address" i]',
      '#address',
      'textarea.form-control',
      // Try selecting the visible input in the Address panel
      '.ng-scope input[type="text"]:visible',
    ];
    
    let addressFilled = false;
    for (const sel of addressFieldSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000, state: 'visible' }).catch(() => null);
        const el = await page.$(sel);
        if (el && await el.isVisible().catch(() => false)) {
          await el.scrollIntoViewIfNeeded();
          await sleep(300);
          await el.click({ clickCount: 3 }); // Triple-click to select all
          await sleep(200);
          await el.fill(fullAddress);
          addressFilled = true;
          console.log(`[playwright] Filled address via: ${sel} with "${fullAddress}"`);
          await sleep(500);
          break;
        }
      } catch (err) {
        console.log(`[playwright] Failed with ${sel}:`, err instanceof Error ? err.message : String(err));
        continue;
      }
    }

    if (!addressFilled) {
      // Save screenshot for debugging
      await saveScreenshot(page, 'dob-now-form-fill-failed');
      
      // Log available input fields for debugging
      const allInputs = await page.$$eval('input, textarea, select', elements => 
        elements.map(el => ({
          tag: el.tagName,
          type: (el as HTMLInputElement).type,
          name: (el as HTMLInputElement).name,
          id: el.id,
          placeholder: (el as HTMLInputElement).placeholder,
          visible: el instanceof HTMLElement ? el.offsetParent !== null : false
        }))
      );
      console.log('[playwright] Available form fields:', JSON.stringify(allInputs, null, 2));
      
      throw new Error('Could not fill address field');
    }

    screenshotPath = await saveScreenshot(page, 'dob-now-form-filled');

    // ---------------------------------------------------------------
    // Submit the search
    // ---------------------------------------------------------------
    const searchButtonSelectors = [
      'button:has-text("Search")',
      'input[type="submit"]',
      'button[type="submit"]',
      '[ng-click*="search" i]',
      '.search-btn',
      'button.btn-primary',
      'button:near(textarea[name*="address"])',
    ];

    let searchClicked = false;
    for (const sel of searchButtonSelectors) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible().catch(() => false)) {
          await el.scrollIntoViewIfNeeded();
          await sleep(300);
          await el.click();
          searchClicked = true;
          console.log(`[playwright] Clicked search via: ${sel}`);
          break;
        }
      } catch { continue; }
    }

    if (!searchClicked) {
      // Try pressing Enter in the address field
      console.log('[playwright] Trying Enter key as fallback...');
      await page.keyboard.press('Enter');
      searchClicked = true;
    }

    if (!searchClicked) throw new Error('Could not trigger search submission');

    // ---------------------------------------------------------------
    // Wait for results
    // ---------------------------------------------------------------
    await Promise.race([
      page.waitForSelector('.job-filings-table, table tbody tr', { timeout: TIMEOUT }),
      page.waitForSelector('.no-results, .ng-hide:not(.ng-hide)', { timeout: TIMEOUT }),
      sleep(TIMEOUT),
    ]).catch(() => null);

    await sleep(2000); // let AngularJS render

    // Scroll to BUILD section if it exists
    await page.evaluate(() => {
      const elements = document.querySelectorAll('h2, h3, h4, h5, .section-header');
      for (const el of elements) {
        if (el.textContent?.toUpperCase().includes('BUILD')) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }
      window.scrollTo(0, 300);
    });

    await sleep(1000);
    screenshotPath = await saveScreenshot(page, 'dob-now-results');

    // ---------------------------------------------------------------
    // Extract results
    // ---------------------------------------------------------------
    let records = await extractFilingRows(page);
    console.log(`[playwright] Extracted ${records.length} records`);

    // ---------------------------------------------------------------
    // Enrich with ACP-5 control numbers from job details
    // ---------------------------------------------------------------
    if (records.length > 0) {
      console.log(`[playwright] Enriching records with ACP control numbers...`);
      records = await enrichWithAcpNumbers(page, records);
    }

    return {
      records,
      log: {
        source: 'dob_now_live',
        dataset: 'dob_now_portal',
        status: 'success',
        recordsFound: records.length,
        durationMs: Date.now() - start,
        screenshotPath,
        metadata: {
          url: page.url(),
          pageErrors: pageErrors.slice(0, 5),
        },
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[playwright] Scrape error:', error);

    if (page && !page.isClosed()) {
      screenshotPath = await saveScreenshot(page, 'dob-now-error');
    }

    return {
      records: [],
      log: {
        source: 'dob_now_live',
        status: 'error',
        recordsFound: 0,
        durationMs: Date.now() - start,
        errorMessage: error,
        screenshotPath,
        metadata: { pageErrors: pageErrors.slice(0, 5) },
      },
    };
  } finally {
    await browser.close();
  }
}
