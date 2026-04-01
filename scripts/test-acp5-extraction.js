#!/usr/bin/env node
// ============================================================
// Test Script: ACP-5 Control Number Extraction
// Usage: node scripts/test-acp5-extraction.js
// ============================================================

const ADDRESS_TEST_CASE = {
  houseNumber: '79',
  streetName: 'North Oxford Walk',
  borough: 'Brooklyn',
  expectedJobNumber: 'B01327203',
  expectedACP5: '31273241',
  expectedCAI: '120831',
};

async function testACP5Extraction() {
  console.log('='.repeat(70));
  console.log('🧪 Testing ACP-5 Control Number Extraction');
  console.log('='.repeat(70));
  console.log();

  // Test 1: Mock Mode (Fast)
  console.log('Test 1: Mock Mode');
  console.log('─'.repeat(70));
  try {
    const mockResponse = await fetch('http://localhost:3000/api/dob/extract-acp5', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...ADDRESS_TEST_CASE,
        mockMode: true,
      }),
    });

    const mockData = await mockResponse.json();
    
    if (mockData.success) {
      console.log('✅ Mock Mode SUCCESS');
      console.log(' Job#:', mockData.extractions[0].jobNumber);
      console.log('  ACP-5:', mockData.extractions[0].acp5ControlNumber);
      console.log('  CAI#:', mockData.extractions[0].caiNumber);
      console.log('  Duration:', mockData.durationMs + 'ms');
    } else {
      console.log('❌ Mock Mode FAILED:', mockData.error);
    }
  } catch (err) {
    console.log('❌ Mock Mode ERROR:', err.message);
  }

  console.log();

  // Test 2: Real Scraping (Slow - requires browser)
  console.log('Test 2: Real Browser Scraping');
  console.log('─'.repeat(70));
  console.log('⚠️  This test uses Playwright and takes 30-60 seconds...');
  console.log();

  try {
    const startTime = Date.now();
    const realResponse = await fetch('http://localhost:3000/api/dob/extract-acp5', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...ADDRESS_TEST_CASE,
        mockMode: false,
        maxFilingsToProcess: 3,
        preferLAAWorkType: true,
      }),
    });

    const realData = await realResponse.json();
    const duration = Date.now() - startTime;

    if (realData.success) {
      console.log('✅ Real Scraping SUCCESS');
      console.log('\n📊 Summary:');
      console.log('  Total filings found:', realData.summary.totalFilingsFound);
      console.log('  Extractions attempted:', realData.summary.extractionsAttempted);
      console.log('  Successfully extracted:', realData.summary.extractionsSuccessful);
      console.log('  With ACP-5:', realData.summary.extractionsWithACP5);
      console.log('  With CAI:', realData.summary.extractionsWithCAI);
      console.log('\n📄 Filing Details:');
      
      realData.jobFilings.slice(0, 5).forEach((filing, i) => {
        console.log(`  ${i + 1}. Job# ${filing.jobNumber} - ${filing.workType || 'N/A'} - ${filing.filingStatus || 'N/A'}`);
      });

      console.log('\n🎯 Extracted ACP-5 Control Numbers:');
      realData.extractions.forEach((ext, i) => {
        console.log(`  ${i + 1}. Job# ${ext.jobNumber}`);
        if (ext.acp5ControlNumber) {
          console.log(`     ACP-5: ${ext.acp5ControlNumber}`);
        }
        if (ext.caiNumber) {
          console.log(`     CAI#: ${ext.caiNumber}`);
        }
        if (ext.error) {
          console.log(`     Error: ${ext.error}`);
        }
      });

      console.log('\n⏱️  Duration:', duration + 'ms');
      console.log('📸 Screenshots saved to:', 'tmp/screenshots/');
      
    } else {
      console.log('❌ Real Scraping FAILED:', realData.error);
    }
  } catch (err) {
    console.log('❌ Real Scraping ERROR:', err.message);
  }

  console.log();

  // Test 3: Retrieve Stored Extractions
  console.log('Test 3:  Retrieve Stored Extractions from Database');
  console.log('─'.repeat(70));
  try {
    const getResponse = await fetch(
      `http://localhost:3000/api/dob/extract-acp5?jobNumber=${ADDRESS_TEST_CASE.expectedJobNumber}`,
      { method: 'GET' }
    );

    const getData = await getResponse.json();

    if (getData.success && getData.extractions.length > 0) {
      console.log('✅ Retrieved', getData.count, 'stored extraction(s)');
      const latest = getData.extractions[0];
      console.log('  Job#:', latest.job_number);
      console.log('  ACP-5:', latest.acp5_control_number || 'N/A');
      console.log('  CAI#:', latest.cai_number || 'N/A');
      console.log('  Status:', latest.retrieval_status);
      console.log('  Extracted:', latest.extracted_at || 'N/A');
    } else {
      console.log('ℹ️  No stored extractions found (run Test 2 first)');
    }
  } catch (err) {
    console.log('❌ Retrieval ERROR:', err.message);
  }

  console.log();
  console.log('='.repeat(70));
  console.log('✅ All Tests Complete');
  console.log('='.repeat(70));
}

// Run tests
testACP5Extraction().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
