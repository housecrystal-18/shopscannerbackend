const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [200, 'Product name must be less than 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description must be less than 2000 characters']
  },
  barcode: {
    type: String,
    trim: true,
    index: true
  },
  upc: {
    type: String,
    trim: true,
    index: true
  },
  sku: {
    type: String,
    trim: true,
    index: true
  },
  brand: {
    type: String,
    trim: true,
    maxlength: [100, 'Brand name must be less than 100 characters']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    index: true
  },
  subcategory: {
    type: String,
    trim: true,
    index: true
  },
  price: {
    current: {
      type: Number,
      required: [true, 'Current price is required'],
      min: [0, 'Price must be positive']
    },
    original: {
      type: Number,
      min: [0, 'Original price must be positive']
    },
    currency: {
      type: String,
      default: 'USD',
      enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY', 'INR', 'BRL', 'MXN']
    }
  },
  authenticity: {
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    verified: {
      type: Boolean,
      default: false
    },
    verifiedAt: Date,
    verificationSource: String,
    flags: [{
      type: String,
      enum: ['suspicious_url', 'price_too_low', 'duplicate_listing', 'fake_reviews', 'poor_images']
    }],
    productType: {
      type: String,
      enum: ['authentic', 'handmade', 'mass_produced', 'dropshipped', 'print_on_demand', 'replica', 'unknown'],
      default: 'unknown'
    },
    sourceUrl: String,
    analysisDate: {
      type: Date,
      default: Date.now
    }
  },
  images: [{
    url: {
      type: String,
      required: true
    },
    alt: String,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  availability: {
    inStock: {
      type: Boolean,
      default: true
    },
    quantity: {
      type: Number,
      min: 0,
      default: 0
    },
    status: {
      type: String,
      enum: ['in_stock', 'out_of_stock', 'limited', 'discontinued'],
      default: 'in_stock'
    }
  },
  seller: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    businessName: String,
    contactInfo: {
      email: String,
      phone: String
    },
    reputation: {
      score: {
        type: Number,
        min: 0,
        max: 100,
        default: 50
      },
      reviewCount: {
        type: Number,
        default: 0
      }
    }
  },
  comparisons: [{
    platform: {
      type: String,
      enum: ['amazon', 'ebay', 'walmart', 'target', 'bestbuy', 'alibaba', 'etsy', 'other']
    },
    url: String,
    price: Number,
    currency: String,
    inStock: Boolean,
    lastChecked: {
      type: Date,
      default: Date.now
    },
    similarity: {
      type: Number,
      min: 0,
      max: 100
    }
  }],
  ratings: {
    average: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    count: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  dimensions: {
    length: Number,
    width: Number,
    height: Number,
    weight: Number,
    unit: {
      type: String,
      enum: ['inches', 'cm', 'mm'],
      default: 'inches'
    },
    weightUnit: {
      type: String,
      enum: ['lbs', 'kg', 'g', 'oz'],
      default: 'lbs'
    }
  },
  specifications: [{
    name: String,
    value: String
  }],
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  location: {
    store: String,
    address: String,
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        index: '2dsphere'
      }
    }
  },
  searchableText: {
    type: String,
    index: 'text'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  featured: {
    type: Boolean,
    default: false
  },
  views: {
    type: Number,
    default: 0
  },
  lastViewedAt: Date,
  priceHistory: [{
    price: Number,
    date: {
      type: Date,
      default: Date.now
    },
    source: String
  }]
}, {
  timestamps: true
});

// Create compound indexes for efficient querying
ProductSchema.index({ category: 1, subcategory: 1 });
ProductSchema.index({ 'seller.userId': 1, isActive: 1 });
ProductSchema.index({ 'price.current': 1, category: 1 });
ProductSchema.index({ createdAt: -1, isActive: 1 });
ProductSchema.index({ 'ratings.average': -1, 'ratings.count': -1 });

// Pre-save middleware to update searchable text
ProductSchema.pre('save', function(next) {
  const searchFields = [
    this.name,
    this.description,
    this.brand,
    this.category,
    this.subcategory,
    this.barcode,
    this.upc,
    this.sku,
    ...(this.tags || [])
  ];
  
  this.searchableText = searchFields
    .filter(field => field)
    .join(' ')
    .toLowerCase();
  
  next();
});

// Virtual for discount percentage
ProductSchema.virtual('discountPercentage').get(function() {
  if (this.price.original && this.price.current < this.price.original) {
    return Math.round(((this.price.original - this.price.current) / this.price.original) * 100);
  }
  return 0;
});

// Virtual for primary image
ProductSchema.virtual('primaryImage').get(function() {
  const primary = this.images.find(img => img.isPrimary);
  return primary || this.images[0];
});

// Static method to find products by category
ProductSchema.statics.findByCategory = function(category, options = {}) {
  const query = { category, isActive: true };
  return this.find(query, null, options);
};

// Static method for price range search
ProductSchema.statics.findByPriceRange = function(min, max, options = {}) {
  const query = {
    'price.current': { $gte: min, $lte: max },
    isActive: true
  };
  return this.find(query, null, options);
};

// Instance method to increment views
ProductSchema.methods.incrementViews = function() {
  this.views += 1;
  this.lastViewedAt = new Date();
  return this.save();
};

// Instance method to add price to history
ProductSchema.methods.addPriceHistory = function(price, source = 'manual') {
  this.priceHistory.push({ price, source });
  if (this.priceHistory.length > 50) {
    this.priceHistory = this.priceHistory.slice(-50);
  }
  return this.save();
};

module.exports = mongoose.model('Product', ProductSchema);