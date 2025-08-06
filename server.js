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

  app.set('trust proxy', 1);

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        retryAfter: 900
      }
    }
  });

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

  app.use(session({
    secret: process.env.SESSION_SECRET || 'default-session-secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI ||
  'mongodb://localhost:27017/shopscanner'
    }),
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 86400000
    }
  }));

  app.use(passport.initialize());
  app.use(passport.session());

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

  app.use('/auth', require('./src/routes/auth'));
  app.use('/api/auth', require('./src/routes/auth'));

  app.get('/', (req, res) => {
    res.json({
      message: 'Shop Scanner API with Google OAuth',
      version: '1.0.0',
      status: 'operational',
      endpoints: {
        health: '/health',
        auth: '/auth/*',
        googleAuth: '/api/auth/google'
      },
      features: {
        googleOAuth: process.env.GOOGLE_CLIENT_ID ? 'Enabled' : 'Disabled'
      }
    });
  });

  app.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
        path: req.originalUrl
      }
    });
  });

  app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      }
    });
  });

  const startServer = async () => {
    console.log('📦 Database temporarily disabled - using in-memory 
  storage');

    app.listen(PORT, '0.0.0.0', () => {
      console.log('🚀 Shop Scanner API with Google OAuth Started!');
      console.log(`🌐 Server running on port ${PORT}`);
      console.log(`🔐 Google OAuth: ${process.env.GOOGLE_CLIENT_ID ? '✅ 
  Configured' : '❌ Not configured'}`);
    });
  };

  startServer();
