#!/usr/bin/env node
// ============================================================
// scripts/test-search.js
// Live integration test against NYC Open Data API
//
// Usage:
//   node scripts/test-search.js
//   NYC_OPEN_DATA_APP_TOKEN=xxx node scripts/test-search.js
//   node scripts/test-search.js "79" "North Oxford Walk" "Brooklyn"
// ============================================================
'use strict';

const BASE_URL  = 'https://data.cityofnewyork.us/resource';
const APP_TOKEN = process.env.NYC_OPEN_DATA_APP_TOKEN ?? '';

// ---- Address from CLI args or default ----
const houseArg  = process.argv[2] ?? '79';
const streetArg = process.argv[3] ?? 'North Oxford Walk';
const boroughArg = process.argv[4] ?? 'Brooklyn';

// ---- Normalizer (inline copy) ----
const BOROUGH_MAP = {
  manhattan:'MANHATTAN', mn:'MANHATTAN', '1':'MANHATTAN', 'new york':'MANHATTAN',
  bronx:'BRONX', bx:'BRONX', '2':'BRONX', 'the bronx':'BRONX',
  brooklyn:'BROOKLYN', bk:'BROOKLYN', bklyn:'BROOKLYN', kings:'BROOKLYN', '3':'BROOKLYN',
  queens:'QUEENS', qn:'QUEENS', qns:'QUEENS', '4':'QUEENS',
  'staten island':'STATEN ISLAND', si:'STATEN ISLAND', richmond:'STATEN ISLAND', '5':'STATEN ISLAND',
};
const STREET_ABBR = {
  AVE:'AVENUE', AV:'AVENUE', BLVD:'BOULEVARD', ST:'STREET', RD:'ROAD',
  DR:'DRIVE', PL:'PLACE', PKWY:'PARKWAY', TPKE:'TURNPIKE',
  WLK:'WALK', WK:'WALK', CT:'COURT', LN:'LANE', TER:'TERRACE',
  TERR:'TERRACE', HWY:'HIGHWAY', N:'NORTH', S:'SOUTH', E:'EAST', W:'WEST',
};
const DIR_ABBR = { N:'NORTH', S:'SOUTH', E:'EAST', W:'WEST', NE:'NORTHEAST', NW:'NORTHWEST', SE:'SOUTHEAST', SW:'SOUTHWEST' };

function normalizeBorough(raw) {
  const key = raw.trim().toLowerCase();
  if (BOROUGH_MAP[key]) return BOROUGH_MAP[key];
  for (const [k,v] of Object.entries(BOROUGH_MAP)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  throw new Error('Unknown borough: ' + raw);
}
function normalizeStreetName(raw) {
  const parts = raw.trim().toUpperCase().replace(/\s+/g,' ').split(' ');
  return parts.map((w,i) => {
    if (i === 0 && DIR_ABBR[w]) return DIR_ABBR[w];
    if (i === parts.length - 1 && STREET_ABBR[w]) return STREET_ABBR[w];
    return w;
  }).join(' ');
}

const house   = houseArg.trim().toUpperCase();
const street  = normalizeStreetName(streetArg);
const borough = normalizeBorough(boroughArg);
const esc     = s => s.replace(/'/g, "''");

console.log(`\n${'='.repeat(60)}`);
console.log(`NYC DOB Filing Lookup — Integration Test`);
console.log(`${'='.repeat(60)}`);
console.log(`Address: ${house} ${street}, ${borough}`);
console.log(`App token: ${APP_TOKEN ? '✓ set' : '✗ not set (rate limiting applies)'}\n`);

// ---- Dataset definitions with correct column names ----
const DATASETS = [
  {
    id:   'w9ak-ipjd',
    name: 'Job Application Filings (DOB NOW)',
    where: `UPPER(house_no)='${esc(house)}' AND UPPER(street_name) LIKE '${esc(street)}%' AND UPPER(borough)='${esc(borough)}'`,
    orderBy: 'job_filing_number DESC',
    summaryFn: r => `Job: ${r.job_filing_number ?? '—'}  Status: ${r.filing_status ?? '—'}`,
  },
  {
    id:   'xxbr-ypig',
    name: 'Limited Alteration Applications',
    where: `UPPER(location_house_no)='${esc(house)}' AND UPPER(location_street_name) LIKE '${esc(street)}%' AND UPPER(location_borough_name)='${esc(borough)}'`,
    orderBy: 'filing_date DESC',
    summaryFn: r => `Job: ${r.job_number ?? '—'}  Filing: ${r.filing_number ?? '—'}  Status: ${r.filing_status_name ?? '—'}  Work: ${r.work_type_name ?? '—'}`,
  },
  {
    id:   'rbx6-tga4',
    name: 'Approved Permits',
    where: `UPPER(house_no)='${esc(house)}' AND UPPER(street_name) LIKE '${esc(street)}%' AND UPPER(borough)='${esc(borough)}'`,
    orderBy: 'issued_date DESC',
    summaryFn: r => `Job: ${r.job_filing_number ?? '—'}  Permit: ${r.work_permit ?? '—'}  Status: ${r.permit_status ?? '—'}  Work: ${r.work_type ?? '—'}`,
  },
  {
    id:   'kfp4-dz4h',
    name: 'Elevator Permit Applications',
    where: `UPPER(house_number)='${esc(house)}' AND UPPER(street_name) LIKE '${esc(street)}%' AND UPPER(borough)='${esc(borough)}'`,
    orderBy: 'filing_date DESC',
    summaryFn: r => `Job: ${r.job_number ?? '—'}  Filing: ${r.filing_number ?? '—'}  Status: ${r.filing_status ?? '—'}  Device: ${r.elevator_device_type ?? '—'}`,
  },
  {
    id:   'ic3t-wcy2',
    name: 'Legacy Job Filings (BIS era, pre-2018)',
    where: `UPPER(house__)='${esc(house)}' AND UPPER(streetname) LIKE '${esc(street)}%' AND UPPER(borough)='${esc(borough)}'`,
    orderBy: 'date_filed DESC',
    summaryFn: r => `Job: ${r.job__ ?? '—'}  Doc: ${r.doc__ ?? '—'}  Type: ${r.job_type ?? '—'}  Status: ${r.job_status_descrp ?? r.job_status ?? '—'}`,
  },
];

async function queryDataset(ds) {
  const url = new URL(`${BASE_URL}/${ds.id}.json`);
  url.searchParams.set('$where',  ds.where);
  url.searchParams.set('$limit',  '50');
  url.searchParams.set('$order',  ds.orderBy);

  const headers = { 'Accept': 'application/json' };
  if (APP_TOKEN) headers['X-App-Token'] = APP_TOKEN;

  const t0  = Date.now();
  const res = await fetch(url.toString(), { headers });
  const ms  = Date.now() - t0;

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const rows = await res.json();
  return { rows: Array.isArray(rows) ? rows : [], ms, url: url.toString() };
}

async function run() {
  let totalRecords = 0;

  for (const ds of DATASETS) {
    process.stdout.write(`\n[${ds.id}] ${ds.name}\n`);
    process.stdout.write(`  WHERE: ${ds.where}\n`);

    try {
      const { rows, ms, url } = await queryDataset(ds);
      totalRecords += rows.length;

      if (rows.length === 0) {
        console.log(`  ⚠️  No records found  (${ms}ms)`);
      } else {
        console.log(`  ✅ ${rows.length} record(s) found  (${ms}ms)`);
        rows.slice(0, 5).forEach((r, i) => {
          console.log(`     ${i + 1}. ${ds.summaryFn(r)}`);
        });
        if (rows.length > 5) console.log(`     … and ${rows.length - 5} more`);
      }

      // Show the request URL for copy-paste debugging
      console.log(`  🔗 ${url}`);
    } catch (err) {
      console.log(`  ❌ ERROR: ${err.message}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Total records across all datasets: ${totalRecords}`);
  console.log(`${'='.repeat(60)}\n`);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
