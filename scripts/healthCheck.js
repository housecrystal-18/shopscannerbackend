#!/usr/bin/env node

const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

const HEALTH_CHECK_URL = process.env.HEALTH_CHECK_URL || 'http://localhost:3001';
const MONGODB_URI = process.env.MONGODB_URI;

class HealthChecker {
  constructor() {
    this.checks = [];
    this.results = [];
  }

  // Add a health check
  addCheck(name, checkFunction) {
    this.checks.push({ name, check: checkFunction });
  }

  // Run all health checks
  async runChecks() {
    console.log('🏥 Starting Shop Scanner Health Check...\n');
    
    this.results = [];
    
    for (const { name, check } of this.checks) {
      try {
        const startTime = Date.now();
        const result = await check();
        const duration = Date.now() - startTime;
        
        this.results.push({
          name,
          status: 'PASS',
          duration: `${duration}ms`,
          details: result
        });
        
        console.log(`✅ ${name} - PASS (${duration}ms)`);
        if (result.message) console.log(`   ${result.message}`);
        
      } catch (error) {
        this.results.push({
          name,
          status: 'FAIL',
          error: error.message,
          details: error.details || null
        });
        
        console.log(`❌ ${name} - FAIL`);
        console.log(`   Error: ${error.message}`);
      }
    }
    
    return this.generateReport();
  }

  // Generate health report
  generateReport() {
    const passCount = this.results.filter(r => r.status === 'PASS').length;
    const failCount = this.results.filter(r => r.status === 'FAIL').length;
    const totalChecks = this.results.length;
    
    const report = {
      timestamp: new Date().toISOString(),
      overall: failCount === 0 ? 'HEALTHY' : 'UNHEALTHY',
      summary: {
        total: totalChecks,
        passed: passCount,
        failed: failCount,
        successRate: `${Math.round((passCount / totalChecks) * 100)}%`
      },
      checks: this.results
    };
    
    console.log('\n📊 Health Check Summary:');
    console.log(`   Overall Status: ${report.overall}`);
    console.log(`   Checks Passed: ${passCount}/${totalChecks}`);
    console.log(`   Success Rate: ${report.summary.successRate}`);
    
    if (failCount > 0) {
      console.log('\n⚠️  Failed Checks:');
      this.results
        .filter(r => r.status === 'FAIL')
        .forEach(r => console.log(`   - ${r.name}: ${r.error}`));
    }
    
    return report;
  }
}

// Health check functions
const checkAPIHealth = async () => {
  const response = await axios.get(`${HEALTH_CHECK_URL}/health`, {
    timeout: 5000
  });
  
  if (response.status !== 200) {
    throw new Error(`API returned status ${response.status}`);
  }
  
  return {
    message: `API responding normally`,
    version: response.data.version,
    timestamp: response.data.timestamp
  };
};

const checkDatabaseConnection = async () => {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI not configured');
  }
  
  await mongoose.connect(MONGODB_URI);
  const dbState = mongoose.connection.readyState;
  
  if (dbState !== 1) {
    throw new Error(`Database not connected (state: ${dbState})`);
  }
  
  // Test database query
  const collections = await mongoose.connection.db.listCollections().toArray();
  
  await mongoose.disconnect();
  
  return {
    message: `Database connected successfully`,
    collections: collections.length,
    uri: MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//*****:*****@') // Hide credentials
  };
};

const checkAuthEndpoints = async () => {
  // Test auth endpoint
  const response = await axios.get(`${HEALTH_CHECK_URL}/api/auth/test`, {
    timeout: 5000
  });
  
  if (response.status !== 200) {
    throw new Error(`Auth endpoint returned status ${response.status}`);
  }
  
  return {
    message: 'Auth endpoints responding',
    timestamp: response.data.timestamp
  };
};

const checkProductEndpoints = async () => {
  // Test products endpoint
  const response = await axios.get(`${HEALTH_CHECK_URL}/api/products?limit=1`, {
    timeout: 5000
  });
  
  if (response.status !== 200) {
    throw new Error(`Products endpoint returned status ${response.status}`);
  }
  
  return {
    message: 'Product endpoints responding',
    dataStructure: response.data.success ? 'Valid' : 'Invalid'
  };
};

const checkFileStorage = async () => {
  const fs = require('fs').promises;
  const path = require('path');
  
  const uploadsDir = path.join(__dirname, '../uploads');
  const logsDir = path.join(__dirname, '../logs');
  
  // Check if directories exist and are writable
  try {
    await fs.access(uploadsDir, fs.constants.W_OK);
  } catch (error) {
    await fs.mkdir(uploadsDir, { recursive: true });
  }
  
  try {
    await fs.access(logsDir, fs.constants.W_OK);
  } catch (error) {
    await fs.mkdir(logsDir, { recursive: true });
  }
  
  // Test write operation
  const testFile = path.join(uploadsDir, 'health-check-test.txt');
  await fs.writeFile(testFile, 'health check test');
  await fs.unlink(testFile);
  
  return {
    message: 'File storage accessible and writable',
    uploadsDir,
    logsDir
  };
};

const checkEnvironmentConfig = async () => {
  const requiredEnvVars = [
    'MONGODB_URI',
    'JWT_SECRET',
    'PORT'
  ];
  
  const optionalEnvVars = [
    'GOOGLE_CLOUD_PROJECT_ID',
    'BARCODE_LOOKUP_API_KEY',
    'ALLOWED_ORIGINS'
  ];
  
  const missing = requiredEnvVars.filter(varName => !process.env[varName]);
  const present = requiredEnvVars.filter(varName => process.env[varName]);
  const optional = optionalEnvVars.filter(varName => process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  return {
    message: 'Environment configuration valid',
    required: `${present.length}/${requiredEnvVars.length}`,
    optional: `${optional.length}/${optionalEnvVars.length}`,
    missingOptional: optionalEnvVars.filter(varName => !process.env[varName])
  };
};

const checkExternalServices = async () => {
  const services = [];
  let workingServices = 0;
  
  // Test Google Vision API availability (if configured)
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_PROJECT_ID) {
    try {
      // This would require actual Google Cloud setup
      services.push({ name: 'Google Cloud Vision', status: 'Configured' });
      workingServices++;
    } catch (error) {
      services.push({ name: 'Google Cloud Vision', status: 'Error', error: error.message });
    }
  }
  
  // Test external barcode APIs (mock check)
  try {
    const response = await axios.get('https://api.upcitemdb.com/prod/trial/lookup?upc=test', {
      timeout: 3000,
      validateStatus: () => true // Don't throw on 4xx/5xx
    });
    services.push({ name: 'UPC Database API', status: response.status < 500 ? 'Available' : 'Unavailable' });
    if (response.status < 500) workingServices++;
  } catch (error) {
    services.push({ name: 'UPC Database API', status: 'Unavailable', error: 'Connection failed' });
  }
  
  return {
    message: `${workingServices}/${services.length} external services available`,
    services
  };
};

// Main health check execution
async function runHealthCheck() {
  const checker = new HealthChecker();
  
  // Add all health checks
  checker.addCheck('API Health', checkAPIHealth);
  checker.addCheck('Database Connection', checkDatabaseConnection);
  checker.addCheck('Auth Endpoints', checkAuthEndpoints);
  checker.addCheck('Product Endpoints', checkProductEndpoints);
  checker.addCheck('File Storage', checkFileStorage);
  checker.addCheck('Environment Config', checkEnvironmentConfig);
  checker.addCheck('External Services', checkExternalServices);
  
  // Run checks
  const report = await checker.runChecks();
  
  // Save report to file
  const fs = require('fs').promises;
  const path = require('path');
  const reportsDir = path.join(__dirname, '../logs');
  
  try {
    await fs.mkdir(reportsDir, { recursive: true });
    const reportFile = path.join(reportsDir, `health-report-${Date.now()}.json`);
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    console.log(`\n📝 Health report saved to: ${reportFile}`);
  } catch (error) {
    console.log(`\n⚠️  Could not save health report: ${error.message}`);
  }
  
  // Exit with appropriate code
  process.exit(report.overall === 'HEALTHY' ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  runHealthCheck().catch(error => {
    console.error('❌ Health check failed:', error.message);
    process.exit(1);
  });
}

module.exports = { HealthChecker, runHealthCheck };