const express = require('express');
const router = express.Router();
const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or inactive user'
      });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

// GET /api/wishlist - Get user's wishlists
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { includeItems = 'true' } = req.query;

    let query = Wishlist.find({ user: req.user._id }).sort({ isDefault: -1, createdAt: -1 });
    
    if (includeItems === 'true') {
      query = query.populate({
        path: 'items.product',
        select: 'name brand price images category availability',
        match: { isActive: true }
      });
    }

    const wishlists = await query;

    res.json({
      success: true,
      data: wishlists.map(wishlist => ({
        id: wishlist._id,
        name: wishlist.name,
        description: wishlist.description,
        itemCount: wishlist.itemCount,
        totalValue: includeItems === 'true' ? wishlist.totalValue : undefined,
        isDefault: wishlist.isDefault,
        isPublic: wishlist.isPublic,
        tags: wishlist.tags,
        items: includeItems === 'true' ? wishlist.items : undefined,
        createdAt: wishlist.createdAt,
        updatedAt: wishlist.updatedAt
      }))
    });

  } catch (error) {
    console.error('Wishlist fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wishlists',
      error: error.message
    });
  }
});

// GET /api/wishlist/:id - Get specific wishlist
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const wishlist = await Wishlist.findById(req.params.id)
      .populate({
        path: 'items.product',
        select: 'name brand price images category availability seller',
        match: { isActive: true }
      })
      .populate('user', 'name');

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    // Check if user has access
    const hasAccess = wishlist.user._id.toString() === req.user._id.toString() ||
                     wishlist.isPublic ||
                     wishlist.sharedWith.some(share => share.user.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this wishlist'
      });
    }

    res.json({
      success: true,
      data: {
        id: wishlist._id,
        name: wishlist.name,
        description: wishlist.description,
        owner: wishlist.user.name,
        isOwner: wishlist.user._id.toString() === req.user._id.toString(),
        itemCount: wishlist.itemCount,
        totalValue: wishlist.totalValue,
        isDefault: wishlist.isDefault,
        isPublic: wishlist.isPublic,
        tags: wishlist.tags,
        items: wishlist.items.filter(item => item.product), // Filter out deleted products
        createdAt: wishlist.createdAt,
        updatedAt: wishlist.updatedAt
      }
    });

  } catch (error) {
    console.error('Wishlist fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wishlist',
      error: error.message
    });
  }
});

// POST /api/wishlist - Create new wishlist
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description, isPublic = false, tags = [] } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Wishlist name is required'
      });
    }

    const wishlist = new Wishlist({
      user: req.user._id,
      name: name.trim(),
      description: description?.trim(),
      isPublic,
      tags: tags.map(tag => tag.toLowerCase().trim())
    });

    await wishlist.save();

    res.status(201).json({
      success: true,
      message: 'Wishlist created successfully',
      data: {
        id: wishlist._id,
        name: wishlist.name,
        description: wishlist.description,
        itemCount: 0,
        isDefault: wishlist.isDefault,
        isPublic: wishlist.isPublic,
        tags: wishlist.tags,
        createdAt: wishlist.createdAt
      }
    });

  } catch (error) {
    console.error('Wishlist creation error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to create wishlist',
      error: error.message
    });
  }
});

// PUT /api/wishlist/:id - Update wishlist
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const wishlist = await Wishlist.findById(req.params.id);

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    // Check ownership
    if (wishlist.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this wishlist'
      });
    }

    const { name, description, isPublic, tags } = req.body;

    if (name !== undefined) wishlist.name = name.trim();
    if (description !== undefined) wishlist.description = description?.trim();
    if (isPublic !== undefined) wishlist.isPublic = isPublic;
    if (tags !== undefined) wishlist.tags = tags.map(tag => tag.toLowerCase().trim());

    await wishlist.save();

    res.json({
      success: true,
      message: 'Wishlist updated successfully',
      data: {
        id: wishlist._id,
        name: wishlist.name,
        description: wishlist.description,
        itemCount: wishlist.itemCount,
        isDefault: wishlist.isDefault,
        isPublic: wishlist.isPublic,
        tags: wishlist.tags,
        updatedAt: wishlist.updatedAt
      }
    });

  } catch (error) {
    console.error('Wishlist update error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to update wishlist',
      error: error.message
    });
  }
});

// DELETE /api/wishlist/:id - Delete wishlist
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const wishlist = await Wishlist.findById(req.params.id);

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    // Check ownership
    if (wishlist.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this wishlist'
      });
    }

    // Prevent deletion of default wishlist
    if (wishlist.isDefault) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete default wishlist'
      });
    }

    await Wishlist.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Wishlist deleted successfully'
    });

  } catch (error) {
    console.error('Wishlist deletion error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete wishlist',
      error: error.message
    });
  }
});

// POST /api/wishlist/:id/items - Add item to wishlist
router.post('/:id/items', authenticateToken, async (req, res) => {
  try {
    const { productId, targetPrice, notes, priority = 'medium' } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    // Verify product exists
    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const wishlist = await Wishlist.findById(req.params.id);

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    // Check ownership or edit permission
    const hasEditAccess = wishlist.user.toString() === req.user._id.toString() ||
                         wishlist.sharedWith.some(share => 
                           share.user.toString() === req.user._id.toString() && 
                           share.permission === 'edit'
                         );

    if (!hasEditAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add items to this wishlist'
      });
    }

    await wishlist.addItem(productId, {
      targetPrice,
      notes: notes?.trim(),
      priority
    });

    // Return updated wishlist with the new item populated
    const updatedWishlist = await Wishlist.findById(req.params.id)
      .populate({
        path: 'items.product',
        select: 'name brand price images category'
      });

    const addedItem = updatedWishlist.items.find(
      item => item.product._id.toString() === productId.toString()
    );

    res.status(201).json({
      success: true,
      message: 'Item added to wishlist successfully',
      data: {
        wishlistId: wishlist._id,
        item: addedItem,
        totalItems: updatedWishlist.itemCount
      }
    });

  } catch (error) {
    console.error('Add to wishlist error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to add item to wishlist',
      error: error.message
    });
  }
});

// DELETE /api/wishlist/:id/items/:productId - Remove item from wishlist
router.delete('/:id/items/:productId', authenticateToken, async (req, res) => {
  try {
    const { id: wishlistId, productId } = req.params;

    const wishlist = await Wishlist.findById(wishlistId);

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    // Check ownership or edit permission
    const hasEditAccess = wishlist.user.toString() === req.user._id.toString() ||
                         wishlist.sharedWith.some(share => 
                           share.user.toString() === req.user._id.toString() && 
                           share.permission === 'edit'
                         );

    if (!hasEditAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to remove items from this wishlist'
      });
    }

    await wishlist.removeItem(productId);

    res.json({
      success: true,
      message: 'Item removed from wishlist successfully',
      data: {
        wishlistId: wishlist._id,
        totalItems: wishlist.itemCount
      }
    });

  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove item from wishlist',
      error: error.message
    });
  }
});

// POST /api/wishlist/quick-add - Quick add to default wishlist
router.post('/quick-add', authenticateToken, async (req, res) => {
  try {
    const { productId, targetPrice, notes } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    // Verify product exists
    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Get or create default wishlist
    const wishlist = await Wishlist.getOrCreateDefault(req.user._id);

    await wishlist.addItem(productId, {
      targetPrice,
      notes: notes?.trim()
    });

    res.status(201).json({
      success: true,
      message: 'Item added to favorites successfully',
      data: {
        wishlistId: wishlist._id,
        wishlistName: wishlist.name,
        totalItems: wishlist.itemCount
      }
    });

  } catch (error) {
    console.error('Quick add error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to add item to favorites',
      error: error.message
    });
  }
});

module.exports = router;