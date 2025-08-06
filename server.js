 1 -  const { app, startServer } = require('./app');
         1 +  const express = require('express');
         2 +  const mongoose = require('mongoose');
         3 +  const cors = require('cors');
         4 +  const helmet = require('helmet');
         5 +  const morgan = require('morgan');
         6 +  const session = require('express-session');
         7 +  const MongoStore = require('connect-mongo');
         8 +  require('dotenv').config();
         9    // Start the server
        11 -  startServer();
        10   \ No newline at end of file
        11 +  const app = express();
        12 +  // Trust proxy (important for Railway)
        14 +  app.set('trust proxy', 1);
        15 +  // CORS configuration
        17 +  const corsOptions = {
        18 +    origin: function (origin, callback) {
        19 +      const allowedOrigins = 
           + process.env.ALLOWED_ORIGINS?.split(',') || [
        20 +        'http://localhost:3000',
        21 +        'http://localhost:5173',
        22 +        'https://shopscanner-frontend.vercel.app',
        23 +        'https://shopscanner-frontend-ej0brmmwe-shop-scanner.ver
           + cel.app'
        24 +      ];
        25 +      if (!origin) return callback(null, true);
        27 +      
        28 +      if (allowedOrigins.includes(origin)) {
        29 +        callback(null, true);
        30 +      } else {
        31 +        console.log('CORS blocked origin:', origin);
        32 +        callback(new Error('Not allowed by CORS'));
        33 +      }
        34 +    },
        35 +    credentials: true,
        36 +    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 
           + 'OPTIONS'],
        37 +    allowedHeaders: ['Content-Type', 'Authorization', 
           + 'X-Requested-With']
        38 +  };
        39 +  // Middleware
        41 +  app.use(helmet({
        42 +    crossOriginEmbedderPolicy: false,
        43 +  }));
        44 +  app.use(cors(corsOptions));
        45 +  app.use(express.json({ limit: '10mb' }));
        46 +  app.use(express.urlencoded({ extended: true }));
        47 +  app.use(morgan('combined'));
        48 +  // Session configuration (before passport)
        50 +  app.use(session({
        51 +    secret: process.env.SESSION_SECRET || 
           + 'your-super-secret-session-key-change-in-production',
        52 +    resave: false,
        53 +    saveUninitialized: false,
        54 +    store: MongoStore.create({
        55 +      mongoUrl: process.env.MONGODB_URI || 
           + 'mongodb://localhost:27017/shopscanner',
        56 +      touchAfter: 24 * 3600
        57 +    }),
        58 +    cookie: {
        59 +      secure: process.env.NODE_ENV === 'production',
        60 +      httpOnly: true,
        61 +      maxAge: 1000 * 60 * 60 * 24
        62 +    }
        63 +  }));
        64 +  // Initialize Passport (if you have passport config)
        66 +  try {
        67 +    const passport = require('./src/config/passport');
        68 +    app.use(passport.initialize());
        69 +    app.use(passport.session());
        70 +  } catch (err) {
        71 +    console.log('Passport not configured yet');
        72 +  }
        73 +  // Health check endpoint
        75 +  app.get('/health', (req, res) => {
        76 +    res.json({
        77 +      status: 'ok',
        78 +      timestamp: new Date().toISOString(),
        79 +      environment: process.env.NODE_ENV || 'development',
        80 +      version: '1.0.0',
        81 +      googleOAuth: process.env.GOOGLE_CLIENT_ID ? 'Configured' 
     :
           +  'Not configured'
        82 +    });
        83 +  });
        84 +  // API status endpoint
        86 +  app.get('/', (req, res) => {
        87 +    res.json({
        88 +      message: 'Shop Scanner API',
        89 +      version: '1.0.0',
        90 +      status: 'running',
        91 +      endpoints: {
        92 +        auth: '/api/auth',
        93 +        googleAuth: '/api/auth/google',
        94 +        products: '/api/products',
        95 +        users: '/api/users',
        96 +        health: '/health'
        97 +      },
        98 +      features: {
        99 +        googleOAuth: process.env.GOOGLE_CLIENT_ID ? 'Enabled' : 
           + 'Disabled',
       100 +        mongodb: mongoose.connection.readyState === 1 ? 
           + 'Connected' : 'Disconnected'
       101 +      }
       102 +    });
       103 +  });
       104 +  // API Routes
       106 +  try {
       107 +    app.use('/api/auth', require('./src/routes/auth'));
       108 +  } catch (err) {
       109 +    console.log('Auth routes not found, trying alternate 
     path');
       110 +    try {
       111 +      app.use('/api/auth', require('./routes/auth'));
       112 +    } catch (err2) {
       113 +      console.log('Auth routes not configured');
       114 +    }
       115 +  }
       116 +  
       117 +  // Connect to MongoDB
       118 +  mongoose.connect(process.env.MONGODB_URI || 
           + 'mongodb://localhost:27017/shopscanner', {
       119 +    useNewUrlParser: true,
       120 +    useUnifiedTopology: true,
       121 +  }).then(() => {
       122 +    console.log('MongoDB connected successfully');
       123 +  }).catch(err => {
       124 +    console.error('MongoDB connection error:', err);
       125 +  });
       126 +  // 404 handler
       128 +  app.use((req, res) => {
       129 +    res.status(404).json({
       130 +      success: false,
       131 +      message: 'Endpoint not found',
       132 +      path: req.originalUrl
       133 +    });
       134 +  });
       135 + // Error handler
       137 +  app.use((err, req, res, next) => {
       138 +    console.error('Error:', err);
       139 +    res.status(err.status || 500).json({
       140 +      success: false,
       141 +      message: err.message || 'Something went wrong'
       142 +    });
       143 +  });
       144 +  // Start server
       146 +  const PORT = process.env.PORT || 3001;
       147 +  app.listen(PORT, '0.0.0.0', () => {
       148 +    console.log(`Server running on port ${PORT}`);
       149 +    console.log(`Environment: ${process.env.NODE_ENV || 
           + 'development'}`);
       150 +    console.log(`Google OAuth: ${process.env.GOOGLE_CLIENT_ID ? 
           + 'Configured' : 'Not configured'}`);
       151 +  });
       152   \ No newline at end of file

