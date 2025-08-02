const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

// Mock subscription data
const subscriptions = new Map();

// Helper function to get or create subscription
const getSubscription = (userId = 'demo_user') => {
  if (!subscriptions.has(userId)) {
    subscriptions.set(userId, {
      userId,
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      usage: {
        scansUsed: Math.floor(Math.random() * 50),
        scansAllowed: -1, // -1 means unlimited
        resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      },
      stripeCustomerId: `cus_demo_${userId}`,
      stripeSubscriptionId: `sub_demo_${userId}`,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }
  return subscriptions.get(userId);
};

// Get subscription details
router.get('/', (req, res) => {
  try {
    // TODO: Get userId from JWT token
    const userId = 'demo_user';
    const subscription = getSubscription(userId);
    
    res.json({
      success: true,
      data: subscription
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve subscription'
      }
    });
  }
});

// Track usage
router.post('/usage', [
  body('feature').isIn(['scan', 'analysis', 'price_tracking']),
  body('metadata').optional().isObject()
], (req, res) => {
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

    const { feature, metadata } = req.body;
    
    // TODO: Get userId from JWT token
    const userId = 'demo_user';
    const subscription = getSubscription(userId);
    
    // Increment usage
    subscription.usage.scansUsed += 1;
    subscription.updatedAt = new Date();
    
    // Log usage
    console.log(`📊 Usage tracked: ${feature} for user ${userId}`);
    if (metadata) {
      console.log(`   Metadata:`, metadata);
    }
    
    res.json({
      success: true,
      data: {
        usage: subscription.usage
      }
    });
  } catch (error) {
    console.error('Track usage error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to track usage'
      }
    });
  }
});

// Upgrade subscription
router.post('/upgrade', [
  body('planId').isIn(['monthly', 'annual']),
  body('paymentMethodId').optional().isString()
], (req, res) => {
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

    const { planId, paymentMethodId } = req.body;
    
    // TODO: Get userId from JWT token
    const userId = 'demo_user';
    const subscription = getSubscription(userId);
    
    // Update subscription
    subscription.plan = planId;
    subscription.status = 'active';
    subscription.currentPeriodEnd = planId === 'annual' 
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    subscription.updatedAt = new Date();
    
    console.log(`💳 Subscription upgraded: ${planId} for user ${userId}`);
    
    res.json({
      success: true,
      data: {
        subscription: {
          plan: subscription.plan,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd
        },
        clientSecret: paymentMethodId ? `pi_demo_${Date.now()}_secret` : null
      }
    });
  } catch (error) {
    console.error('Upgrade subscription error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to upgrade subscription'
      }
    });
  }
});

// Cancel subscription
router.post('/cancel', [
  body('reason').optional().isIn(['too_expensive', 'not_using', 'found_alternative', 'other']),
  body('feedback').optional().isString(),
  body('immediate').optional().isBoolean()
], (req, res) => {
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

    const { reason, feedback, immediate = false } = req.body;
    
    // TODO: Get userId from JWT token
    const userId = 'demo_user';
    const subscription = getSubscription(userId);
    
    if (immediate) {
      subscription.status = 'cancelled';
      subscription.currentPeriodEnd = new Date();
    } else {
      subscription.cancelAtPeriodEnd = true;
    }
    subscription.updatedAt = new Date();
    
    // Log cancellation feedback
    console.log(`❌ Subscription cancellation: ${immediate ? 'immediate' : 'at period end'} for user ${userId}`);
    if (reason) console.log(`   Reason: ${reason}`);
    if (feedback) console.log(`   Feedback: ${feedback}`);
    
    const endDate = subscription.currentPeriodEnd.toLocaleDateString();
    const message = immediate 
      ? 'Subscription cancelled immediately'
      : `Subscription will cancel on ${endDate}`;
    
    res.json({
      success: true,
      data: {
        subscription: {
          plan: subscription.plan,
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          currentPeriodEnd: subscription.currentPeriodEnd
        },
        message
      }
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to cancel subscription'
      }
    });
  }
});

module.exports = router;