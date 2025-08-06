  const mongoose = require('mongoose');
  const bcrypt = require('bcryptjs');

  const userSchema = new mongoose.Schema({
    // Basic user info
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: function() {
        // Password is only required for local auth (not Google OAuth)
        return this.authProvider === 'local';
      },
      minlength: 6
    },

    // User type and business info
    type: {
      type: String,
      enum: ['consumer', 'business'],
      default: 'consumer'
    },
    businessName: {
      type: String,
      required: function() {
        return this.type === 'business';
      }
    },

    // Profile info
    avatar: {
      type: String,
      default: null
    },
    phone: {
      type: String,
      default: null
    },

    // Authentication & verification
    emailVerified: {
      type: Boolean,
      default: false
    },
    emailVerificationToken: String,
    passwordResetToken: String,
    passwordResetExpires: Date,

    // Google OAuth fields
    googleId: {
      type: String,
      sparse: true,
      unique: true
    },
    authProvider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local'
    },

    // Subscription and preferences
    subscription: {
      type: {
        type: String,
        enum: ['free', 'basic', 'premium'],
        default: 'free'
      },
      status: {
        type: String,
        enum: ['active', 'inactive', 'cancelled'],
        default: 'active'
      },
      startDate: Date,
      endDate: Date
    },

    // Activity tracking
    lastLoginAt: Date,
    isActive: {
      type: Boolean,
      default: true
    }

  }, {
    timestamps: true,
    toJSON: {
      transform: function(doc, ret) {
        delete ret.password;
        delete ret.passwordResetToken;
        delete ret.emailVerificationToken;
        return ret;
      }
    }
  });

  // Index for performance
  userSchema.index({ email: 1 });
  userSchema.index({ googleId: 1 });
  userSchema.index({ type: 1 });

  // Hash password before saving (only for local auth)
  userSchema.pre('save', async function(next) {
    // Only hash password if it's modified and not a Google OAuth user
    if (!this.isModified('password') || this.authProvider === 'google') {
      return next();
    }

    try {
      const salt = await bcrypt.genSalt(12);
      this.password = await bcrypt.hash(this.password, salt);
      next();
    } catch (error) {
      next(error);
    }
  });

  // Compare password method
  userSchema.methods.comparePassword = async function(candidatePassword) {
    // Google OAuth users don't have passwords to compare
    if (this.authProvider === 'google') {
      return false;
    }

    if (!this.password) {
      return false;
    }

    return bcrypt.compare(candidatePassword, this.password);
  };

  // Generate auth token method
  userSchema.methods.generateAuthToken = function() {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      {
        userId: this._id,
        email: this.email,
        type: this.type
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
  };

  module.exports = mongoose.model('User', userSchema);

