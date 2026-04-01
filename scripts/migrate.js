#!/usr/bin/env node
// scripts/migrate.js
// Run: node scripts/migrate.js
// Requires DATABASE_URL environment variable

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL environment variable is not set.');
    console.error('Example: DATABASE_URL=postgresql://user:pass@localhost:5432/nyc_dob_lookup');
    process.exit(1);
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log('🚀 Running schema migration...');
    await client.query(sql);
    console.log('✅ Schema migration complete');

    // Verify tables exist
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('properties', 'searches', 'filings', 'search_filings', 'source_logs')
      ORDER BY table_name
    `);

    console.log('📦 Tables created:');
    result.rows.forEach(r => console.log(`   - ${r.table_name}`));

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
