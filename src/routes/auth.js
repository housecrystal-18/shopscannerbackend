const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
// const { User } = require('../models/database');
const User = null; // Temporarily disabled
const router = express.Router();

// Fallback to in-memory storage if no database
const users = [];

// Helper function to generate JWT
const generateToken = (userId, email) => {
  return jwt.sign(
    { userId, email },
    process.env.JWT_SECRET || 'fallback_secret_key',
    { expiresIn: '7d' }
  );
};

// Register endpoint
router.post('/register', [
  body('name').trim().isLength({ min: 2 }).escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('selectedPlan').optional().isIn(['free', 'monthly', 'annual'])
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: errors.array()
        }
      });
    }

    const { name, email, password, selectedPlan = 'free' } = req.body;
    
    // Check if database is available
    if (User) {
      // Use database
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'USER_EXISTS',
            message: 'User already exists with this email'
          }
        });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);
      
      // Create user in database
      const user = await User.create({
        name,
        email,
        password: hashedPassword,
        plan: selectedPlan,
        subscriptionStatus: selectedPlan === 'free' ? 'active' : 'trial',
        trialEndsAt: selectedPlan !== 'free' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null,
        subscriptionEndsAt: selectedPlan !== 'free' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null
      });
      
      // Generate JWT
      const token = generateToken(user.id, user.email);
      
      console.log(`✅ User registered in database: ${email} (${selectedPlan} plan)`);
      
      return res.status(201).json({
        success: true,
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            plan: user.plan,
            subscriptionStatus: user.subscriptionStatus,
            trialEndsAt: user.trialEndsAt
          },
          token
        }
      });
    } else {
      // Fallback to in-memory storage
      const existingUser = users.find(u => u.email === email);
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'USER_EXISTS',
            message: 'User already exists with this email'
          }
        });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);
      
      // Create user in memory
      const user = {
        id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        name,
        email,
        password: hashedPassword,
        plan: selectedPlan,
        subscriptionStatus: selectedPlan === 'free' ? 'active' : 'trial',
        trialEndsAt: selectedPlan !== 'free' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null,
        subscriptionEndsAt: selectedPlan !== 'free' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      users.push(user);
    
    // Generate JWT
    const token = generateToken(user.id, user.email);
    
    console.log(`✅ User registered: ${email} (${selectedPlan} plan)`);
    
    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          plan: user.plan,
          subscriptionStatus: user.subscriptionStatus,
          trialEndsAt: user.trialEndsAt
        },
        token
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Registration failed'
      }
    });
  }
});

// Login endpoint
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: errors.array()
        }
      });
    }

    const { email, password } = req.body;
    
    let user;
    
    // Check if database is available
    if (User) {
      // Use database
      user = await User.findOne({ where: { email } });
    } else {
      // Fallback to in-memory storage
      user = users.find(u => u.email === email);
    }
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        }
      });
    }
    
    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        }
      });
    }
    
    // Generate JWT
    const token = generateToken(user.id, user.email);
    
    console.log(`✅ User logged in: ${email}`);
    
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          plan: user.plan,
          subscriptionStatus: user.subscriptionStatus,
          trialEndsAt: user.trialEndsAt,
          subscriptionEndsAt: user.subscriptionEndsAt
        },
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Login failed'
      }
    });
  }
});

// Get current user
router.get('/me', (req, res) => {
  // For now, return a demo user since we don't have auth middleware yet
  // TODO: Add auth middleware to verify JWT token
  res.json({
    success: true,
    data: {
      user: {
        id: 'demo_user_123',
        name: 'Demo User',
        email: 'demo@shopscannerpro.com',
        plan: 'monthly',
        subscriptionStatus: 'active',
        trialEndsAt: null,
        subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    }
  });
});

// Logout (for completeness, though JWT is stateless)
router.post('/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

module.exports = router;