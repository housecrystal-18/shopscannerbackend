const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// General API rate limiter
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  }
});

// Strict rate limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 auth requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Upload rate limiter
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 uploads per minute
  message: {
    success: false,
    message: 'Too many upload requests, please slow down',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Barcode scanning rate limiter (more restrictive due to external API costs)
const barcodeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 barcode scans per minute
  message: {
    success: false,
    message: 'Barcode scanning rate limit exceeded, please wait before scanning again',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Price comparison rate limiter (very restrictive due to external scraping)
const priceComparisonLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // Limit each IP to 3 price comparisons per 5 minutes
  message: {
    success: false,
    message: 'Price comparison rate limit exceeded, please wait before trying again',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Security middleware configuration
const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false, // Allow images from external sources
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Custom middleware to add additional security headers
const additionalSecurity = (req, res, next) => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Enable XSS filtering
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Prevent referrer leaking
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Add custom API identifier
  res.setHeader('X-API-Version', '1.0');
  res.setHeader('X-Service', 'ShopScanner-API');
  
  next();
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${req.ip}`);
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
};

// IP whitelist for admin functions
const adminIPWhitelist = ['127.0.0.1', '::1']; // Add your admin IPs here

const adminOnlyByIP = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  
  if (!adminIPWhitelist.includes(clientIP)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied: Admin IP required'
    });
  }
  
  next();
};

// User-based rate limiting (requires authentication)
const createUserRateLimiter = (windowMs, max, message) => {
  const userRequests = new Map();
  
  return (req, res, next) => {
    // Skip if no user (will be handled by IP-based limiting)
    if (!req.user) {
      return next();
    }
    
    const userId = req.user._id.toString();
    const now = Date.now();
    
    if (!userRequests.has(userId)) {
      userRequests.set(userId, []);
    }
    
    const requests = userRequests.get(userId);
    
    // Remove old requests outside window
    const validRequests = requests.filter(time => now - time < windowMs);
    
    if (validRequests.length >= max) {
      return res.status(429).json({
        success: false,
        message: message || 'Rate limit exceeded for this user',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    // Add current request
    validRequests.push(now);
    userRequests.set(userId, validRequests);
    
    next();
  };
};

// Comprehensive input validation middleware
const validateInput = (req, res, next) => {
  // Sanitize common XSS patterns
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  };
  
  // Recursively sanitize object
  const sanitizeObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
      return typeof obj === 'string' ? sanitizeString(obj) : obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  };
  
  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  next();
};

module.exports = {
  generalLimiter,
  authLimiter,
  uploadLimiter,
  barcodeLimiter,
  priceComparisonLimiter,
  securityMiddleware,
  additionalSecurity,
  requestLogger,
  adminOnlyByIP,
  createUserRateLimiter,
  validateInput
};