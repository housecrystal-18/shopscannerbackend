const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name must be less than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  phone: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: {
      values: ['consumer', 'business'],
      message: 'User type must be consumer or business'
    },
    required: [true, 'User type is required']
  },
  businessName: {
    type: String,
    trim: true
  },
  businessUrl: {
    type: String,
    trim: true
  },
  plan: {
    type: String,
    enum: ['free', 'premium', 'annual'],
    default: 'free'
  },
  usage: {
    monthly: { type: Number, default: 0 },
    limit: { type: Number, default: 2 }
  },
  privacyAgreement: {
    agreed: { type: Boolean, required: true },
    agreedAt: { type: Date, required: true },
    version: { type: String, default: '1.0' }
  },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const rounds = 12;
    this.password = await bcrypt.hash(this.password, rounds);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to check password
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);