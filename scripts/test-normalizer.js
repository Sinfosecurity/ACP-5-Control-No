#!/usr/bin/env node
// ============================================================
// scripts/test-normalizer.js
// Unit tests for address normalization logic
// No network, no dependencies — run with: node scripts/test-normalizer.js
// ============================================================
'use strict';

let passed = 0;
let failed = 0;

// ---- Inline normalizer (mirrors src/lib/address-normalizer.ts) ----
const BOROUGH_MAP = {
  manhattan:'MANHATTAN',   mn:'MANHATTAN',          '1':'MANHATTAN', 'new york':'MANHATTAN',
  bronx:'BRONX',           bx:'BRONX',              '2':'BRONX',     'the bronx':'BRONX',
  brooklyn:'BROOKLYN',     bk:'BROOKLYN',           bklyn:'BROOKLYN', kings:'BROOKLYN', '3':'BROOKLYN',
  queens:'QUEENS',         qn:'QUEENS',             qns:'QUEENS',    '4':'QUEENS',
  'staten island':'STATEN ISLAND', si:'STATEN ISLAND', richmond:'STATEN ISLAND', '5':'STATEN ISLAND',
};
const STREET_ABBR = {
  AVE:'AVENUE',  AV:'AVENUE',
  BLVD:'BOULEVARD', BLV:'BOULEVARD',
  CT:'COURT', CIR:'CIRCLE', DR:'DRIVE',
  EXPY:'EXPRESSWAY', EXT:'EXTENSION', FWY:'FREEWAY',
  HWY:'HIGHWAY', HTS:'HEIGHTS', LN:'LANE',
  PKWY:'PARKWAY', PL:'PLACE', PLZ:'PLAZA',
  RD:'ROAD', SQ:'SQUARE', ST:'STREET',
  TER:'TERRACE', TERR:'TERRACE', TPKE:'TURNPIKE',
  WAY:'WAY', WY:'WAY', XING:'CROSSING',
  WLK:'WALK', WK:'WALK', BR:'BRIDGE',
};
const DIR_ABBR = {
  N:'NORTH', S:'SOUTH', E:'EAST', W:'WEST',
  NE:'NORTHEAST', NW:'NORTHWEST', SE:'SOUTHEAST', SW:'SOUTHWEST',
};

function normalizeBorough(raw) {
  const key = raw.trim().toLowerCase();
  if (BOROUGH_MAP[key]) return BOROUGH_MAP[key];
  for (const [k,v] of Object.entries(BOROUGH_MAP)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  throw new Error('Unknown borough: ' + raw);
}
function normalizeHouseNumber(raw) {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}
function normalizeStreetName(raw) {
  const parts = raw.trim().toUpperCase().replace(/\s+/g,' ').split(' ');
  return parts.map((w,i) => {
    if (i === 0 && DIR_ABBR[w]) return DIR_ABBR[w];
    if (i === parts.length - 1 && STREET_ABBR[w]) return STREET_ABBR[w];
    return w;
  }).join(' ');
}
function normalizeAddress({houseNumber, streetName, borough}) {
  const h = normalizeHouseNumber(houseNumber);
  const s = normalizeStreetName(streetName);
  const b = normalizeBorough(borough);
  if (!h) throw new Error('House number required');
  if (!s) throw new Error('Street name required');
  return { houseNumber: h, streetName: s, borough: b, normalizedString: `${h} ${s}, ${b}` };
}

// ---- Test helpers ----
function assert(condition, message) {
  if (!condition) throw new Error('Assertion failed: ' + message);
}
function test(label, fn) {
  try {
    fn();
    console.log(`  ✅  ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${label}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}
function section(title) {
  console.log(`\n${title}`);
  console.log('─'.repeat(title.length));
}

// ─────────────────────────────────────────────────────────────
section('Borough normalization');
// ─────────────────────────────────────────────────────────────
test('Brooklyn - full name', () => assert(normalizeBorough('Brooklyn') === 'BROOKLYN', ''));
test('Brooklyn - bk abbreviation', () => assert(normalizeBorough('bk') === 'BROOKLYN', ''));
test('Brooklyn - BKLYN abbreviation', () => assert(normalizeBorough('bklyn') === 'BROOKLYN', ''));
test('Brooklyn - numeric code 3', () => assert(normalizeBorough('3') === 'BROOKLYN', ''));
test('Manhattan - full name', () => assert(normalizeBorough('Manhattan') === 'MANHATTAN', ''));
test('Manhattan - mn abbreviation', () => assert(normalizeBorough('mn') === 'MANHATTAN', ''));
test('Manhattan - numeric code 1', () => assert(normalizeBorough('1') === 'MANHATTAN', ''));
test('Manhattan - "New York"', () => assert(normalizeBorough('New York') === 'MANHATTAN', ''));
test('Bronx - full name', () => assert(normalizeBorough('Bronx') === 'BRONX', ''));
test('Bronx - "The Bronx"', () => assert(normalizeBorough('The Bronx') === 'BRONX', ''));
test('Bronx - bx abbreviation', () => assert(normalizeBorough('bx') === 'BRONX', ''));
test('Queens - full name', () => assert(normalizeBorough('Queens') === 'QUEENS', ''));
test('Queens - qns abbreviation', () => assert(normalizeBorough('qns') === 'QUEENS', ''));
test('Staten Island - full name', () => assert(normalizeBorough('Staten Island') === 'STATEN ISLAND', ''));
test('Staten Island - si abbreviation', () => assert(normalizeBorough('si') === 'STATEN ISLAND', ''));
test('Unknown borough throws', () => {
  let threw = false;
  try { normalizeBorough('Westchester'); } catch { threw = true; }
  assert(threw, 'should throw for unknown borough');
});

// ─────────────────────────────────────────────────────────────
section('Street name normalization');
// ─────────────────────────────────────────────────────────────
test('AVE → AVENUE', () =>
  assert(normalizeStreetName('Fifth Ave') === 'FIFTH AVENUE', normalizeStreetName('Fifth Ave')));
test('ST → STREET', () =>
  assert(normalizeStreetName('Main St') === 'MAIN STREET', normalizeStreetName('Main St')));
test('BLVD → BOULEVARD', () =>
  assert(normalizeStreetName('Atlantic Blvd') === 'ATLANTIC BOULEVARD', normalizeStreetName('Atlantic Blvd')));
test('PKWY → PARKWAY', () =>
  assert(normalizeStreetName('Ocean Pkwy') === 'OCEAN PARKWAY', normalizeStreetName('Ocean Pkwy')));
test('RD → ROAD', () =>
  assert(normalizeStreetName('Flatbush Rd') === 'FLATBUSH ROAD', ''));
test('WLK → WALK', () =>
  assert(normalizeStreetName('Oxford Wlk') === 'OXFORD WALK', normalizeStreetName('Oxford Wlk')));
test('WK → WALK', () =>
  assert(normalizeStreetName('Oxford Wk') === 'OXFORD WALK', normalizeStreetName('Oxford Wk')));
test('N → NORTH (at start)', () =>
  assert(normalizeStreetName('N Oxford Walk') === 'NORTH OXFORD WALK', normalizeStreetName('N Oxford Walk')));
test('S → SOUTH (at start)', () =>
  assert(normalizeStreetName('S Broadway') === 'SOUTH BROADWAY', ''));
test('No expansion of mid-word abbr', () =>
  assert(normalizeStreetName('North Oxford Walk') === 'NORTH OXFORD WALK', ''));
test('Multiple spaces collapsed', () =>
  assert(normalizeStreetName('NORTH  OXFORD   WALK') === 'NORTH OXFORD WALK', ''));
test('Lowercase input works', () =>
  assert(normalizeStreetName('north oxford walk') === 'NORTH OXFORD WALK', ''));
test('TPKE → TURNPIKE', () =>
  assert(normalizeStreetName('Jamaica Tpke') === 'JAMAICA TURNPIKE', ''));
test('HWY → HIGHWAY', () =>
  assert(normalizeStreetName('Southern Hwy') === 'SOUTHERN HIGHWAY', ''));

// ─────────────────────────────────────────────────────────────
section('House number normalization');
// ─────────────────────────────────────────────────────────────
test('Basic number', () => assert(normalizeHouseNumber('79') === '79', ''));
test('Queens hyphenated', () => assert(normalizeHouseNumber('42-15') === '42-15', ''));
test('Trims whitespace', () => assert(normalizeHouseNumber('  350  ') === '350', ''));
test('Uppercases', () => assert(normalizeHouseNumber('12a') === '12A', ''));
test('Collapses spaces', () => assert(normalizeHouseNumber('12 A') === '12A', ''));

// ─────────────────────────────────────────────────────────────
section('Full normalizeAddress — test subject: 79 North Oxford Walk');
// ─────────────────────────────────────────────────────────────
test('79 North Oxford Walk, Brooklyn', () => {
  const a = normalizeAddress({ houseNumber: '79', streetName: 'North Oxford Walk', borough: 'Brooklyn' });
  assert(a.houseNumber      === '79',                         `houseNumber: ${a.houseNumber}`);
  assert(a.streetName       === 'NORTH OXFORD WALK',          `streetName: ${a.streetName}`);
  assert(a.borough          === 'BROOKLYN',                   `borough: ${a.borough}`);
  assert(a.normalizedString === '79 NORTH OXFORD WALK, BROOKLYN', `normalizedString: ${a.normalizedString}`);
});
test('Abbreviated form: 79 N Oxford Walk, bk', () => {
  const a = normalizeAddress({ houseNumber: '79', streetName: 'N Oxford Walk', borough: 'bk' });
  assert(a.normalizedString === '79 NORTH OXFORD WALK, BROOKLYN', a.normalizedString);
});
test('Abbrev walk: 79 North Oxford Wlk, Brooklyn', () => {
  const a = normalizeAddress({ houseNumber: '79', streetName: 'North Oxford Wlk', borough: 'Brooklyn' });
  assert(a.normalizedString === '79 NORTH OXFORD WALK, BROOKLYN', a.normalizedString);
});

// ─────────────────────────────────────────────────────────────
section('Socrata WHERE clause generation — per dataset');
// ─────────────────────────────────────────────────────────────
const addr = normalizeAddress({ houseNumber:'79', streetName:'North Oxford Walk', borough:'Brooklyn' });
const esc  = s => s.replace(/'/g, "''");

function whereJobFilings(a)    { return `UPPER(house_no)='${esc(a.houseNumber)}' AND UPPER(street_name) LIKE '${esc(a.streetName)}%' AND UPPER(borough)='${esc(a.borough)}'`; }
function whereLimitedAlts(a)   { return `UPPER(location_house_no)='${esc(a.houseNumber)}' AND UPPER(location_street_name) LIKE '${esc(a.streetName)}%' AND UPPER(location_borough_name)='${esc(a.borough)}'`; }
function whereApproved(a)      { return `UPPER(house_no)='${esc(a.houseNumber)}' AND UPPER(street_name) LIKE '${esc(a.streetName)}%' AND UPPER(borough)='${esc(a.borough)}'`; }
function whereElevator(a)      { return `UPPER(house_number)='${esc(a.houseNumber)}' AND UPPER(street_name) LIKE '${esc(a.streetName)}%' AND UPPER(borough)='${esc(a.borough)}'`; }
function whereLegacy(a)        { return `UPPER(house__)='${esc(a.houseNumber)}' AND UPPER(streetname) LIKE '${esc(a.streetName)}%' AND UPPER(borough)='${esc(a.borough)}'`; }

test('w9ak-ipjd uses house_no', () => {
  const w = whereJobFilings(addr);
  assert(w.includes("UPPER(house_no)='79'"), w);
  assert(w.includes("UPPER(borough)='BROOKLYN'"), w);
  assert(w.includes("LIKE 'NORTH OXFORD WALK%'"), w);
});
test('xxbr-ypig uses location_house_no', () => {
  const w = whereLimitedAlts(addr);
  assert(w.includes("UPPER(location_house_no)='79'"), w);
  assert(w.includes("UPPER(location_borough_name)='BROOKLYN'"), w);
  assert(w.includes("UPPER(location_street_name) LIKE"), w);
});
test('rbx6-tga4 uses house_no', () => {
  const w = whereApproved(addr);
  assert(w.includes("UPPER(house_no)='79'"), w);
});
test('kfp4-dz4h uses house_number (longer form)', () => {
  const w = whereElevator(addr);
  assert(w.includes("UPPER(house_number)='79'"), w);
  assert(!w.includes("house_no"), 'should not use house_no');
});
test('ic3t-wcy2 uses house__ (legacy BIS)', () => {
  const w = whereLegacy(addr);
  assert(w.includes("UPPER(house__)='79'"), w);
  assert(w.includes("UPPER(streetname)"), w); // one word — no underscore
  assert(!w.includes("street_name"), 'should use streetname not street_name');
});
test('SQL injection — single-quote escaped', () => {
  const malicious = normalizeAddress({ houseNumber:"79", streetName:"O'Brien Walk", borough:'Brooklyn' });
  const w = whereJobFilings(malicious);
  // O'Brien street name must have apostrophe doubled to O''BRIEN
  assert(w.includes("O''BRIEN"), `street not doubled-quoted: ${w}`);
  // The escaped value should appear — no raw single ' directly inside a LIKE value
  // i.e.  LIKE 'O''BRIEN WALK%'  not  LIKE 'O'BRIEN WALK%'
  const likeClause = w.match(/LIKE '([^']*(?:''[^']*)*)%'/);
  assert(likeClause !== null, `LIKE clause not found: ${w}`);
  assert(!likeClause[1].replace(/''/g,'').includes("'"), `unescaped quote in LIKE value: ${likeClause[1]}`);
});

// ─────────────────────────────────────────────────────────────
section('Edge cases');
// ─────────────────────────────────────────────────────────────
test('Empty house number throws', () => {
  let threw = false;
  try { normalizeAddress({ houseNumber:'  ', streetName:'Main St', borough:'Brooklyn' }); }
  catch { threw = true; }
  assert(threw, 'should throw for empty house number');
});
test('Empty street throws', () => {
  let threw = false;
  try { normalizeAddress({ houseNumber:'79', streetName:'  ', borough:'Brooklyn' }); }
  catch { threw = true; }
  assert(threw, 'should throw for empty street name');
});
test('Case insensitive borough matching', () => {
  assert(normalizeBorough('BROOKLYN') === 'BROOKLYN', '');
  assert(normalizeBorough('brooklyn') === 'BROOKLYN', '');
  assert(normalizeBorough('BrOoKlYn') === 'BROOKLYN', '');
});

// ─────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(50)}`);
const total = passed + failed;
const pct   = Math.round(passed / total * 100);
console.log(`Results: ${passed}/${total} passed (${pct}%)`);
if (failed > 0) {
  console.error(`\n⚠️  ${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
}
