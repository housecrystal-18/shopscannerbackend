const express = require('express');
const router = express.Router();
const barcodeService = require('../services/barcodeService');
const Product = require('../models/Product');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const path = require('path');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or inactive user'
      });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

// POST /api/barcode/scan - Scan barcode from uploaded image
router.post('/scan', authenticateToken, async (req, res) => {
  try {
    const { imageUrl } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Image URL is required'
      });
    }

    // Convert relative URL to absolute path
    let imagePath;
    if (imageUrl.startsWith('/uploads/')) {
      imagePath = path.join(__dirname, '..', imageUrl);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid image URL format'
      });
    }

    // Extract barcode from image
    const extractionResult = await barcodeService.extractBarcodeFromImage(imagePath);
    
    if (!extractionResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to extract barcode from image',
        error: extractionResult.error
      });
    }

    const { primaryBarcode, barcodes, confidence } = extractionResult;

    // Look up product information
    const lookupResult = await barcodeService.lookupProductByBarcode(primaryBarcode);

    // Check if product exists in our database
    const existingProduct = await Product.findOne({
      $or: [
        { barcode: primaryBarcode },
        { upc: primaryBarcode }
      ],
      isActive: true
    }).populate('seller.userId', 'name businessName');

    res.json({
      success: true,
      data: {
        barcode: primaryBarcode,
        alternativeBarcodes: barcodes.slice(1),
        confidence,
        productInfo: lookupResult.success ? lookupResult.data : null,
        existingProduct: existingProduct || null,
        sources: lookupResult.sources || 0
      }
    });

  } catch (error) {
    console.error('Barcode scan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to scan barcode',
      error: error.message
    });
  }
});

// GET /api/barcode/lookup/:code - Look up product by barcode
router.get('/lookup/:code', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    
    // Validate barcode format
    if (!barcodeService.isValidBarcode(code)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid barcode format'
      });
    }

    // Check our database first
    const existingProduct = await Product.findOne({
      $or: [
        { barcode: code },
        { upc: code }
      ],
      isActive: true
    }).populate('seller.userId', 'name businessName');

    // Look up in external databases
    const lookupResult = await barcodeService.lookupProductByBarcode(code);

    res.json({
      success: true,
      data: {
        barcode: code,
        existingProduct: existingProduct || null,
        productInfo: lookupResult.success ? lookupResult.data : null,
        sources: lookupResult.sources || 0,
        fromDatabase: !!existingProduct
      }
    });

  } catch (error) {
    console.error('Barcode lookup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to lookup barcode',
      error: error.message
    });
  }
});

// POST /api/barcode/create-product - Create product from barcode data
router.post('/create-product', authenticateToken, async (req, res) => {
  try {
    // Check if user can create products
    if (req.user.type !== 'business') {
      return res.status(403).json({
        success: false,
        message: 'Business account required to create products'
      });
    }

    const { 
      barcode, 
      productInfo, 
      customData = {}, 
      priceInfo = {} 
    } = req.body;

    if (!barcode) {
      return res.status(400).json({
        success: false,
        message: 'Barcode is required'
      });
    }

    // Check if product with this barcode already exists
    const existingProduct = await Product.findOne({
      $or: [
        { barcode },
        { upc: barcode }
      ]
    });

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: 'Product with this barcode already exists',
        existingProductId: existingProduct._id
      });
    }

    // Merge external product info with custom data
    const productData = {
      // From external APIs
      name: productInfo?.name || customData.name || 'Unknown Product',
      description: productInfo?.description || customData.description || '',
      brand: productInfo?.brand || customData.brand || '',
      category: productInfo?.category || customData.category || 'General',
      
      // Barcode information
      barcode: barcode,
      upc: productInfo?.barcodes?.find(b => b.type === 'upc')?.value || barcode,
      
      // Price information
      price: {
        current: priceInfo.current || productInfo?.suggestedPrice?.current || 0,
        original: priceInfo.original || productInfo?.suggestedPrice?.current || null,
        currency: priceInfo.currency || 'USD'
      },
      
      // Images from external sources
      images: productInfo?.images?.map(img => ({
        url: img.url,
        alt: img.alt || `${productData.name} image`,
        isPrimary: img.isPrimary || false
      })) || [],
      
      // Seller information
      seller: {
        userId: req.user._id,
        businessName: req.user.businessName,
        contactInfo: {
          email: req.user.email,
          phone: req.user.phone
        }
      },
      
      // Additional data
      availability: {
        inStock: customData.inStock !== false,
        quantity: customData.quantity || 0,
        status: customData.status || 'in_stock'
      },
      
      // Override with any custom data
      ...customData
    };

    // Create the product
    const product = new Product(productData);
    await product.save();

    // Add initial price to history
    await product.addPriceHistory(product.price.current, 'barcode_creation');

    res.status(201).json({
      success: true,
      message: 'Product created successfully from barcode',
      data: product
    });

  } catch (error) {
    console.error('Product creation from barcode error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to create product from barcode',
      error: error.message
    });
  }
});

// GET /api/barcode/validate/:code - Validate barcode format
router.get('/validate/:code', (req, res) => {
  try {
    const { code } = req.params;
    const isValid = barcodeService.isValidBarcode(code);
    
    let details = null;
    if (isValid) {
      const confidence = barcodeService.calculateConfidence(code);
      details = {
        length: code.length,
        type: this.getBarcodeType(code),
        confidence,
        checksumValid: code.length === 12 || code.length === 13 ? 
          barcodeService.validateChecksum(code) : null
      };
    }

    res.json({
      success: true,
      data: {
        barcode: code,
        isValid,
        details
      }
    });

  } catch (error) {
    console.error('Barcode validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate barcode',
      error: error.message
    });
  }
});

// Helper function to determine barcode type
function getBarcodeType(code) {
  const length = code.length;
  
  if (length === 8) return 'EAN-8';
  if (length === 12) return 'UPC-A';
  if (length === 13) return 'EAN-13';
  if (length >= 6 && /^[0-9A-Z]+$/.test(code)) return 'Code128/Code39';
  
  return 'Unknown';
}

// GET /api/barcode/history - Get barcode scan history for user
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    // This would require a scan history model in a real implementation
    // For now, return recent products the user has viewed
    const recentProducts = await Product.find({
      $or: [
        { 'seller.userId': req.user._id },
        { lastViewedAt: { $exists: true } }
      ]
    })
    .sort({ lastViewedAt: -1, createdAt: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit))
    .select('name barcode upc lastViewedAt createdAt');

    res.json({
      success: true,
      data: recentProducts,
      message: 'Scan history retrieved (showing recent product interactions)'
    });

  } catch (error) {
    console.error('Scan history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve scan history',
      error: error.message
    });
  }
});

module.exports = router;