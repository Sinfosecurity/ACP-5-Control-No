#!/usr/bin/env node
// Quick check script for Railway deployment
const https = require('https');

const url = process.env.RAILWAY_STATIC_URL || 
            process.env.NEXT_PUBLIC_APP_URL || 
            'http://localhost:3000';

const healthUrl = `${url}/api/health`;

console.log(`🔍 Checking health endpoint: ${healthUrl}`);

const makeRequest = (url) => {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : require('http');
    lib.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, data });
      });
    }).on('error', reject);
  });
};

makeRequest(healthUrl)
  .then(({ statusCode, data }) => {
    if (statusCode === 200) {
      console.log('✅ Health check passed!');
      console.log('Response:', data);
      process.exit(0);
    } else {
      console.log(`❌ Health check failed with status ${statusCode}`);
      console.log('Response:', data);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.log('❌ Health check failed:', err.message);
    process.exit(1);
  });
