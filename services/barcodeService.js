const axios = require('axios');
const vision = require('@google-cloud/vision');

class BarcodeService {
  constructor() {
    // Initialize Google Cloud Vision client
    this.visionClient = new vision.ImageAnnotatorClient();
    
    // External barcode APIs
    this.apis = {
      upcDatabase: 'https://api.upcitemdb.com/prod/trial/lookup',
      openFoodFacts: 'https://world.openfoodfacts.org/api/v0/product',
      barcodeLookup: process.env.BARCODE_LOOKUP_API_URL
    };
  }

  // Extract barcode from image using Google Cloud Vision
  async extractBarcodeFromImage(imagePath) {
    try {
      const [result] = await this.visionClient.textDetection(imagePath);
      const detections = result.textAnnotations;
      
      if (!detections || detections.length === 0) {
        throw new Error('No text detected in image');
      }

      // Look for barcode patterns in detected text
      const fullText = detections[0].description;
      const barcodePatterns = [
        /\b\d{12,14}\b/g, // UPC/EAN patterns
        /\b\d{8}\b/g,     // EAN-8 pattern
        /\b[0-9A-Z]{6,}\b/g // General alphanumeric codes
      ];

      const potentialBarcodes = [];
      
      for (const pattern of barcodePatterns) {
        const matches = fullText.match(pattern);
        if (matches) {
          potentialBarcodes.push(...matches);
        }
      }

      // Remove duplicates and sort by length (longer codes first)
      const uniqueBarcodes = [...new Set(potentialBarcodes)]
        .sort((a, b) => b.length - a.length);

      if (uniqueBarcodes.length === 0) {
        throw new Error('No barcode patterns found in image');
      }

      return {
        success: true,
        barcodes: uniqueBarcodes,
        primaryBarcode: uniqueBarcodes[0],
        confidence: this.calculateConfidence(uniqueBarcodes[0])
      };

    } catch (error) {
      console.error('Barcode extraction error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Look up product information by barcode
  async lookupProductByBarcode(barcode) {
    try {
      const results = await Promise.allSettled([
        this.lookupUPCDatabase(barcode),
        this.lookupOpenFoodFacts(barcode),
        this.lookupBarcodeLookupAPI(barcode)
      ]);

      const successfulResults = results
        .filter(result => result.status === 'fulfilled' && result.value.success)
        .map(result => result.value.data);

      if (successfulResults.length === 0) {
        return {
          success: false,
          message: 'Product not found in any database',
          barcode
        };
      }

      // Merge results from different sources
      const mergedProduct = this.mergeProductData(successfulResults);

      return {
        success: true,
        data: mergedProduct,
        sources: successfulResults.length,
        barcode
      };

    } catch (error) {
      console.error('Barcode lookup error:', error);
      return {
        success: false,
        error: error.message,
        barcode
      };
    }
  }

  // UPC Item Database lookup
  async lookupUPCDatabase(barcode) {
    try {
      const response = await axios.get(this.apis.upcDatabase, {
        params: { upc: barcode },
        timeout: 5000
      });

      if (response.data.code === 'OK' && response.data.items.length > 0) {
        const item = response.data.items[0];
        return {
          success: true,
          data: {
            name: item.title,
            brand: item.brand,
            category: item.category,
            description: item.description,
            images: item.images ? [{ url: item.images[0], isPrimary: true }] : [],
            upc: item.upc,
            ean: item.ean,
            source: 'upc_database'
          }
        };
      }

      return { success: false, message: 'Product not found in UPC database' };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Open Food Facts lookup
  async lookupOpenFoodFacts(barcode) {
    try {
      const response = await axios.get(`${this.apis.openFoodFacts}/${barcode}.json`, {
        timeout: 5000
      });

      if (response.data.status === 1 && response.data.product) {
        const product = response.data.product;
        return {
          success: true,
          data: {
            name: product.product_name || product.product_name_en,
            brand: product.brands,
            category: product.categories,
            description: product.ingredients_text_en,
            images: product.image_url ? [{ url: product.image_url, isPrimary: true }] : [],
            barcode: product.code,
            nutritionGrade: product.nutrition_grade_fr,
            source: 'open_food_facts'
          }
        };
      }

      return { success: false, message: 'Product not found in Open Food Facts' };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Custom Barcode Lookup API (if configured)
  async lookupBarcodeLookupAPI(barcode) {
    try {
      if (!this.apis.barcodeLookup || !process.env.BARCODE_LOOKUP_API_KEY) {
        return { success: false, message: 'Barcode Lookup API not configured' };
      }

      const response = await axios.get(this.apis.barcodeLookup, {
        params: {
          formatted: 'y',
          code: barcode,
          key: process.env.BARCODE_LOOKUP_API_KEY
        },
        timeout: 5000
      });

      if (response.data.products && response.data.products.length > 0) {
        const product = response.data.products[0];
        return {
          success: true,
          data: {
            name: product.title,
            brand: product.brand,
            category: product.category,
            description: product.description,
            images: product.images ? product.images.map(img => ({ url: img, isPrimary: false })) : [],
            upc: product.barcode_number,
            price: product.stores ? this.extractPriceFromStores(product.stores) : null,
            source: 'barcode_lookup'
          }
        };
      }

      return { success: false, message: 'Product not found in Barcode Lookup API' };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Merge product data from multiple sources
  mergeProductData(results) {
    const merged = {
      name: '',
      brand: '',
      category: '',
      description: '',
      images: [],
      barcodes: [],
      sources: []
    };

    results.forEach(result => {
      // Take the longest/most detailed name
      if (result.name && result.name.length > merged.name.length) {
        merged.name = result.name;
      }

      // Take the first brand found
      if (result.brand && !merged.brand) {
        merged.brand = result.brand;
      }

      // Take the first category found
      if (result.category && !merged.category) {
        merged.category = result.category;
      }

      // Take the longest description
      if (result.description && result.description.length > merged.description.length) {
        merged.description = result.description;
      }

      // Collect all images
      if (result.images) {
        merged.images.push(...result.images);
      }

      // Collect all barcode identifiers
      if (result.upc) merged.barcodes.push({ type: 'upc', value: result.upc });
      if (result.ean) merged.barcodes.push({ type: 'ean', value: result.ean });
      if (result.barcode) merged.barcodes.push({ type: 'barcode', value: result.barcode });

      // Track sources
      if (result.source) {
        merged.sources.push(result.source);
      }

      // Additional fields
      if (result.price) merged.suggestedPrice = result.price;
      if (result.nutritionGrade) merged.nutritionGrade = result.nutritionGrade;
    });

    // Remove duplicate images
    merged.images = merged.images.filter((img, index, self) => 
      index === self.findIndex(i => i.url === img.url)
    );

    // Ensure at least one image is marked as primary
    if (merged.images.length > 0 && !merged.images.some(img => img.isPrimary)) {
      merged.images[0].isPrimary = true;
    }

    return merged;
  }

  // Calculate confidence score for barcode detection
  calculateConfidence(barcode) {
    if (!barcode) return 0;
    
    // Length-based confidence
    let confidence = 0;
    if (barcode.length === 12 || barcode.length === 13) confidence += 40; // UPC/EAN
    else if (barcode.length === 8) confidence += 35; // EAN-8
    else if (barcode.length >= 6) confidence += 20; // Other codes

    // Pattern-based confidence
    if (/^\d+$/.test(barcode)) confidence += 30; // All digits
    else if (/^[0-9A-Z]+$/.test(barcode)) confidence += 20; // Alphanumeric

    // Checksum validation for UPC/EAN (simplified)
    if (barcode.length === 12 || barcode.length === 13) {
      if (this.validateChecksum(barcode)) confidence += 30;
    }

    return Math.min(confidence, 100);
  }

  // Simple checksum validation for UPC/EAN
  validateChecksum(barcode) {
    try {
      const digits = barcode.split('').map(Number);
      const checkDigit = digits.pop();
      
      let sum = 0;
      for (let i = 0; i < digits.length; i++) {
        sum += digits[i] * (i % 2 === 0 ? 1 : 3);
      }
      
      const calculatedCheck = (10 - (sum % 10)) % 10;
      return calculatedCheck === checkDigit;
    } catch (error) {
      return false;
    }
  }

  // Extract price information from store data
  extractPriceFromStores(stores) {
    if (!stores || stores.length === 0) return null;
    
    // Find the first store with price information
    for (const store of stores) {
      if (store.price) {
        return {
          current: parseFloat(store.price),
          currency: 'USD', // Default assumption
          store: store.store_name
        };
      }
    }
    
    return null;
  }

  // Validate barcode format
  isValidBarcode(barcode) {
    if (!barcode || typeof barcode !== 'string') return false;
    
    // Remove spaces and convert to uppercase
    const cleaned = barcode.replace(/\s/g, '').toUpperCase();
    
    // Check common barcode patterns
    const patterns = [
      /^\d{8}$/,        // EAN-8
      /^\d{12}$/,       // UPC-A
      /^\d{13}$/,       // EAN-13
      /^[0-9A-Z]{6,}$/  // General alphanumeric
    ];
    
    return patterns.some(pattern => pattern.test(cleaned));
  }
}

module.exports = new BarcodeService();