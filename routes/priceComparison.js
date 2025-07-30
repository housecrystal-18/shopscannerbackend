const express = require('express');
const router = express.Router();
const priceComparisonService = require('../services/priceComparisonService');
const Product = require('../models/Product');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

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

// POST /api/price-comparison/compare/:productId - Compare prices for a product
router.post('/compare/:productId', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const {
      includeRetailers = ['amazon', 'walmart', 'target', 'bestbuy'],
      maxResults = 5,
      timeout = 10000
    } = req.body;

    // Validate product exists
    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Perform price comparison
    const result = await priceComparisonService.compareProductPrices(productId, {
      includeRetailers,
      maxResults,
      timeout
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      message: 'Price comparison completed',
      data: result.data
    });

  } catch (error) {
    console.error('Price comparison error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to compare prices',
      error: error.message
    });
  }
});

// GET /api/price-comparison/history/:productId - Get price history for a product
router.get('/history/:productId', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const { days = 30 } = req.query;

    // Validate product exists
    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const result = await priceComparisonService.getPriceHistory(productId, parseInt(days));

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      message: 'Price history retrieved',
      data: result.data
    });

  } catch (error) {
    console.error('Price history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve price history',
      error: error.message
    });
  }
});

// POST /api/price-comparison/alert - Set price alert for a product
router.post('/alert', authenticateToken, async (req, res) => {
  try {
    const {
      productId,
      targetPrice,
      alertType = 'below', // 'below', 'above', 'exact'
      email = true,
      push = false
    } = req.body;

    // Validate required fields
    if (!productId || !targetPrice) {
      return res.status(400).json({
        success: false,
        message: 'Product ID and target price are required'
      });
    }

    // Validate product exists
    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Validate target price
    if (typeof targetPrice !== 'number' || targetPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Target price must be a positive number'
      });
    }

    const result = await priceComparisonService.setPriceAlert(
      productId,
      req.user._id,
      targetPrice,
      alertType
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json({
      success: true,
      message: 'Price alert set successfully',
      data: result.data
    });

  } catch (error) {
    console.error('Price alert error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set price alert',
      error: error.message
    });
  }
});

// GET /api/price-comparison/trending - Get trending price changes
router.get('/trending', authenticateToken, async (req, res) => {
  try {
    const {
      category,
      trendType = 'decreasing', // 'increasing', 'decreasing', 'volatile'
      limit = 20,
      days = 7
    } = req.query;

    // Build aggregation pipeline to find trending products
    const matchStage = {
      isActive: true,
      priceHistory: { $exists: true, $not: { $size: 0 } }
    };

    if (category) {
      matchStage.category = new RegExp(category, 'i');
    }

    const pipeline = [
      { $match: matchStage },
      {
        $addFields: {
          recentHistory: {
            $filter: {
              input: '$priceHistory',
              cond: {
                $gte: ['$$this.date', new Date(Date.now() - days * 24 * 60 * 60 * 1000)]
              }
            }
          }
        }
      },
      {
        $match: {
          'recentHistory.1': { $exists: true } // At least 2 price points
        }
      },
      {
        $addFields: {
          firstPrice: { $arrayElemAt: ['$recentHistory.price', 0] },
          lastPrice: { $arrayElemAt: ['$recentHistory.price', -1] },
          priceChange: {
            $divide: [
              { $subtract: [{ $arrayElemAt: ['$recentHistory.price', -1] }, { $arrayElemAt: ['$recentHistory.price', 0] }] },
              { $arrayElemAt: ['$recentHistory.price', 0] }
            ]
          }
        }
      }
    ];

    // Add sorting based on trend type
    if (trendType === 'decreasing') {
      pipeline.push({ $match: { priceChange: { $lt: 0 } } });
      pipeline.push({ $sort: { priceChange: 1 } }); // Most decreased first
    } else if (trendType === 'increasing') {
      pipeline.push({ $match: { priceChange: { $gt: 0 } } });
      pipeline.push({ $sort: { priceChange: -1 } }); // Most increased first
    } else if (trendType === 'volatile') {
      pipeline.push({ $sort: { 'recentHistory': -1 } }); // Most price changes
    }

    pipeline.push({ $limit: parseInt(limit) });

    const trendingProducts = await Product.aggregate(pipeline);

    res.json({
      success: true,
      data: trendingProducts.map(product => ({
        id: product._id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        currentPrice: product.price.current,
        priceChange: product.priceChange,
        priceChangePercentage: Math.round(product.priceChange * 100),
        firstPrice: product.firstPrice,
        lastPrice: product.lastPrice,
        images: product.images
      })),
      metadata: {
        trendType,
        days: parseInt(days),
        category: category || 'all'
      }
    });

  } catch (error) {
    console.error('Trending prices error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve trending prices',
      error: error.message
    });
  }
});

// GET /api/price-comparison/deals - Get best deals (products with significant savings)
router.get('/deals', authenticateToken, async (req, res) => {
  try {
    const {
      category,
      minSavings = 10, // Minimum percentage savings
      limit = 20
    } = req.query;

    const matchStage = {
      isActive: true,
      'price.original': { $exists: true, $gt: 0 }
    };

    if (category) {
      matchStage.category = new RegExp(category, 'i');
    }

    const deals = await Product.aggregate([
      { $match: matchStage },
      {
        $addFields: {
          savingsAmount: { $subtract: ['$price.original', '$price.current'] },
          savingsPercentage: {
            $multiply: [
              {
                $divide: [
                  { $subtract: ['$price.original', '$price.current'] },
                  '$price.original'
                ]
              },
              100
            ]
          }
        }
      },
      {
        $match: {
          savingsPercentage: { $gte: parseFloat(minSavings) }
        }
      },
      { $sort: { savingsPercentage: -1 } },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'users',
          localField: 'seller.userId',
          foreignField: '_id',
          as: 'sellerInfo'
        }
      }
    ]);

    res.json({
      success: true,
      data: deals.map(deal => ({
        id: deal._id,
        name: deal.name,
        brand: deal.brand,
        category: deal.category,
        currentPrice: deal.price.current,
        originalPrice: deal.price.original,
        savingsAmount: deal.savingsAmount,
        savingsPercentage: Math.round(deal.savingsPercentage),
        images: deal.images,
        seller: {
          name: deal.sellerInfo[0]?.name,
          businessName: deal.sellerInfo[0]?.businessName
        }
      })),
      metadata: {
        minSavings: parseFloat(minSavings),
        category: category || 'all'
      }
    });

  } catch (error) {
    console.error('Deals error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve deals',
      error: error.message
    });
  }
});

// POST /api/price-comparison/update-price/:productId - Update product price and add to history
router.post('/update-price/:productId', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const { newPrice, source = 'manual' } = req.body;

    // Validate product exists and user owns it (for sellers)
    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if user is the seller or has admin rights
    if (product.seller.userId.toString() !== req.user._id.toString() && req.user.type !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this product price'
      });
    }

    // Validate new price
    if (typeof newPrice !== 'number' || newPrice < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid price is required'
      });
    }

    // Update price and add to history
    const oldPrice = product.price.current;
    product.price.current = newPrice;
    
    // Add to price history
    await product.addPriceHistory(newPrice, source);

    res.json({
      success: true,
      message: 'Product price updated successfully',
      data: {
        productId: product._id,
        oldPrice,
        newPrice,
        priceChange: newPrice - oldPrice,
        priceChangePercentage: oldPrice > 0 ? Math.round(((newPrice - oldPrice) / oldPrice) * 100) : 0
      }
    });

  } catch (error) {
    console.error('Price update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product price',
      error: error.message
    });
  }
});

module.exports = router;