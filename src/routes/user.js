const express = require('express');
const { body, query, validationResult } = require('express-validator');
const router = express.Router();

// Mock data storage
const scanHistory = [];
const priceTracking = [];

// Helper function to generate sample scan data
const generateSampleScan = (id) => ({
  id: `scan_${id}`,
  url: `https://example.com/product/${id}`,
  productName: ['iPhone 15 Pro', 'MacBook Air', 'AirPods Pro', 'iPad Mini', 'Apple Watch'][id % 5],
  authenticity_score: Math.floor(Math.random() * 40) + 60, // 60-100
  price: `$${(Math.random() * 1000 + 99).toFixed(2)}`,
  analysis_data: {
    risk_level: ['low', 'medium'][Math.floor(Math.random() * 2)],
    detected_issues: [],
    recommendations: ['Safe to purchase', 'Compare with other sellers', 'Check seller ratings']
  },
  createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
});

// Helper function to generate sample price tracking data
const generateSamplePriceTracking = (id) => ({
  id: `track_${id}`,
  url: `https://example.com/product/${id}`,
  productName: ['Gaming Laptop', 'Wireless Headphones', 'Smart TV', 'Tablet', 'Smartphone'][id % 5],
  currentPrice: `$${(Math.random() * 500 + 200).toFixed(2)}`,
  targetPrice: `$${(Math.random() * 400 + 150).toFixed(2)}`,
  priceHistory: [
    { date: '2025-07-01', price: `$${(Math.random() * 600 + 250).toFixed(2)}` },
    { date: '2025-08-01', price: `$${(Math.random() * 550 + 200).toFixed(2)}` },
    { date: '2025-08-02', price: `$${(Math.random() * 500 + 200).toFixed(2)}` }
  ],
  createdAt: new Date(Date.now() - Math.random() * 15 * 24 * 60 * 60 * 1000).toISOString()
});

// Initialize with some sample data
for (let i = 1; i <= 10; i++) {
  scanHistory.push(generateSampleScan(i));
  if (i <= 5) {
    priceTracking.push(generateSamplePriceTracking(i));
  }
}

// Get scan history
router.get('/scan-history', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('sortBy').optional().isIn(['createdAt', 'productName', 'authenticity_score']),
  query('order').optional().isIn(['asc', 'desc'])
], (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: errors.array()
        }
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const sortBy = req.query.sortBy || 'createdAt';
    const order = req.query.order || 'desc';
    
    // Sort data
    const sortedScans = [...scanHistory].sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'createdAt') {
        comparison = new Date(a.createdAt) - new Date(b.createdAt);
      } else if (sortBy === 'productName') {
        comparison = a.productName.localeCompare(b.productName);
      } else if (sortBy === 'authenticity_score') {
        comparison = a.authenticity_score - b.authenticity_score;
      }
      return order === 'desc' ? -comparison : comparison;
    });
    
    // Paginate
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedScans = sortedScans.slice(startIndex, endIndex);
    
    const totalPages = Math.ceil(scanHistory.length / limit);
    
    res.json({
      success: true,
      data: {
        scans: paginatedScans,
        pagination: {
          page,
          limit,
          total: scanHistory.length,
          totalPages
        }
      }
    });
  } catch (error) {
    console.error('Get scan history error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve scan history'
      }
    });
  }
});

// Save scan to history
router.post('/scan-history', [
  body('url').isURL(),
  body('productName').trim().isLength({ min: 1 }),
  body('authenticity_score').isInt({ min: 0, max: 100 }),
  body('price').isString(),
  body('analysis_data').optional().isObject()
], (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: errors.array()
        }
      });
    }

    const { url, productName, authenticity_score, price, analysis_data } = req.body;
    
    const newScan = {
      id: `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      url,
      productName,
      authenticity_score,
      price,
      analysis_data: analysis_data || {
        risk_level: authenticity_score > 80 ? 'low' : authenticity_score > 60 ? 'medium' : 'high',
        detected_issues: [],
        recommendations: ['Product analysis completed']
      },
      createdAt: new Date().toISOString()
    };
    
    scanHistory.unshift(newScan); // Add to beginning
    
    // Keep only last 1000 scans to prevent memory issues
    if (scanHistory.length > 1000) {
      scanHistory.splice(1000);
    }
    
    console.log(`📝 Scan saved: ${productName} (score: ${authenticity_score})`);
    
    res.status(201).json({
      success: true,
      data: newScan
    });
  } catch (error) {
    console.error('Save scan history error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to save scan'
      }
    });
  }
});

// Get price tracking
router.get('/price-tracking', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        tracked_products: priceTracking
      }
    });
  } catch (error) {
    console.error('Get price tracking error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve price tracking'
      }
    });
  }
});

// Add price tracking
router.post('/price-tracking', [
  body('url').isURL(),
  body('productName').trim().isLength({ min: 1 }),
  body('currentPrice').isString(),
  body('targetPrice').optional().isString()
], (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: errors.array()
        }
      });
    }

    const { url, productName, currentPrice, targetPrice } = req.body;
    
    const newTracking = {
      id: `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      url,
      productName,
      currentPrice,
      targetPrice: targetPrice || currentPrice,
      priceHistory: [
        { date: new Date().toISOString().split('T')[0], price: currentPrice }
      ],
      createdAt: new Date().toISOString()
    };
    
    priceTracking.unshift(newTracking);
    
    console.log(`📈 Price tracking added: ${productName} at ${currentPrice}`);
    
    res.status(201).json({
      success: true,
      data: newTracking
    });
  } catch (error) {
    console.error('Add price tracking error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to add price tracking'
      }
    });
  }
});

module.exports = router;