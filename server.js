  1    const express = require('express');
        2 -  const mongoose = require('mongoose');
        2    const cors = require('cors');
        3 -  const helmet = require('helmet');
        4 -  const morgan = require('morgan');
        5 -  const session = require('express-session');
        6 -  const MongoStore = require('connect-mongo');
        7 -  require('dotenv').config();
        3    
        4    const app = express();
        5    
        6 -  // Trust proxy (important for Railway)
        7 -  app.set('trust proxy', 1);
        6 +  app.use(cors());
        7 +  app.use(express.json());
        8    
        9 -  // CORS configuration
       10 -  const corsOptions = {
       11 -    origin: function (origin, callback) {
       12 -      const allowedOrigins = 
          - process.env.ALLOWED_ORIGINS?.split(',') || [
       13 -        'http://localhost:3000',
       14 -        'http://localhost:5173',
       15 -        'https://shopscanner-frontend.vercel.app',
       16 -        
          - 
     'https://shopscanner-frontend-ej0brmmwe-shop-scanner.vercel.app'
       17 -      ];
       18 -      
       19 -      if (!origin) return callback(null, true);
       20 -      
       21 -      if (allowedOrigins.includes(origin)) {
       22 -        callback(null, true);
       23 -      } else {
       24 -        console.log('CORS blocked origin:', origin);
       25 -        callback(new Error('Not allowed by CORS'));
       26 -      }
       27 -    },
       28 -    credentials: true,
       29 -    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 
          - 'OPTIONS'],
       30 -    allowedHeaders: ['Content-Type', 'Authorization', 
          - 'X-Requested-With']
       31 -  };
       32 -  
       33 -  // Middleware
       34 -  app.use(helmet({
       35 -    crossOriginEmbedderPolicy: false,
       36 -  }));
       37 -  app.use(cors(corsOptions));
       38 -  app.use(express.json({ limit: '10mb' }));
       39 -  app.use(express.urlencoded({ extended: true }));
       40 -  app.use(morgan('combined'));
       41 -  
       42 -  // Session configuration (before passport)
       43 -  app.use(session({
       44 -    secret: process.env.SESSION_SECRET || 
          - 'your-super-secret-session-key-change-in-production',
       45 -    resave: false,
       46 -    saveUninitialized: false,
       47 -    store: MongoStore.create({
       48 -      mongoUrl: process.env.MONGODB_URI || 
          - 'mongodb://localhost:27017/shopscanner',
       49 -      touchAfter: 24 * 3600
       50 -    }),
       51 -    cookie: {
       52 -      secure: process.env.NODE_ENV === 'production',
       53 -      httpOnly: true,
       54 -      maxAge: 1000 * 60 * 60 * 24
       55 -    }
       56 -  }));
       57 -  
       58 -  // Initialize Passport (if you have passport config)
       59 -  try {
       60 -    const passport = require('./src/config/passport');
       61 -    app.use(passport.initialize());
       62 -    app.use(passport.session());
       63 -  } catch (err) {
       64 -    console.log('Passport not configured yet');
       65 -  }
       66 -  
       67 -  // Health check endpoint
        9    app.get('/health', (req, res) => {
       10 -    res.json({
       11 -      status: 'ok',
       12 -      timestamp: new Date().toISOString(),
       13 -      environment: process.env.NODE_ENV || 'development',
       14 -      version: '1.0.0',
       15 -      googleOAuth: process.env.GOOGLE_CLIENT_ID ? 'Configured' : 
          - 'Not configured'
       16 -    });
       10 +    res.json({ status: 'ok' });
       11    });
       12    
       13 -  // API status endpoint
       13    app.get('/', (req, res) => {
       14 -    res.json({
       15 -      message: 'Shop Scanner API',
       16 -      version: '1.0.0',
       17 -      status: 'running',
       18 -      endpoints: {
       19 -        auth: '/api/auth',
       20 -        googleAuth: '/api/auth/google',
       21 -        products: '/api/products',
       22 -        users: '/api/users',
       23 -        health: '/health'
       24 -      },
       25 -      features: {
       26 -        googleOAuth: process.env.GOOGLE_CLIENT_ID ? 'Enabled' : 
          - 'Disabled',
       27 -        mongodb: mongoose.connection.readyState === 1 ? 
          - 'Connected' : 'Disconnected'
       28 -      }
       29 -    });
       14 +    res.json({ message: 'Shop Scanner API', status: 'running' 
     });
       15    });
       16    
       17 -  // API Routes
       18 -  try {
       19 -    app.use('/api/auth', require('./src/routes/auth'));
       20 -  } catch (err) {
       21 -    console.log('Auth routes not found, trying alternate path');
       22 -    try {
       23 -      app.use('/api/auth', require('./routes/auth'));
       24 -    } catch (err2) {
       25 -      console.log('Auth routes not configured');
       26 -    }
       27 -  }
       28 -  
       29 -  // Connect to MongoDB
       30 -  mongoose.connect(process.env.MONGODB_URI || 
          - 'mongodb://localhost:27017/shopscanner', {
       31 -    useNewUrlParser: true,
       32 -    useUnifiedTopology: true,
       33 -  }).then(() => {
       34 -    console.log('MongoDB connected successfully');
       35 -  }).catch(err => {
       36 -    console.error('MongoDB connection error:', err);
       37 -  });
       38 -  
       39 -  // 404 handler
       40 -  app.use((req, res) => {
       41 -    res.status(404).json({
       42 -      success: false,
       43 -      message: 'Endpoint not found',
       44 -      path: req.originalUrl
       45 -    });
       46 -  });
       47 -  
       48 -  // Error handler
       49 -  app.use((err, req, res, next) => {
       50 -    console.error('Error:', err);
       51 -    res.status(err.status || 500).json({
       52 -      success: false,
       53 -      message: err.message || 'Something went wrong'
       54 -    });
       55 -  });
       56 -  
       57 -  // Start server
       17    const PORT = process.env.PORT || 3001;
       18 -  app.listen(PORT, '0.0.0.0', () => {
       18 +  app.listen(PORT, () => {
       19      console.log(`Server running on port ${PORT}`);
       20 -    console.log(`Environment: ${process.env.NODE_ENV || 
          - 'development'}`);
       21 -    console.log(`Google OAuth: ${process.env.GOOGLE_CLIENT_ID ? 
          - 'Configured' : 'Not configured'}`);
       20    });
