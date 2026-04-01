# NYC DOB Filing Lookup

A production-ready web application for searching NYC Department of Buildings (DOB) filing records by property address. Uses **NYC Open Data** as the primary source with optional **Playwright scraping** of the DOB NOW Public Portal for live verification.

---

## Features

- 🔍 **Address search** by house number, street name, and borough
- 📊 **5 Open Data datasets** queried in parallel
  - DOB NOW Build Job Application Filings (`w9ak-ipjd`) — `house_no` column
  - DOB NOW Build Limited Alteration Applications (`xxbr-ypig`) — `location_house_no` column
  - DOB NOW Build Approved Permits (`rbx6-tga4`) — `house_no` column
  - DOB NOW Build Elevator Permit Applications (`kfp4-dz4h`) — `house_number` column
  - Legacy DOB Job Application Filings BIS era (`ic3t-wcy2`) — `house__` column
- 🤖 **Playwright live verification** toggle — scrapes the DOB NOW portal as fallback
- 🔀 **Smart merge** — cross-source deduplication by job/filing number
- 📋 **Expandable rows** with full record details + raw JSON
- 📥 **CSV export**
- 🕐 **Search history** persisted to PostgreSQL
- 🛡️ **Rate limiting** (in-memory, configurable)
- ⚡ Address normalization (abbreviation expansion, borough mapping)

> **Note on column names:** Every DOB NOW dataset uses *different* column names for house
> number, street, and borough. The service layer uses per-dataset WHERE-clause builders
> verified against live CSV exports. Do not share a single query template across datasets.

---

## Tech Stack

| Layer         | Technology               |
|---------------|--------------------------|
| Framework     | Next.js 14 (App Router)  |
| Language      | TypeScript 5             |
| Styling       | Tailwind CSS 3           |
| Validation    | Zod                      |
| Database      | PostgreSQL 14+ / Supabase|
| Scraping      | Playwright (server-only) |
| Data Source   | NYC Open Data (Socrata)  |

---

## Project Structure

```
nyc-dob-lookup/
├── schema.sql                       # PostgreSQL schema
├── .env.example                     # Environment template
├── scripts/
│   └── migrate.js                   # DB migration script
└── src/
    ├── app/
    │   ├── layout.tsx               # Root layout
    │   ├── page.tsx                 # Main dashboard
    │   ├── globals.css              # Global styles
    │   └── api/
    │       ├── search/route.ts      # POST /api/search
    │       ├── export/route.ts      # POST /api/export
    │       └── history/route.ts     # GET  /api/history
    ├── components/
    │   ├── SearchForm.tsx           # Search form with borough select
    │   ├── SummaryCards.tsx         # Result statistics cards
    │   ├── ResultsTable.tsx         # Filterable/sortable table
    │   ├── DetailDrawer.tsx         # Expandable row detail panel
    │   ├── Badges.tsx               # StatusBadge + SourceBadge
    │   ├── LoadingSpinner.tsx       # Spinner + skeleton states
    │   ├── SourceLogsPanel.tsx      # Source query log viewer
    │   ├── SearchHistory.tsx        # Recent searches sidebar
    │   └── ErrorState.tsx           # Error display
    ├── lib/
    │   ├── db.ts                    # PostgreSQL pool
    │   ├── address-normalizer.ts    # Address normalization utilities
    │   ├── rate-limiter.ts          # In-memory rate limiter
    │   └── utils.ts                 # Shared helpers (dates, CSV, etc.)
    ├── services/
    │   ├── open-data.ts             # NYC Open Data (Socrata) service
    │   ├── playwright-scraper.ts    # DOB NOW portal scraper
    │   ├── merge.ts                 # Record merge + dedup logic
    │   └── db-service.ts            # Database persistence layer
    └── types/
        └── index.ts                 # All TypeScript interfaces & types
```

---

## Testing

### Unit tests (no network, no DB)
```bash
npm test
# or: node scripts/test-normalizer.js
```
Runs 47 assertions covering borough normalization, street abbreviation expansion,
house number handling, per-dataset WHERE clause generation, and SQL injection escaping.

### Integration test (live Open Data API)
```bash
# Default: 79 North Oxford Walk, Brooklyn
node scripts/test-search.js

# Custom address
node scripts/test-search.js "350" "Fifth Avenue" "Manhattan"

# With app token (avoids rate limits)
NYC_OPEN_DATA_APP_TOKEN=your_token node scripts/test-search.js "79" "North Oxford Walk" "Brooklyn"
```
Queries all 5 Open Data datasets against the live Socrata API and prints record counts,
field summaries, and request URLs for each.



### Prerequisites

- Node.js 18+
- PostgreSQL 14+ (or a Supabase project)
- npm or yarn

### 1. Clone & Install

```bash
git clone <your-repo-url> nyc-dob-lookup
cd nyc-dob-lookup
npm install
```

### 2. Install Playwright browser

```bash
npm run playwright:install
# or: npx playwright install chromium
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/nyc_dob_lookup

# Optional — get a free token at https://data.cityofnewyork.us/profile/app_tokens
# Without a token, requests are rate-limited to ~1000/hr per IP
NYC_OPEN_DATA_APP_TOKEN=your_token_here

PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_TIMEOUT=30000
```

### 4. Create the database

```bash
# Create the database (if it doesn't exist)
createdb nyc_dob_lookup

# Run migrations
npm run db:migrate
```

For **Supabase**, use the SQL editor to run `schema.sql` directly.

### 5. Start development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Configuration

| Variable                   | Default       | Description                                      |
|----------------------------|---------------|--------------------------------------------------|
| `DATABASE_URL`             | required      | PostgreSQL connection string                     |
| `NYC_OPEN_DATA_APP_TOKEN`  | optional      | Socrata app token (avoids rate limits)           |
| `PLAYWRIGHT_HEADLESS`      | `true`        | Run browser headless                             |
| `PLAYWRIGHT_TIMEOUT`       | `30000`       | Playwright operation timeout (ms)                |
| `PLAYWRIGHT_SCREENSHOT_DIR`| `./tmp/screenshots` | Where to save debug screenshots           |
| `RATE_LIMIT_MAX`           | `20`          | Max requests per IP per window                   |
| `RATE_LIMIT_WINDOW_MS`     | `60000`       | Rate limit window (1 minute default)             |

---

## API Reference

### `POST /api/search`

```json
{
  "houseNumber": "350",
  "streetName": "Fifth Avenue",
  "borough": "Manhattan",
  "liveVerify": false
}
```

**Response:**
```json
{
  "searchId": "uuid",
  "normalizedAddress": {
    "houseNumber": "350",
    "streetName": "FIFTH AVENUE",
    "borough": "MANHATTAN",
    "normalizedString": "350 FIFTH AVENUE, MANHATTAN"
  },
  "filings": [...],
  "summary": {
    "total": 42,
    "openData": 40,
    "livePortal": 2,
    "merged": 2,
    "datasets": [...]
  },
  "logs": [...],
  "durationMs": 1234
}
```

### `POST /api/export`

```json
{
  "filings": [...],
  "filename": "my-export"
}
```

Returns a `text/csv` response with `Content-Disposition: attachment`.

### `GET /api/history?limit=20`

Returns recent search history from the database.

---

## Address Normalization

The normalizer handles:

- Trimming and uppercasing
- Street type expansion: `AVE → AVENUE`, `BLVD → BOULEVARD`, `ST → STREET`, etc.
- Directional expansion: `N → NORTH`, `SW → SOUTHWEST`, etc.
- Borough aliases: `1 → MANHATTAN`, `BK → BROOKLYN`, `SI → STATEN ISLAND`, etc.
- Queens hyphenated addresses: `12-34` preserved as-is

---

## Playwright Notes

- **Server-only**: Playwright only runs inside API routes — never in browser bundles
- **Selectors are resilient**: Multiple fallback selectors per action
- **Screenshots saved** to `PLAYWRIGHT_SCREENSHOT_DIR` on error (and on success for debugging)
- **Retry logic** on DOM interactions
- **Graceful degradation**: If Playwright fails, Open Data results are still returned

The DOB NOW portal uses AngularJS. Selectors target semantic attributes and multiple fallback patterns to survive minor HTML changes.

---

## Database Schema

| Table          | Purpose                                              |
|----------------|------------------------------------------------------|
| `properties`   | Deduplicated property records                        |
| `searches`     | Each user search event with status and result counts |
| `filings`      | Merged filing records per property                   |
| `search_filings`| Junction: which filings appeared in which searches  |
| `source_logs`  | Per-source invocation logs with timing and errors    |

Views: `v_recent_searches`, `v_property_filing_summary`

---

## Future: BIN Search Mode

The architecture supports BIN (Building Identification Number) search. To activate:

1. Add `searchByBin` field to the search request
2. In `open-data.ts`, switch `$where` clause to filter by `bin__=$BIN`
3. In `playwright-scraper.ts`, fill the BIN search tab instead of address tab

---

## Production Deployment

### Environment checklist:
- [ ] Set `DATABASE_URL` to production Postgres / Supabase
- [ ] Set `PLAYWRIGHT_HEADLESS=true`
- [ ] Set `NYC_OPEN_DATA_APP_TOKEN` to avoid Open Data rate limits
- [ ] Configure `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` appropriately
- [ ] **Replace in-memory rate limiter** with Redis for multi-instance deployments

### Playwright in production:
Playwright requires a Chromium binary. On Vercel, use a serverless-compatible solution (e.g., `@sparticuz/chromium`) or deploy the scraper to a standalone Node.js/Docker service.

```bash
npm run build
npm start
```

---

## NYC Open Data Terms

Data provided by the NYC Open Data program under the [NYC Terms of Use](https://www.nyc.gov/home/terms-of-use.page). DOB NOW data is updated regularly but may not reflect real-time building status.
