const fs = require('fs').promises;
const path = require('path');

// Custom error class for application errors
class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Log error to file
const logError = async (error, req = null) => {
  const timestamp = new Date().toISOString();
  const logDir = path.join(__dirname, '../logs');
  
  // Ensure logs directory exists
  try {
    await fs.access(logDir);
  } catch {
    await fs.mkdir(logDir, { recursive: true });
  }
  
  const logEntry = {
    timestamp,
    level: 'ERROR',
    message: error.message,
    stack: error.stack,
    statusCode: error.statusCode || 500,
    code: error.code || null,
    request: req ? {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id || null
    } : null
  };
  
  const logFile = path.join(logDir, `error-${new Date().toISOString().split('T')[0]}.log`);
  
  try {
    await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
  } catch (writeError) {
    console.error('Failed to write error log:', writeError);
  }
};

// Log info/debug messages
const logInfo = async (message, data = null) => {
  const timestamp = new Date().toISOString();
  const logDir = path.join(__dirname, '../logs');
  
  try {
    await fs.access(logDir);
  } catch {
    await fs.mkdir(logDir, { recursive: true });
  }
  
  const logEntry = {
    timestamp,
    level: 'INFO',
    message,
    data
  };
  
  const logFile = path.join(logDir, `app-${new Date().toISOString().split('T')[0]}.log`);
  
  try {
    await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
  } catch (writeError) {
    console.error('Failed to write info log:', writeError);
  }
};

// MongoDB error handler
const handleMongoError = (error) => {
  let message = 'Database error';
  let statusCode = 500;
  let code = null;
  
  if (error.code === 11000) {
    // Duplicate key error
    const field = Object.keys(error.keyValue)[0];
    message = `${field} already exists`;
    statusCode = 400;
    code = 'DUPLICATE_ENTRY';
  } else if (error.name === 'ValidationError') {
    // Mongoose validation error
    const errors = Object.values(error.errors).map(e => e.message);
    message = errors.join(', ');
    statusCode = 400;
    code = 'VALIDATION_ERROR';
  } else if (error.name === 'CastError') {
    // Invalid ObjectId
    message = 'Invalid ID format';
    statusCode = 400;
    code = 'INVALID_ID';
  }
  
  return new AppError(message, statusCode, code);
};

// JWT error handler
const handleJWTError = (error) => {
  if (error.name === 'JsonWebTokenError') {
    return new AppError('Invalid token', 401, 'INVALID_TOKEN');
  } else if (error.name === 'TokenExpiredError') {
    return new AppError('Token expired', 401, 'TOKEN_EXPIRED');
  }
  
  return new AppError('Authentication failed', 401, 'AUTH_ERROR');
};

// File upload error handler
const handleMulterError = (error) => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return new AppError('File too large', 400, 'FILE_TOO_LARGE');
  } else if (error.code === 'LIMIT_FILE_COUNT') {
    return new AppError('Too many files', 400, 'TOO_MANY_FILES');
  } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return new AppError('Unexpected file field', 400, 'UNEXPECTED_FILE');
  }
  
  return new AppError('File upload error', 400, 'UPLOAD_ERROR');
};

// Development error response
const sendErrorDev = (err, res) => {
  res.status(err.statusCode || 500).json({
    success: false,
    error: {
      message: err.message,
      stack: err.stack,
      code: err.code,
      statusCode: err.statusCode
    }
  });
};

// Production error response
const sendErrorProd = (err, res) => {
  // Only send operational errors to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code
    });
  } else {
    // Programming or unknown error: don't leak error details
    console.error('ERROR:', err);
    
    res.status(500).json({
      success: false,
      message: 'Something went wrong',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Global error handling middleware
const errorHandler = async (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  
  // Log error
  await logError(error, req);
  console.error('Error:', err);
  
  // Handle specific error types
  if (err.name === 'ValidationError' || err.code === 11000 || err.name === 'CastError') {
    error = handleMongoError(err);
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    error = handleJWTError(err);
  } else if (err.code && err.code.startsWith('LIMIT_')) {
    error = handleMulterError(err);
  } else if (!err.isOperational) {
    // Convert unknown errors to AppError
    error = new AppError('Internal server error', 500, 'INTERNAL_ERROR');
  }
  
  // Send error response
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, res);
  } else {
    sendErrorProd(error, res);
  }
};

// 404 handler
const notFoundHandler = (req, res, next) => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404, 'NOT_FOUND');
  next(error);
};

// Async error wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Validation error formatter
const formatValidationErrors = (errors) => {
  const formatted = {};
  
  for (const field in errors) {
    if (errors[field].kind === 'required') {
      formatted[field] = `${field} is required`;
    } else if (errors[field].kind === 'minlength') {
      formatted[field] = `${field} must be at least ${errors[field].properties.minlength} characters`;
    } else if (errors[field].kind === 'maxlength') {
      formatted[field] = `${field} must be less than ${errors[field].properties.maxlength} characters`;
    } else {
      formatted[field] = errors[field].message;
    }
  }
  
  return formatted;
};

// API response helper
const sendResponse = (res, statusCode, success, message, data = null, meta = null) => {
  const response = {
    success,
    message
  };
  
  if (data !== null) response.data = data;
  if (meta !== null) response.meta = meta;
  
  res.status(statusCode).json(response);
};

// Success response helper
const sendSuccess = (res, message, data = null, statusCode = 200, meta = null) => {
  sendResponse(res, statusCode, true, message, data, meta);
};

// Error response helper
const sendError = (res, message, statusCode = 500, code = null, data = null) => {
  const response = {
    success: false,
    message
  };
  
  if (code) response.code = code;
  if (data) response.data = data;
  
  res.status(statusCode).json(response);
};

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  logError,
  logInfo,
  formatValidationErrors,
  sendResponse,
  sendSuccess,
  sendError
};