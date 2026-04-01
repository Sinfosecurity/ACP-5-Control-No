#!/usr/bin/env node
// ============================================================
// scripts/test-asbestos.js
// Integration test for asbestos ACP7 data — no network restrictions
//
// Usage:
//   node scripts/test-asbestos.js
//   node scripts/test-asbestos.js "79" "North Oxford Walk" "Brooklyn"
//   NYC_OPEN_DATA_APP_TOKEN=xxx node scripts/test-asbestos.js
// ============================================================
'use strict';

const BASE_URL  = 'https://data.cityofnewyork.us/resource';
const APP_TOKEN = process.env.NYC_OPEN_DATA_APP_TOKEN ?? '';

const houseArg  = process.argv[2] ?? '79';
const streetArg = process.argv[3] ?? 'North Oxford Walk';
const boroughArg = process.argv[4] ?? 'Brooklyn';

// ---- Normalizer (inline) ----
const BOROUGH_MAP = {
  manhattan:'MANHATTAN', mn:'MANHATTAN', '1':'MANHATTAN', 'new york':'MANHATTAN',
  bronx:'BRONX', bx:'BRONX', '2':'BRONX',
  brooklyn:'BROOKLYN', bk:'BROOKLYN', bklyn:'BROOKLYN', '3':'BROOKLYN',
  queens:'QUEENS', qn:'QUEENS', '4':'QUEENS',
  'staten island':'STATEN ISLAND', si:'STATEN ISLAND', '5':'STATEN ISLAND',
};
const STREET_ABBR = {
  AVE:'AVENUE', AV:'AVENUE', ST:'STREET', BLVD:'BOULEVARD', RD:'ROAD',
  WLK:'WALK', WK:'WALK', DR:'DRIVE', PKWY:'PARKWAY', PL:'PLACE', LN:'LANE',
};
const DIR_ABBR = { N:'NORTH', S:'SOUTH', E:'EAST', W:'WEST' };

function normalizeBorough(raw) {
  const key = raw.trim().toLowerCase();
  if (BOROUGH_MAP[key]) return BOROUGH_MAP[key];
  for (const [k,v] of Object.entries(BOROUGH_MAP)) if (key.includes(k)) return v;
  throw new Error('Unknown borough: ' + raw);
}
function normalizeStreet(raw) {
  const parts = raw.trim().toUpperCase().replace(/\s+/g,' ').split(' ');
  return parts.map((w,i) => {
    if (i===0 && DIR_ABBR[w]) return DIR_ABBR[w];
    if (i===parts.length-1 && STREET_ABBR[w]) return STREET_ABBR[w];
    return w;
  }).join(' ');
}

const house   = houseArg.trim().toUpperCase();
const street  = normalizeStreet(streetArg);
const borough = normalizeBorough(boroughArg);
const esc     = s => s.replace(/'/g, "''");

const DATASET = 'vq35-j9qm';

// ACP7 fields we care about
const SELECT_FIELDS = [
  'tru','status_description','start_date','end_date',
  'facility_type','facility_aka','floor','section','entire_floor',
  'acm_type','acm_amount','acm_unit','abatement_type','procedure_name',
  'building_owner_name','contractor_name','air_monitor_name',
  'bin','bbl','community_board','nta',
].join(',');

async function queryACP7ByAddress() {
  const where =
    `UPPER(premise_no)='${esc(house)}' AND ` +
    `UPPER(street_name) LIKE '${esc(street)}%' AND ` +
    `UPPER(borough)='${esc(borough)}'`;

  const url = new URL(`${BASE_URL}/${DATASET}.json`);
  url.searchParams.set('$where',  where);
  url.searchParams.set('$select', SELECT_FIELDS);
  url.searchParams.set('$limit',  '50');
  url.searchParams.set('$order',  'start_date DESC');

  const headers = { Accept: 'application/json' };
  if (APP_TOKEN) headers['X-App-Token'] = APP_TOKEN;

  const t0  = Date.now();
  const res = await fetch(url.toString(), { headers });
  const ms  = Date.now() - t0;

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return { rows, ms, url: url.toString() };
}

async function queryACP7ByBin(bin) {
  const url = new URL(`${BASE_URL}/${DATASET}.json`);
  url.searchParams.set('$where',  `bin='${esc(bin)}'`);
  url.searchParams.set('$select', SELECT_FIELDS);
  url.searchParams.set('$limit',  '50');
  url.searchParams.set('$order',  'start_date DESC');

  const headers = { Accept: 'application/json' };
  if (APP_TOKEN) headers['X-App-Token'] = APP_TOKEN;

  const t0  = Date.now();
  const res = await fetch(url.toString(), { headers });
  const ms  = Date.now() - t0;

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return { rows, ms, url: url.toString() };
}

function printRecord(r, i) {
  console.log(`\n  ─── Record ${i + 1} ───`);
  console.log(`  Control Number : ${r.tru ?? '—'}`);
  console.log(`  Status         : ${r.status_description ?? '—'}`);
  console.log(`  Dates          : ${r.start_date?.slice(0,10) ?? '—'} → ${r.end_date?.slice(0,10) ?? '—'}`);
  console.log(`  Facility Type  : ${r.facility_type ?? '—'} ${r.facility_aka ? '('+r.facility_aka+')' : ''}`);
  console.log(`  Floor          : ${r.floor ?? '—'}`);
  console.log(`  Section        : ${r.section ?? '—'}`);
  console.log(`  Entire Floor?  : ${r.entire_floor ?? '—'}`);
  console.log(`  ACM Type       : ${r.acm_type ?? '—'}`);
  console.log(`  ACM Amount     : ${r.acm_amount ?? '—'} ${r.acm_unit ?? ''}`);
  console.log(`  Abatement      : ${r.abatement_type ?? '—'} — ${r.procedure_name ?? '—'}`);
  console.log(`  Contractor     : ${r.contractor_name ?? '—'}`);
  console.log(`  Air Monitor    : ${r.air_monitor_name ?? '—'}`);
  console.log(`  Building Owner : ${r.building_owner_name ?? '—'}`);
  console.log(`  BIN / BBL      : ${r.bin ?? '—'} / ${r.bbl ?? '—'}`);
  console.log(`  Community Bd   : ${r.community_board ?? '—'} | NTA: ${r.nta ?? '—'}`);
}

async function run() {
  console.log('\n' + '='.repeat(60));
  console.log('NYC DOB — Asbestos ACP7 Integration Test');
  console.log('='.repeat(60));
  console.log(`Address  : ${house} ${street}, ${borough}`);
  console.log(`Token    : ${APP_TOKEN ? '✓ set' : '✗ not set'}`);
  console.log(`Dataset  : vq35-j9qm (DEP Asbestos Control Program ACP7)`);

  // ---- By address ----
  console.log(`\n[1] Query by address`);
  console.log(`    WHERE: UPPER(premise_no)='${house}' AND UPPER(street_name) LIKE '${street}%' AND UPPER(borough)='${borough}'`);
  try {
    const { rows, ms, url } = await queryACP7ByAddress();
    console.log(`    ✅ ${rows.length} record(s) (${ms}ms)`);
    console.log(`    🔗 ${url}`);
    if (rows.length > 0) rows.forEach(printRecord);
    else console.log('\n    ⚠️  No ACP7 records at this address via street search.');
  } catch (err) {
    console.error(`    ❌ ${err.message}`);
  }

  // ---- By BIN (79 North Oxford Walk = BIN 3335261) ----
  const BIN = '3335261';
  console.log(`\n[2] Query by BIN ${BIN} (more precise)`);
  try {
    const { rows, ms, url } = await queryACP7ByBin(BIN);
    console.log(`    ✅ ${rows.length} record(s) (${ms}ms)`);
    console.log(`    🔗 ${url}`);
    if (rows.length > 0) rows.forEach(printRecord);
    else console.log('\n    ⚠️  No ACP7 records for BIN ' + BIN);
  } catch (err) {
    console.error(`    ❌ ${err.message}`);
  }

  // ---- Explanation of fields ----
  console.log('\n' + '='.repeat(60));
  console.log('Field guide:');
  console.log('  tru              → ACP7 Control Number (e.g. TRU2484MN25)');
  console.log('  status_description → Submitted | Closed | Postponed');
  console.log('  acm_type         → Type of asbestos-containing material');
  console.log('  abatement_type   → Removal | Encapsulation');
  console.log('  procedure_name   → Tent | DEP Variance | Exterior Foam | etc.');
  console.log('  contractor_name  → Licensed abatement contractor');
  console.log('  air_monitor_name → Independent air monitoring firm');
  console.log('='.repeat(60) + '\n');
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
