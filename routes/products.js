const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

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

// Middleware to check if user is business type (can create products)
const requireBusiness = (req, res, next) => {
  if (req.user.type !== 'business') {
    return res.status(403).json({
      success: false,
      message: 'Business account required to create products'
    });
  }
  next();
};

// GET /api/products - Get all products with filtering
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      subcategory,
      minPrice,
      maxPrice,
      brand,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      inStock,
      featured
    } = req.query;

    // Build query
    const query = { isActive: true };
    
    if (category) query.category = new RegExp(category, 'i');
    if (subcategory) query.subcategory = new RegExp(subcategory, 'i');
    if (brand) query.brand = new RegExp(brand, 'i');
    if (inStock === 'true') query['availability.inStock'] = true;
    if (featured === 'true') query.featured = true;
    
    if (minPrice || maxPrice) {
      query['price.current'] = {};
      if (minPrice) query['price.current'].$gte = parseFloat(minPrice);
      if (maxPrice) query['price.current'].$lte = parseFloat(maxPrice);
    }
    
    if (search) {
      query.$text = { $search: search };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const products = await Product.find(query)
      .populate('seller.userId', 'name businessName')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(query);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      data: products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Products fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
});

// GET /api/products/seller/mine - Get current user's products (must come before /:id)
router.get('/seller/mine', authenticateToken, requireBusiness, async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'all' } = req.query;

    const query = { 'seller.userId': req.user._id };
    
    if (status === 'active') query.isActive = true;
    if (status === 'inactive') query.isActive = false;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(query);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      data: products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages
      }
    });

  } catch (error) {
    console.error('User products fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your products',
      error: error.message
    });
  }
});

// GET /api/products/meta/categories - Get all categories (must come before /:id)
router.get('/meta/categories', async (req, res) => {
  try {
    const categories = await Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: categories.map(cat => ({
        name: cat._id,
        count: cat.count
      }))
    });

  } catch (error) {
    console.error('Categories fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
});

// GET /api/products/barcode/:code - Find product by barcode (must come before /:id)
router.get('/barcode/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const product = await Product.findOne({
      $or: [
        { barcode: code },
        { upc: code }
      ],
      isActive: true
    }).populate('seller.userId', 'name businessName');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found with this barcode'
      });
    }

    res.json({
      success: true,
      data: product
    });

  } catch (error) {
    console.error('Barcode search error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search by barcode',
      error: error.message
    });
  }
});

// GET /api/products/:id - Get single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('seller.userId', 'name businessName');

    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Increment views
    await product.incrementViews();

    res.json({
      success: true,
      data: product
    });

  } catch (error) {
    console.error('Product fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product',
      error: error.message
    });
  }
});

// POST /api/products - Create new product
router.post('/', authenticateToken, requireBusiness, async (req, res) => {
  try {
    const productData = {
      ...req.body,
      seller: {
        userId: req.user._id,
        businessName: req.user.businessName,
        contactInfo: {
          email: req.user.email,
          phone: req.user.phone
        }
      }
    };

    const product = new Product(productData);
    await product.save();

    // Add initial price to history
    await product.addPriceHistory(product.price.current, 'initial');

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });

  } catch (error) {
    console.error('Product creation error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to create product',
      error: error.message
    });
  }
});

// PUT /api/products/:id - Update product
router.put('/:id', authenticateToken, requireBusiness, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if user owns this product
    if (product.seller.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this product'
      });
    }

    // Track price changes
    const oldPrice = product.price.current;
    const newPrice = req.body.price?.current;

    // Update product
    Object.assign(product, req.body);
    await product.save();

    // Add price history if price changed
    if (newPrice && newPrice !== oldPrice) {
      await product.addPriceHistory(newPrice, 'update');
    }

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: product
    });

  } catch (error) {
    console.error('Product update error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to update product',
      error: error.message
    });
  }
});

// DELETE /api/products/:id - Delete product (soft delete)
router.delete('/:id', authenticateToken, requireBusiness, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if user owns this product
    if (product.seller.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this product'
      });
    }

    // Soft delete
    product.isActive = false;
    await product.save();

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (error) {
    console.error('Product deletion error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: error.message
    });
  }
});


module.exports = router;