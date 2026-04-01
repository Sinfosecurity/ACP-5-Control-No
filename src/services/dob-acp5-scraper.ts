// ============================================================
// services/dob-acp5-scraper.ts
// Production-ready DOB NOW Portal scraper for ACP-5 Control Numbers
// Follows exact user navigation flow:
//   Search → Property Profile → Job Filings → Filing Details →
//   General Information → Asbestos Abatement Compliance → Extract ACP-5 & CAI
// ============================================================
'use server';

import type { Page, Browser, BrowserContext } from 'playwright';
import { sleep } from '@/lib/utils';
import path from 'path';
import fs from 'fs';

const DOB_NOW_URL = 'https://a810-dobnow.nyc.gov/publish/Index.html#!/';
const TIMEOUT = parseInt(process.env.PLAYWRIGHT_TIMEOUT ?? '45000', 10);
const HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== 'false';
const SCREENSHOT_DIR = path.resolve(
  process.cwd(),
  process.env.PLAYWRIGHT_SCREENSHOT_DIR ?? './tmp/screenshots'
);

// ============================================================
// Type Definitions
// ============================================================

export interface DOBSearchParams {
  houseNumber: string;
  streetName: string;
  borough: string;
  block?: string;
  lot?: string;
  bin?: string;
}

export interface JobFiling {
  jobNumber: string;
  filingNumber?: string;
  jobType?: string;
  workType?: string;
  address?: string;
  filingStatus?: string;
  modifiedDate?: string;
  description?: string;
}

export interface ACP5ExtractionResult {
  jobNumber: string;
  filingNumber?: string;
  acp5ControlNumber?: string;
  caiNumber?: string;
  asbestosComplianceText?: string;
  complianceStatus?: 'NOT_ASBESTOS_PROJECT' | 'REQUIRES_ABATEMENT' | 'EXEMPT' | 'UNKNOWN';
  investigatorCertNumber?: string;
  address?: string;
  borough?: string;
  bin?: string;
  block?: string;
  lot?: string;
  bbl?: string;
  proposedWorkSummary?: string;
  sourceUrl?: string;
  screenshotPath?: string;
  rawHtml?: string;
  error?: string;
}

export interface ScrapingLogs {
  step: string;
  timestamp: number;
  status: 'success' | 'error' | 'warning';
  message: string;
  screenshotPath?: string;
}

export interface ACP5ScraperResult {
  success: boolean;
  searchParams: DOBSearchParams;
  jobFilings: JobFiling[];
  extractions: ACP5ExtractionResult[];
  logs: ScrapingLogs[];
  durationMs: number;
  error?: string;
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Save screenshot with timestamp
 */
async function saveScreenshot(
  page: Page,
  label: string
): Promise<string | undefined> {
  try {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const timestamp = Date.now();
    const filePath = path.join(SCREENSHOT_DIR, `${label}-${timestamp}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    console.log(`[acp5-scraper] Screenshot saved: ${filePath}`);
    return filePath;
  } catch (err) {
    console.warn(`[acp5-scraper] Screenshot failed:`, err);
    return undefined;
  }
}

/**
 * Retry with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const {
    retries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    onRetry,
  } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      
      const error = err instanceof Error ? err : new Error(String(err));
      if (onRetry) onRetry(attempt + 1, error);
      
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      console.log(`[acp5-scraper] Retry ${attempt + 1}/${retries} after ${delay}ms`);
      await sleep(delay);
    }
  }
  throw new Error('Retry exhausted');
}

/**
 * Wait for element with retry
 */
async function waitForElement(
  page: Page,
  selectors: string[],
  timeout: number = 10000
): Promise<boolean> {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout, state: 'visible' });
      console.log(`[acp5-scraper] Found element: ${selector}`);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

// ============================================================
// Step 1: Navigate to DOB Portal and Close Modal
// ============================================================

async function navigateAndPrepare(page: Page, logs: ScrapingLogs[]): Promise<void> {
  logs.push({
    step: 'navigate',
    timestamp: Date.now(),
    status: 'success',
    message: 'Navigating to DOB NOW portal',
  });

  await retryWithBackoff(
    async () => {
      await page.goto(DOB_NOW_URL, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUT,
      });
    },
    {
      retries: 2,
      baseDelayMs: 2000,
      onRetry: (attempt) => {
        logs.push({
          step: 'navigate',
          timestamp: Date.now(),
          status: 'warning',
          message: `Navigation retry attempt ${attempt}`,
        });
      },
    }
  );

  await sleep(3000); // Let AngularJS initialize

  // Close login modal
  try {
    const dismissButtons = [
      'button:has-text("No Thanks")',
      'button:has-text("Not Now")',
      'button:has-text("Maybe Later")',
      'button:has-text("Continue without")',
      'a:has-text("Continue as Guest")',
    ];

    for (const selector of dismissButtons) {
      const btn = await page.$(selector);
      if (btn && (await btn.isVisible().catch(() => false))) {
        await btn.click();
        await sleep(1000);
        logs.push({
          step: 'modal_close',
          timestamp: Date.now(),
          status: 'success',
          message: `Closed modal via: ${selector}`,
        });
        break;
      }
    }

    // Escape fallback
    await page.keyboard.press('Escape');
    await sleep(500);

    // Force remove modal backdrop if still present
    await page.evaluate(() => {
      document
        .querySelectorAll('.modal-backdrop, .overlay, [class*="backdrop"]')
        .forEach((el) => el.remove());
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
    });
  } catch (err) {
    logs.push({
      step: 'modal_close',
      timestamp: Date.now(),
      status: 'warning',
      message: `Modal dismiss failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

// ============================================================
// Step 2: Search by Address
// ============================================================

async function searchByAddress(
  page: Page,
  params: DOBSearchParams,
  logs: ScrapingLogs[]
): Promise<void> {
  logs.push({
    step: 'search_address',
    timestamp: Date.now(),
    status: 'success',
    message: `Searching for: ${params.houseNumber} ${params.streetName}, ${params.borough}`,
  });

  // Click Address tab
  const addressTabSelectors = [
    'button:has-text("Address")',
    'a:has-text("Address")',
    '[ng-click*="address" i]',
    '.nav-tabs a:nth-child(1)',
  ];

  for (const selector of addressTabSelectors) {
    try {
      const tab = await page.$(selector);
      if (tab && (await tab.isVisible().catch(() => false))) {
        await tab.click();
        await sleep(1000);
        logs.push({
          step: 'search_address',
          timestamp: Date.now(),
          status: 'success',
          message: `Clicked Address tab via: ${selector}`,
        });
        break;
      }
    } catch {
      continue;
    }
  }

  await sleep(1500);

  // Fill address field
  const fullAddress = `${params.houseNumber} ${params.streetName}, ${params.borough}`;
  
  const addressFieldSelectors = [
    'input[placeholder*="Address" i]',
    'input[name*="address" i]',
    'textarea[name*="address" i]',
    'input.form-control:visible',
  ];

  let filled = false;
  for (const selector of addressFieldSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
      const field = await page.$(selector);
      if (field && (await field.isVisible())) {
        await field.click({ clickCount: 3 }); // Select all
        await sleep(200);
        await field.fill(fullAddress);
        filled = true;
        logs.push({
          step: 'search_address',
          timestamp: Date.now(),
          status: 'success',
          message: `Filled address field with "${fullAddress}"`,
        });
        break;
      }
    } catch {
      continue;
    }
  }

  if (!filled) {
    throw new Error('Could not find address input field');
  }

  // Submit search
  const searchButtonSelectors = [
    'button:has-text("Search")',
    'button[type="submit"]',
    'input[type="submit"]',
    '[ng-click*="search" i]',
  ];

  let submitted = false;
  for (const selector of searchButtonSelectors) {
    try {
      const btn = await page.$(selector);
      if (btn && (await btn.isVisible().catch(() => false))) {
        await btn.click();
        submitted = true;
        logs.push({
          step: 'search_address',
          timestamp: Date.now(),
          status: 'success',
          message: 'Submitted search',
        });
        break;
      }
    } catch {
      continue;
    }
  }

  if (!submitted) {
    // Try Enter key
    await page.keyboard.press('Enter');
    submitted = true;
  }

  // Wait for results
  await sleep(5000); // Wait for Property Profile to load
}

// ============================================================
// Step 3: Open Property Profile and Navigate to Job Filings
// ============================================================

async function navigateToJobFilings(
  page: Page,
  logs: ScrapingLogs[]
): Promise<void> {
  logs.push({
    step: 'property_profile',
    timestamp: Date.now(),
    status: 'success',
    message: 'Loading Property Profile',
  });

  await page.waitForLoadState('networkidle', { timeout: TIMEOUT }).catch(() => null);
  await sleep(2000);

  // Look for BUILD: Job Filings section/tab
  const jobFilingsSelectors = [
    'text=/BUILD.*Job Filings/i',
    'button:has-text("Job Filings")',
    'a:has-text("Job Filings")',
    '[ng-click*="jobFilings" i]',
    'li:has-text("Job Filings")',
  ];

  let found = false;
  for (const selector of jobFilingsSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        // Check if it's clickable (tab/button)
        const isClickable = await element.evaluate((el) => {
          return el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'LI';
        });

        if (isClickable) {
          await element.scrollIntoViewIfNeeded();
          await sleep(300);
          await element.click();
          await sleep(2000);
          logs.push({
            step: 'property_profile',
            timestamp: Date.now(),
            status: 'success',
            message: `Clicked Job Filings tab via: ${selector}`,
          });
        } else {
          // Just scroll to it
          await element.scrollIntoViewIfNeeded();
          await sleep(1000);
          logs.push({
            step: 'property_profile',
            timestamp: Date.now(),
            status: 'success',
            message: `Scrolled to Job Filings section`,
          });
        }
        found = true;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!found) {
    logs.push({
      step: 'property_profile',
      timestamp: Date.now(),
      status: 'warning',
      message: 'Could not find Job Filings section explicitly, continuing anyway',
    });
  }

  await sleep(1500);
}

// ============================================================
// Step 4: Parse Job Filings Table
// ============================================================

async function parseJobFilingsTable(
  page: Page,
  logs: ScrapingLogs[]
): Promise<JobFiling[]> {
  logs.push({
    step: 'parse_job_filings',
    timestamp: Date.now(),
    status: 'success',
    message: 'Parsing Job Filings table',
  });

  await sleep(2000); // Let table render

  const filings: JobFiling[] = await page.evaluate(() => {
    const results: JobFiling[] = [];
    
    // Find all tables
    const tables = document.querySelectorAll('table');
    
    for (const table of tables) {
      // Check if this is the Job Filings table
      const tableText = table.textContent?.toUpperCase() || '';
      if (!tableText.includes('JOB') && !tableText.includes('FILING')) {
        continue;
      }

      // Find header row to map columns
      const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
      if (!headerRow) continue;

      const headers = Array.from(headerRow.querySelectorAll('th, td')).map((th) =>
        (th.textContent || '').trim().toUpperCase()
      );

      const jobColIndex = headers.findIndex((h) =>
        h.includes('JOB') && (h.includes('#') || h.includes('NO') || h.includes('NUMBER'))
      );
      const filingColIndex = headers.findIndex((h) =>
        h.includes('FILING') || h.includes('DOC')
      );
      const statusColIndex = headers.findIndex((h) => h.includes('STATUS'));
      const typeColIndex = headers.findIndex((h) =>
        h.includes('TYPE') && !h.includes('WORK')
      );
      const workTypeColIndex = headers.findIndex((h) =>
        h.includes('WORK') && h.includes('TYPE')
      );
      const addressColIndex = headers.findIndex((h) => h.includes('ADDRESS'));

      // Parse rows
      const tbody = table.querySelector('tbody') || table;
      const rows = tbody.querySelectorAll('tr');

      for (let i = 1; i < rows.length; i++) {
        // Skip header if in tbody
        const row = rows[i];
        const cells = row.querySelectorAll('td');

        if (cells.length === 0) continue;

        const jobNumber = jobColIndex >= 0 ? cells[jobColIndex]?.textContent?.trim() : undefined;
        if (!jobNumber) continue;

        results.push({
          jobNumber,
          filingNumber: filingColIndex >= 0 ? cells[filingColIndex]?.textContent?.trim() : undefined,
          jobType: typeColIndex >= 0 ? cells[typeColIndex]?.textContent?.trim() : undefined,
          workType: workTypeColIndex >= 0 ? cells[workTypeColIndex]?.textContent?.trim() : undefined,
          filingStatus: statusColIndex >= 0 ? cells[statusColIndex]?.textContent?.trim() : undefined,
          address: addressColIndex >= 0 ? cells[addressColIndex]?.textContent?.trim() : undefined,
        });
      }
    }

    return results;
  });

  logs.push({
    step: 'parse_job_filings',
    timestamp: Date.now(),
    status: 'success',
    message: `Found ${filings.length} job filings`,
  });

  return filings;
}

// ============================================================
// Step 5: Click Job Filing to Open Details
// ============================================================

async function openFilingDetails(
  page: Page,
  filing: JobFiling,
  logs: ScrapingLogs[]
): Promise<boolean> {
  logs.push({
    step: 'open_filing_details',
    timestamp: Date.now(),
    status: 'success',
    message: `Opening filing details for Job# ${filing.jobNumber}`,
  });

  try {
    // Find and click the job number (it should be a link or clickable)
    const jobLinkSelectors = [
      `a:has-text("${filing.jobNumber}")`,
      `button:has-text("${filing.jobNumber}")`,
      `td:has-text("${filing.jobNumber}") a`,
      `tr:has-text("${filing.jobNumber}") td:first-child a`,
    ];

    for (const selector of jobLinkSelectors) {
      try {
        const link = await page.$(selector);
        if (link && (await link.isVisible().catch(() => false))) {
          await link.scrollIntoViewIfNeeded();
          await sleep(300);
          await link.click();
          await sleep(3000); // Wait for detail page/modal to load

          logs.push({
            step: 'open_filing_details',
            timestamp: Date.now(),
            status: 'success',
            message: `Clicked job link for ${filing.jobNumber}`,
          });
          return true;
        }
      } catch {
        continue;
      }
    }

    throw new Error(`Could not find clickable element for job ${filing.jobNumber}`);
  } catch (err) {
    logs.push({
      step: 'open_filing_details',
      timestamp: Date.now(),
      status: 'error',
      message: `Failed to open filing details: ${err instanceof Error ? err.message : String(err)}`,
    });
    return false;
  }
}

// ============================================================
// Step 6: Expand General Information Section
// ============================================================

async function expandGeneralInformation(
  page: Page,
  logs: ScrapingLogs[]
): Promise<boolean> {
  logs.push({
    step: 'expand_general_info',
    timestamp: Date.now(),
    status: 'success',
    message: 'Expanding General Information section',
  });

  try {
    const generalInfoSelectors = [
      'text=/General Information/i',
      'button:has-text("General Information")',
      'h3:has-text("General Information")',
      'h4:has-text("General Information")',
      '[class*="accordion"]:has-text("General Information")',
    ];

    for (const selector of generalInfoSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          // Check if it's collapsed (needs clicking)
          const isClickable = await element.evaluate((el) => {
            return (
              el.tagName === 'BUTTON' ||
              el.classList.contains('collapsed') ||
              el.getAttribute('aria-expanded') === 'false'
            );
          });

          if (isClickable) {
            await element.scrollIntoViewIfNeeded();
            await sleep(300);
            await element.click();
            await sleep(1500);
            logs.push({
              step: 'expand_general_info',
              timestamp: Date.now(),
              status: 'success',
              message: 'Expanded General Information',
            });
          } else {
            // Already expanded or not an accordion
            await element.scrollIntoViewIfNeeded();
            await sleep(500);
          }
          return true;
        }
      } catch {
        continue;
      }
    }

    logs.push({
      step: 'expand_general_info',
      timestamp: Date.now(),
      status: 'warning',
      message: 'Could not explicitly expand General Information, continuing',
    });
    return false;
  } catch (err) {
    logs.push({
      step: 'expand_general_info',
      timestamp: Date.now(),
      status: 'error',
      message: `Error expanding General Information: ${err instanceof Error ? err.message : String(err)}`,
    });
    return false;
  }
}

// ============================================================
// Step 7: Extract ACP-5 and CAI from Asbestos Compliance Section
// ============================================================

async function extractAsbestosComplianceData(
  page: Page,
  filing: JobFiling,
  logs: ScrapingLogs[]
): Promise<Partial<ACP5ExtractionResult>> {
  logs.push({
    step: 'extract_acp5',
    timestamp: Date.now(),
    status: 'success',
    message: 'Extracting ACP-5 Control Number and CAI# from Asbestos section',
  });

  try {
    // Scroll to Asbestos Abatement Compliance section
    const asbestosSelectors = [
      'text=/Asbestos.*Abatement.*Compliance/i',
      'h3:has-text("Asbestos Abatement Compliance")',
      'h4:has-text("Asbestos Abatement Compliance")',
      'label:has-text("Asbestos Abatement Compliance")',
    ];

    let asbestosSection = null;
    for (const selector of asbestosSelectors) {
      try {
        asbestosSection = await page.$(selector);
        if (asbestosSection) {
          await asbestosSection.scrollIntoViewIfNeeded();
          await sleep(1000);
          break;
        }
      } catch {
        continue;
      }
    }

    if (!asbestosSection) {
      throw new Error('Asbestos Abatement Compliance section not found');
    }

    // Extract text content from the section
    const extractedData = await page.evaluate(() => {
      // Find the asbestos section element
      const headers = Array.from(
        document.querySelectorAll('h1, h2, h3, h4, h5, h6, label, .section-header, div[class*="header"]')
      );
      const asbestosHeader = headers.find((h) =>
        h.textContent?.toLowerCase().includes('asbestos') &&
        h.textContent?.toLowerCase().includes('compliance')
      );

      if (!asbestosHeader) {
        return { error: 'Asbestos section header not found' };
      }

      // Get all following siblings until next major section
      let currentElement = asbestosHeader.nextElementSibling;
      let sectionContent = asbestosHeader.textContent || '';

      while (currentElement) {
        const tagName = currentElement.tagName.toLowerCase();
        // Stop if we hit another major heading
        if (['h1', 'h2', 'h3'].includes(tagName)) break;

        sectionContent += '\n' + (currentElement.textContent || '');
        currentElement = currentElement.nextElementSibling;
      }

      // Also check parent container
      const parent = asbestosHeader.parentElement;
      if (parent) {
        sectionContent += '\n' + parent.textContent;
      }

      // Parse ACP-5 Control Number (various formats)
      const acp5Patterns = [
        /(?:DEP\s+)?ACP[-\s]?5\s+Control\s+No\.?\s*[:\s]*([A-Z0-9]+)/i,
        /ACP[-\s]?5[:\s]+([A-Z0-9]+)/i,
        /Control\s+No\.?\s*[:\s]*([A-Z0-9]+)/i,
      ];

      let acp5ControlNumber: string | undefined;
      for (const pattern of acp5Patterns) {
        const match = sectionContent.match(pattern);
        if (match && match[1]) {
          acp5ControlNumber = match[1].trim();
          break;
        }
      }

      // Parse CAI Number
      const caiPatterns = [
        /CAI\s*#?\s*[:\s]*([A-Z0-9]+)/i,
        /CAI\s+Number\s*[:\s]*([A-Z0-9]+)/i,
      ];

      let caiNumber: string | undefined;
      for (const pattern of caiPatterns) {
        const match = sectionContent.match(pattern);
        if (match && match[1]) {
          caiNumber = match[1].trim();
          break;
        }
      }

      // Extract compliance status text
      const complianceTexts = [
        'Not an asbestos project',
        'Requires asbestos abatement',
        'ACP-5 Exemption',
        'Exempt from ACP-5',
      ];

      let complianceText: string | undefined;
      for (const text of complianceTexts) {
        if (sectionContent.toLowerCase().includes(text.toLowerCase())) {
          complianceText = text;
          break;
        }
      }

      return {
        acp5ControlNumber,
        caiNumber,
        asbestosComplianceText: complianceText || sectionContent.substring(0, 500),
        sectionContent,
      };
    });

    if (extractedData.error) {
      throw new Error(extractedData.error);
    }

    logs.push({
      step: 'extract_acp5',
      timestamp: Date.now(),
      status: 'success',
      message: `Extracted: ACP-5=${extractedData.acp5ControlNumber || 'N/A'}, CAI=${extractedData.caiNumber || 'N/A'}`,
    });

    // Determine compliance status
    let complianceStatus: ACP5ExtractionResult['complianceStatus'] = 'UNKNOWN';
    if (extractedData.asbestosComplianceText) {
      const text = extractedData.asbestosComplianceText.toUpperCase();
      if (text.includes('NOT AN ASBESTOS')  || text.includes('ACP-5')) {
        complianceStatus = 'NOT_ASBESTOS_PROJECT';
      } else if (text.includes('REQUIRES') || text.includes('ABATEMENT')) {
        complianceStatus = 'REQUIRES_ABATEMENT';
      } else if (text.includes('EXEMPT')) {
        complianceStatus = 'EXEMPT';
      }
    }

    return {
      jobNumber: filing.jobNumber,
      filingNumber: filing.filingNumber,
      acp5ControlNumber: extractedData.acp5ControlNumber,
      caiNumber: extractedData.caiNumber,
      asbestosComplianceText: extractedData.asbestosComplianceText,
      complianceStatus,
    };
  } catch (err) {
    logs.push({
      step: 'extract_acp5',
      timestamp: Date.now(),
      status: 'error',
      message: `Extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return {
      jobNumber: filing.jobNumber,
      filingNumber: filing.filingNumber,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================
// Main Orchestrator Function
// ============================================================

export async function scrapeACP5ControlNumbers(
  searchParams: DOBSearchParams,
  options: {
    maxFilingsToProcess?: number;
    preferLAAWorkType?: boolean;
    mockMode?: boolean;
  } = {}
): Promise<ACP5ScraperResult> {
  const startTime = Date.now();
  const logs: ScrapingLogs[] = [];
  const {
    maxFilingsToProcess = 10,
    preferLAAWorkType = true,
    mockMode = false,
  } = options;

  // Mock mode for development/testing
  if (mockMode) {
    await sleep(2000);
    return {
      success: true,
      searchParams,
      jobFilings: [
        {
          jobNumber: 'B01327203',
          filingNumber: 'I1',
          workType: 'LAA',
          filingStatus: 'Signed off',
        },
      ],
      extractions: [
        {
          jobNumber: 'B01327203',
          filingNumber: 'I1',
          acp5ControlNumber: '31273241',
          caiNumber: '120831',
          complianceStatus: 'NOT_ASBESTOS_PROJECT',
          asbestosComplianceText: 'Not an asbestos project - ACP-5',
        },
      ],
      logs: [{
        step: 'mock',
        timestamp: Date.now(),
        status: 'success',
        message: 'Mock mode - returning sample data',
      }],
      durationMs: 2000,
    };
  }

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    // Initialize Playwright
    const pw = await import('playwright');
    browser = await pw.chromium.launch({
      headless: HEADLESS,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const context: BrowserContext = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });

    page = await context.newPage();

    // Step 1: Navigate and prepare
    await navigateAndPrepare(page, logs);
    const screenshotPath = await saveScreenshot(page, 'acp5-01-initial');
    logs.push({ step: 'screenshot', timestamp: Date.now(), status: 'success', message: 'Initial', screenshotPath });

    // Step 2: Search by address
    await searchByAddress(page, searchParams, logs);
    await saveScreenshot(page, 'acp5-02-search-submitted');

    // Step 3: Navigate to Job Filings
    await navigateToJobFilings(page, logs);
    await saveScreenshot(page, 'acp5-03-job-filings');

    // Step 4: Parse job filings table
    const allFilings = await parseJobFilingsTable(page, logs);
    
    // Filter/sort filings
    let filingsToProcess = allFilings;
    if (preferLAAWorkType) {
      const laaFilings = allFilings.filter((f) => f.workType?.toUpperCase().includes('LAA'));
      if (laaFilings.length > 0) {
        filingsToProcess = laaFilings;
        logs.push({
          step: 'filter_filings',
          timestamp: Date.now(),
          status: 'success',
          message: `Filtered to ${laaFilings.length} LAA filings`,
        });
      }
    }

    filingsToProcess = filingsToProcess.slice(0, maxFilingsToProcess);

    // Step 5-7: Process each filing
    const extractions: ACP5ExtractionResult[] = [];

    for (const filing of filingsToProcess) {
      try {
        // Open filing details
        const opened = await openFilingDetails(page, filing, logs);
        if (!opened) {
          extractions.push({
            jobNumber: filing.jobNumber,
            filingNumber: filing.filingNumber,
            error: 'Could not open filing details',
          });
          continue;
        }

        await saveScreenshot(page, `acp5-04-filing-${filing.jobNumber}`);

        // Expand General Information
        await expandGeneralInformation(page, logs);
        await saveScreenshot(page, `acp5-05-general-info-${filing.jobNumber}`);

        // Extract ACP-5 data
        const extractedData = await extractAsbestosComplianceData(page, filing, logs);
        await saveScreenshot(page, `acp5-06-extracted-${filing.jobNumber}`);

        // Get current URL and additional context
        const sourceUrl = page.url();
        const additionalData = await page.evaluate(() => {
          // Try to find BIN, block, lot from the page
          const text = document.body.textContent || '';
          const binMatch = text.match(/BIN[:\s]+(\d+)/i);
          const blockMatch = text.match(/Block[:\s]+(\d+)/i);
          const lotMatch = text.match(/Lot[:\s]+(\d+)/i);

          return {
            bin: binMatch?.[1],
            block: blockMatch?.[1],
            lot: lotMatch?.[1],
          };
        });

        extractions.push({
          ...extractedData,
          sourceUrl,
          ...additionalData,
          address: filing.address,
          borough: searchParams.borough,
        });

        // Close modal if needed
        try {
          await page.keyboard.press('Escape');
          await sleep(1000);
        } catch {
          // Ignore
        }

        // Go back to job filings list
        const backSelectors = [
          'button:has-text("Back")',
          'button:has-text("Close")',
          'a:has-text("Back to")',
        ];

        for (const selector of backSelectors) {
          try {
            const btn = await page.$(selector);
            if (btn && (await btn.isVisible().catch(() => false))) {
              await btn.click();
              await sleep(2000);
              break;
            }
          } catch {
            continue;
          }
        }

      } catch (err) {
        logs.push({
          step: 'process_filing',
          timestamp: Date.now(),
          status: 'error',
          message: `Error processing ${filing.jobNumber}: ${err instanceof Error ? err.message : String(err)}`,
        });
        extractions.push({
          jobNumber: filing.jobNumber,
          filingNumber: filing.filingNumber,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const durationMs = Date.now() - startTime;

    return {
      success: extractions.some((e) => e.acp5ControlNumber || e.caiNumber),
      searchParams,
      jobFilings: allFilings,
      extractions,
      logs,
      durationMs,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logs.push({
      step: 'fatal_error',
      timestamp: Date.now(),
      status: 'error',
      message: error,
    });

    if (page && !page.isClosed()) {
      await saveScreenshot(page, 'acp5-error');
    }

    return {
      success: false,
      searchParams,
      jobFilings: [],
      extractions: [],
      logs,
      durationMs: Date.now() - startTime,
      error,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => null);
    }
  }
}
