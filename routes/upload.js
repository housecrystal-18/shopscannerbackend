const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
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

// Configure multer for memory storage
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Max 5 files
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'), false);
    }
  }
});

// Helper function to ensure directory exists
const ensureDir = async (dirPath) => {
  try {
    await fs.access(dirPath);
  } catch (error) {
    await fs.mkdir(dirPath, { recursive: true });
  }
};

// Helper function to generate unique filename
const generateFilename = (originalName, suffix = '') => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  const ext = path.extname(originalName);
  const name = path.basename(originalName, ext);
  return `${name}_${timestamp}_${random}${suffix}${ext}`;
};

// POST /api/upload/images - Upload product images
router.post('/images', authenticateToken, upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No images provided'
      });
    }

    const uploadDir = path.join(__dirname, '../uploads/products');
    await ensureDir(uploadDir);

    const processedImages = [];

    for (const file of req.files) {
      try {
        // Generate filenames for different sizes
        const originalFilename = generateFilename(file.originalname);
        const thumbnailFilename = generateFilename(file.originalname, '_thumb');
        const mediumFilename = generateFilename(file.originalname, '_medium');

        // Process original image (optimize but keep full size)
        const originalBuffer = await sharp(file.buffer)
          .jpeg({ quality: 90, progressive: true })
          .png({ quality: 90, progressive: true })
          .webp({ quality: 90 })
          .toBuffer();

        // Create medium size (800x800 max)
        const mediumBuffer = await sharp(file.buffer)
          .resize(800, 800, { 
            fit: 'inside',
            withoutEnlargement: true 
          })
          .jpeg({ quality: 85 })
          .toBuffer();

        // Create thumbnail (200x200 max)
        const thumbnailBuffer = await sharp(file.buffer)
          .resize(200, 200, { 
            fit: 'inside',
            withoutEnlargement: true 
          })
          .jpeg({ quality: 80 })
          .toBuffer();

        // Save files
        const originalPath = path.join(uploadDir, originalFilename);
        const mediumPath = path.join(uploadDir, mediumFilename);
        const thumbnailPath = path.join(uploadDir, thumbnailFilename);

        await Promise.all([
          fs.writeFile(originalPath, originalBuffer),
          fs.writeFile(mediumPath, mediumBuffer),
          fs.writeFile(thumbnailPath, thumbnailBuffer)
        ]);

        // Get image metadata
        const metadata = await sharp(file.buffer).metadata();

        processedImages.push({
          original: {
            url: `/uploads/products/${originalFilename}`,
            filename: originalFilename,
            size: originalBuffer.length,
            width: metadata.width,
            height: metadata.height
          },
          medium: {
            url: `/uploads/products/${mediumFilename}`,
            filename: mediumFilename,
            size: mediumBuffer.length
          },
          thumbnail: {
            url: `/uploads/products/${thumbnailFilename}`,
            filename: thumbnailFilename,
            size: thumbnailBuffer.length
          },
          alt: req.body.alt || `Product image ${processedImages.length + 1}`,
          isPrimary: processedImages.length === 0 // First image is primary by default
        });

      } catch (imageError) {
        console.error('Error processing image:', imageError);
        // Continue with other images if one fails
      }
    }

    if (processedImages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Failed to process any images'
      });
    }

    res.json({
      success: true,
      message: `Successfully uploaded ${processedImages.length} image(s)`,
      data: processedImages
    });

  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload images',
      error: error.message
    });
  }
});

// POST /api/upload/barcode - Upload and process barcode image
router.post('/barcode', authenticateToken, upload.single('barcode'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No barcode image provided'
      });
    }

    const uploadDir = path.join(__dirname, '../uploads/barcodes');
    await ensureDir(uploadDir);

    // Process barcode image for better OCR
    const processedBuffer = await sharp(req.file.buffer)
      .greyscale()
      .normalise()
      .sharpen()
      .png()
      .toBuffer();

    const filename = generateFilename(req.file.originalname);
    const filePath = path.join(uploadDir, filename);
    
    await fs.writeFile(filePath, processedBuffer);

    res.json({
      success: true,
      message: 'Barcode image uploaded successfully',
      data: {
        url: `/uploads/barcodes/${filename}`,
        filename: filename,
        size: processedBuffer.length,
        processedForOCR: true
      }
    });

  } catch (error) {
    console.error('Barcode upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload barcode image',
      error: error.message
    });
  }
});

// DELETE /api/upload/images/:filename - Delete uploaded image
router.delete('/images/:filename', authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Security check - only allow alphanumeric, dots, underscores, and hyphens
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid filename'
      });
    }

    const uploadDir = path.join(__dirname, '../uploads/products');
    const filePath = path.join(uploadDir, filename);

    try {
      await fs.access(filePath);
      await fs.unlink(filePath);
      
      // Also try to delete thumbnail and medium versions
      const ext = path.extname(filename);
      const baseName = path.basename(filename, ext);
      
      const thumbnailName = baseName.replace(/_\d+_[a-z0-9]+$/, '_thumb') + ext;
      const mediumName = baseName.replace(/_\d+_[a-z0-9]+$/, '_medium') + ext;
      
      try {
        await fs.unlink(path.join(uploadDir, thumbnailName));
        await fs.unlink(path.join(uploadDir, mediumName));
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      res.json({
        success: true,
        message: 'Image deleted successfully'
      });

    } catch (fileError) {
      res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }

  } catch (error) {
    console.error('Image deletion error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete image',
      error: error.message
    });
  }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 10MB.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum is 5 images.'
      });
    }
  }
  
  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }

  res.status(500).json({
    success: false,
    message: 'Upload error',
    error: error.message
  });
});

module.exports = router;