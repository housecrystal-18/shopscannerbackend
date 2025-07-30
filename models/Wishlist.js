const mongoose = require('mongoose');

const WishlistSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Wishlist name is required'],
    trim: true,
    maxlength: [100, 'Wishlist name must be less than 100 characters'],
    default: 'My Wishlist'
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description must be less than 500 characters']
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    targetPrice: {
      type: Number,
      min: 0
    },
    notes: {
      type: String,
      maxlength: [200, 'Notes must be less than 200 characters']
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    }
  }],
  isPublic: {
    type: Boolean,
    default: false
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  sharedWith: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    permission: {
      type: String,
      enum: ['view', 'edit'],
      default: 'view'
    },
    sharedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Compound indexes
WishlistSchema.index({ user: 1, name: 1 });
WishlistSchema.index({ user: 1, isDefault: 1 });
WishlistSchema.index({ 'items.product': 1 });

// Virtual for item count
WishlistSchema.virtual('itemCount').get(function() {
  return this.items.length;
});

// Virtual for total estimated value
WishlistSchema.virtual('totalValue').get(function() {
  return this.items.reduce((total, item) => {
    return total + (item.product?.price?.current || 0);
  }, 0);
});

// Instance method to add item
WishlistSchema.methods.addItem = function(productId, options = {}) {
  // Check if item already exists
  const existingIndex = this.items.findIndex(
    item => item.product.toString() === productId.toString()
  );
  
  if (existingIndex !== -1) {
    // Update existing item
    Object.assign(this.items[existingIndex], options);
  } else {
    // Add new item
    this.items.push({
      product: productId,
      ...options
    });
  }
  
  return this.save();
};

// Instance method to remove item
WishlistSchema.methods.removeItem = function(productId) {
  this.items = this.items.filter(
    item => item.product.toString() !== productId.toString()
  );
  return this.save();
};

// Instance method to clear all items
WishlistSchema.methods.clearItems = function() {
  this.items = [];
  return this.save();
};

// Static method to find user's default wishlist
WishlistSchema.statics.findUserDefault = function(userId) {
  return this.findOne({ user: userId, isDefault: true });
};

// Static method to get or create default wishlist
WishlistSchema.statics.getOrCreateDefault = async function(userId) {
  let defaultWishlist = await this.findUserDefault(userId);
  
  if (!defaultWishlist) {
    defaultWishlist = new this({
      user: userId,
      name: 'My Favorites',
      isDefault: true
    });
    await defaultWishlist.save();
  }
  
  return defaultWishlist;
};

module.exports = mongoose.model('Wishlist', WishlistSchema);