// ============================================================
// lib/address-normalizer.ts
// Normalize NYC property addresses for consistent querying.
// Each dataset uses DIFFERENT column names — use the per-dataset
// where-clause builder, NOT the generic buildSocrataAddressWhere.
// ============================================================
import type { Borough, NormalizedAddress, RawAddress } from '@/types';

// -----------------------------------------------------------------------
// Borough normalization map
// -----------------------------------------------------------------------
const BOROUGH_MAP: Record<string, Borough> = {
  // Manhattan
  manhattan:       'MANHATTAN',
  mn:              'MANHATTAN',
  'new york':      'MANHATTAN',
  ny:              'MANHATTAN',
  '1':             'MANHATTAN',
  // Bronx
  bronx:           'BRONX',
  bx:              'BRONX',
  'the bronx':     'BRONX',
  '2':             'BRONX',
  // Brooklyn
  brooklyn:        'BROOKLYN',
  bk:              'BROOKLYN',
  bklyn:           'BROOKLYN',
  kings:           'BROOKLYN',
  '3':             'BROOKLYN',
  // Queens
  queens:          'QUEENS',
  qn:              'QUEENS',
  qns:             'QUEENS',
  '4':             'QUEENS',
  // Staten Island
  'staten island': 'STATEN ISLAND',
  'staten isl':    'STATEN ISLAND',
  'staten is':     'STATEN ISLAND',
  si:              'STATEN ISLAND',
  richmond:        'STATEN ISLAND',
  '5':             'STATEN ISLAND',
};

// -----------------------------------------------------------------------
// Street type abbreviation expansions
// -----------------------------------------------------------------------
const STREET_ABBR: Record<string, string> = {
  AVE:  'AVENUE',  AV:   'AVENUE',
  BLVD: 'BOULEVARD', BLV: 'BOULEVARD',
  BR:   'BRIDGE',
  CIR:  'CIRCLE',
  CT:   'COURT',
  DR:   'DRIVE',
  EXPY: 'EXPRESSWAY',
  EXT:  'EXTENSION',
  FWY:  'FREEWAY',
  HWY:  'HIGHWAY',
  HTS:  'HEIGHTS',
  LN:   'LANE',
  PKWY: 'PARKWAY',
  PL:   'PLACE',
  PLZ:  'PLAZA',
  RD:   'ROAD',
  SQ:   'SQUARE',
  ST:   'STREET',
  TER:  'TERRACE', TERR: 'TERRACE',
  TPKE: 'TURNPIKE',
  WAY:  'WAY',    WY: 'WAY',
  XING: 'CROSSING',
  WLK:  'WALK',   WK: 'WALK',
};

const DIR_ABBR: Record<string, string> = {
  N: 'NORTH', S: 'SOUTH', E: 'EAST', W: 'WEST',
  NE: 'NORTHEAST', NW: 'NORTHWEST', SE: 'SOUTHEAST', SW: 'SOUTHWEST',
};

// -----------------------------------------------------------------------
// Borough codes
// -----------------------------------------------------------------------
export const BOROUGH_TO_CODE: Record<Borough, string> = {
  MANHATTAN:       '1',
  BRONX:           '2',
  BROOKLYN:        '3',
  QUEENS:          '4',
  'STATEN ISLAND': '5',
};

// -----------------------------------------------------------------------
// Core normalization
// -----------------------------------------------------------------------
export function normalizeBorough(raw: string): Borough {
  const key = raw.trim().toLowerCase();
  if (BOROUGH_MAP[key]) return BOROUGH_MAP[key];
  for (const [k, v] of Object.entries(BOROUGH_MAP)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  throw new Error(
    `Unknown borough: "${raw}". Expected one of: Manhattan, Bronx, Brooklyn, Queens, "Staten Island"`
  );
}

export function normalizeHouseNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export function normalizeStreetName(raw: string): string {
  const s = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  const parts = s.split(' ');
  return parts
    .map((word, idx) => {
      if (idx === 0 && DIR_ABBR[word]) return DIR_ABBR[word];
      if (idx === parts.length - 1 && STREET_ABBR[word]) return STREET_ABBR[word];
      return word;
    })
    .join(' ');
}

export function normalizeAddress(raw: RawAddress): NormalizedAddress {
  const houseNumber = normalizeHouseNumber(raw.houseNumber);
  const streetName  = normalizeStreetName(raw.streetName);
  const borough     = normalizeBorough(raw.borough);

  if (!houseNumber) throw new Error('House number is required');
  if (!streetName)  throw new Error('Street name is required');

  return {
    houseNumber,
    streetName,
    borough,
    normalizedString: `${houseNumber} ${streetName}, ${borough}`,
  };
}

// -----------------------------------------------------------------------
// SQL single-quote escape
// -----------------------------------------------------------------------
function esc(s: string): string {
  return s.replace(/'/g, "''");
}

// -----------------------------------------------------------------------
// Per-dataset Socrata SODA $where clause builders
//
// IMPORTANT: Every DOB NOW dataset uses different column names.
// Never share a single buildSocrataAddressWhere across datasets.
// -----------------------------------------------------------------------

/**
 * w9ak-ipjd — DOB NOW Build Job Application Filings
 * Address columns: house_no, street_name, borough
 */
export function whereForJobFilings(addr: NormalizedAddress): string {
  return (
    `UPPER(house_no)='${esc(addr.houseNumber)}' AND ` +
    `UPPER(street_name) LIKE '${esc(addr.streetName)}%' AND ` +
    `UPPER(borough)='${esc(addr.borough)}'`
  );
}

/**
 * xxbr-ypig — DOB NOW Build Limited Alteration Applications
 * Address columns: location_house_no, location_street_name, location_borough_name
 */
export function whereForLimitedAlts(addr: NormalizedAddress): string {
  return (
    `UPPER(location_house_no)='${esc(addr.houseNumber)}' AND ` +
    `UPPER(location_street_name) LIKE '${esc(addr.streetName)}%' AND ` +
    `UPPER(location_borough_name)='${esc(addr.borough)}'`
  );
}

/**
 * rbx6-tga4 — DOB NOW Build Approved Permits
 * Address columns: house_no, street_name, borough
 */
export function whereForApprovedPermits(addr: NormalizedAddress): string {
  return (
    `UPPER(house_no)='${esc(addr.houseNumber)}' AND ` +
    `UPPER(street_name) LIKE '${esc(addr.streetName)}%' AND ` +
    `UPPER(borough)='${esc(addr.borough)}'`
  );
}

/**
 * kfp4-dz4h — DOB NOW Build Elevator Permit Applications
 * Address columns: house_number, street_name, borough
 */
export function whereForElevatorPermits(addr: NormalizedAddress): string {
  return (
    `UPPER(house_number)='${esc(addr.houseNumber)}' AND ` +
    `UPPER(street_name) LIKE '${esc(addr.streetName)}%' AND ` +
    `UPPER(borough)='${esc(addr.borough)}'`
  );
}

/**
 * ic3t-wcy2 — Legacy DOB Job Application Filings (BIS era, pre-DOB NOW)
 * Address columns: house__, streetname, borough
 * Note: streetname is one word (no underscore) in this legacy dataset
 */
export function whereForLegacyJobFilings(addr: NormalizedAddress): string {
  return (
    `UPPER(house__)='${esc(addr.houseNumber)}' AND ` +
    `UPPER(streetname) LIKE '${esc(addr.streetName)}%' AND ` +
    `UPPER(borough)='${esc(addr.borough)}'`
  );
}
