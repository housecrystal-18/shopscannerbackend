 const express = require('express');
  const cors = require('cors');
  const helmet = require('helmet');
  const morgan = require('morgan');
  const rateLimit = require('express-rate-limit');
  const session = require('express-session');
  const MongoStore = require('connect-mongo');
  const passport = require('./src/config/passport');
  require('dotenv').config();

  const app = express();
  const PORT = process.env.PORT || 3001;

  // Trust proxy for Railway
  app.set('trust proxy', 1);

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        retryAfter: 900
      }
    }
  });

  // Middleware
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));

  app.use(cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://shopscannerpro.com',
      'https://www.shopscannerpro.com',
      'https://shopscanner-frontend.vercel.app',
      'https://shopscanner-frontend-ej0brmmwe-shop-scanner.vercel.app'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }));

  app.use(morgan('combined'));
  app.use(limiter);
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Session configuration (before passport)
  app.use(session({
    secret: process.env.SESSION_SECRET ||
  'your-super-secret-session-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI ||
  'mongodb://localhost:27017/shopscanner',
      touchAfter: 24 * 3600 // lazy session update
    }),
    cookie: {
      secure: process.env.NODE_ENV === 'production', // HTTPS only in 
  production
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
  }));

  // Initialize Passport
  app.use(passport.initialize());
  app.use(passport.session());

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'shopscanner-backend',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      googleOAuth: process.env.GOOGLE_CLIENT_ID ? 'Configured' : 'Not 
  configured'
    });
  });

  // Routes - Updated paths
  app.use('/auth', require('./src/routes/auth'));
  app.use('/api/auth', require('./src/routes/auth')); // Add both paths for
   compatibility
  app.use('/subscription', require('./src/routes/subscription'));
  app.use('/user', require('./src/routes/user'));

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      message: 'Shop Scanner API with Google OAuth',
      version: '1.0.0',
      status: 'operational',
      endpoints: {
        health: '/health',
        auth: '/auth/*',
        googleAuth: '/api/auth/google',
        subscription: '/subscription/*',
        user: '/user/*'
      },
      features: {
        googleOAuth: process.env.GOOGLE_CLIENT_ID ? 'Enabled' : 'Disabled'
      }
    });
  });

  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
        path: req.originalUrl,
        availableEndpoints: [
          '/api/auth/google',
          '/api/auth/google/callback',
          '/health'
        ]
      }
    });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error('❌ Error:', err);

    // Handle CORS errors
    if (err.message === 'Not allowed by CORS') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'CORS_ERROR',
          message: 'CORS error: Origin not allowed'
        }
      });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid authentication token'
        }
      });
    }

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Authentication token has expired'
        }
      });
    }

    // Validation errors
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: err.details || err.message
        }
      });
    }

    // Default error
    res.status(err.status || 500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : err.message || 'Internal server error'
      }
    });
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    process.exit(0);
  });

  // Initialize database before starting server
  const startServer = async () => {
    // await initDatabase();
    console.log('📦 Database temporarily disabled - using in-memory 
  storage');

    app.listen(PORT, '0.0.0.0', () => {
      console.log('🚀 Shop Scanner API with Google OAuth Started!');
      console.log(`🌐 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 
  'development'}`);
      console.log(`🔐 Google OAuth: ${process.env.GOOGLE_CLIENT_ID ? '✅ 
  Configured' : '❌ Not configured'}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
    });
  };

  startServer();

