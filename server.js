const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

// Import security middleware
const {
  generalLimiter,
  authLimiter,
  uploadLimiter,
  barcodeLimiter,
  priceComparisonLimiter,
  securityMiddleware,
  additionalSecurity,
  requestLogger,
  validateInput
} = require('./middleware/rateLimiter');

const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(securityMiddleware);
app.use(additionalSecurity);

// Request logging
app.use(requestLogger);

// General rate limiting
app.use(generalLimiter);

// Input validation and sanitization
app.use(validateInput);

// Basic middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Database connection
mongoose.connect(process.env.MONGODB_URI)
.then(() => {
  console.log('✅ Connected to MongoDB');
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Shop Scanner API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Registration endpoint with rate limiting
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const User = require('./models/User');
    const jwt = require('jsonwebtoken');
    
    const { name, email, password, type } = req.body;

    // Basic validation
    if (!name || !email || !password || !type) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, and type are required'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create new user
    const user = new User({
      name,
      email,
      password,
      type,
      privacyAgreement: {
        agreed: true,
        agreedAt: new Date(),
        version: '1.0'
      }
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        type: user.type
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

// Login endpoint with rate limiting
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const User = require('./models/User');
    const jwt = require('jsonwebtoken');
    
    const { email, password } = req.body;

    // Basic validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user and include password field
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        type: user.type,
        plan: user.plan
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

// Routes
const productRoutes = require('./routes/products');
const uploadRoutes = require('./routes/upload');
const barcodeRoutes = require('./routes/barcode');
const priceComparisonRoutes = require('./routes/priceComparison');
const wishlistRoutes = require('./routes/wishlist');
app.use('/api/products', productRoutes);
app.use('/api/upload', uploadLimiter, uploadRoutes);
app.use('/api/barcode', barcodeLimiter, barcodeRoutes);
app.use('/api/price-comparison', priceComparisonLimiter, priceComparisonRoutes);
app.use('/api/wishlist', wishlistRoutes);

// Serve uploaded files statically
app.use('/uploads', express.static('uploads'));

// Test endpoints (must come before error handlers)
app.get('/api/auth/test', (req, res) => {
  res.json({ message: 'Auth service online', timestamp: new Date() });
});

app.get('/api/database/test', (req, res) => {
  const dbState = mongoose.connection.readyState;
  res.json({
    success: dbState === 1,
    message: dbState === 1 ? 'Database connected' : 'Database not connected',
    state: dbState
  });
});

// Error handling
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log('🚀 Shop Scanner API Server Started');
  console.log(`📡 Server running on port ${PORT}`);
  console.log('📋 Available endpoints:');
  console.log('   GET  /health');
  console.log('   POST /api/auth/register');
  console.log('   POST /api/auth/login');
  console.log('   GET  /api/auth/test');
  console.log('   GET  /api/database/test');
  console.log('   GET  /api/products');
  console.log('   POST /api/products');
  console.log('   GET  /api/products/:id');
  console.log('   PUT  /api/products/:id');
  console.log('   DELETE /api/products/:id');
  console.log('========================');
});
