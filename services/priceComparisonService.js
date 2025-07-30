const axios = require('axios');
const cheerio = require('cheerio');
const Product = require('../models/Product');

class PriceComparisonService {
  constructor() {
    this.retailers = {
      amazon: {
        name: 'Amazon',
        baseUrl: 'https://www.amazon.com',
        searchUrl: 'https://www.amazon.com/s?k=',
        enabled: true
      },
      walmart: {
        name: 'Walmart',
        baseUrl: 'https://www.walmart.com',
        searchUrl: 'https://www.walmart.com/search?q=',
        enabled: true
      },
      target: {
        name: 'Target',
        baseUrl: 'https://www.target.com',
        searchUrl: 'https://www.target.com/s?searchTerm=',
        enabled: true
      },
      bestbuy: {
        name: 'Best Buy',
        baseUrl: 'https://www.bestbuy.com',
        searchUrl: 'https://www.bestbuy.com/site/searchpage.jsp?st=',
        enabled: true
      }
    };
    
    this.rateLimits = {
      maxRequests: 10,
      timeWindow: 60000, // 1 minute
      requestCounts: new Map()
    };
  }

  // Main price comparison function
  async compareProductPrices(productId, options = {}) {
    try {
      const product = await Product.findById(productId);
      if (!product) {
        throw new Error('Product not found');
      }

      const {
        includeRetailers = Object.keys(this.retailers),
        maxResults = 5,
        timeout = 10000
      } = options;

      // Check rate limits
      if (!this.checkRateLimit()) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }

      // Search for product across retailers
      const searchPromises = includeRetailers
        .filter(retailer => this.retailers[retailer]?.enabled)
        .map(retailer => this.searchRetailer(retailer, product, { maxResults, timeout }));

      const results = await Promise.allSettled(searchPromises);
      
      // Process results
      const priceComparisons = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success) {
          priceComparisons.push(...result.value.data);
        }
      });

      // Sort by price (lowest first)
      priceComparisons.sort((a, b) => a.price - b.price);

      // Calculate savings compared to current product price
      const currentPrice = product.price.current;
      const bestPrice = priceComparisons.length > 0 ? priceComparisons[0].price : null;
      const savings = bestPrice && bestPrice < currentPrice ? currentPrice - bestPrice : 0;

      return {
        success: true,
        data: {
          product: {
            id: product._id,
            name: product.name,
            currentPrice: currentPrice,
            currency: product.price.currency
          },
          comparisons: priceComparisons.slice(0, maxResults),
          bestPrice,
          savings,
          savingsPercentage: savings > 0 ? Math.round((savings / currentPrice) * 100) : 0,
          searchedRetailers: includeRetailers.length,
          timestamp: new Date()
        }
      };

    } catch (error) {
      console.error('Price comparison error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Search a specific retailer for product prices
  async searchRetailer(retailerKey, product, options = {}) {
    try {
      const retailer = this.retailers[retailerKey];
      if (!retailer || !retailer.enabled) {
        return { success: false, error: 'Retailer not available' };
      }

      const { maxResults = 5, timeout = 10000 } = options;
      
      // Build search query
      const searchQuery = this.buildSearchQuery(product);
      const searchUrl = retailer.searchUrl + encodeURIComponent(searchQuery);

      // Make request with user agent to avoid blocking
      const response = await axios.get(searchUrl, {
        timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        }
      });

      // Parse results based on retailer
      const results = await this.parseRetailerResults(retailerKey, response.data, product, maxResults);

      return {
        success: true,
        data: results,
        retailer: retailer.name
      };

    } catch (error) {
      console.error(`Error searching ${retailerKey}:`, error.message);
      return {
        success: false,
        error: error.message,
        retailer: this.retailers[retailerKey]?.name
      };
    }
  }

  // Parse results from different retailers
  async parseRetailerResults(retailerKey, html, product, maxResults) {
    const $ = cheerio.load(html);
    const results = [];

    try {
      switch (retailerKey) {
        case 'amazon':
          results.push(...this.parseAmazonResults($, product, maxResults));
          break;
        case 'walmart':
          results.push(...this.parseWalmartResults($, product, maxResults));
          break;
        case 'target':
          results.push(...this.parseTargetResults($, product, maxResults));
          break;
        case 'bestbuy':
          results.push(...this.parseBestBuyResults($, product, maxResults));
          break;
        default:
          console.warn(`No parser implemented for ${retailerKey}`);
      }
    } catch (parseError) {
      console.error(`Error parsing ${retailerKey} results:`, parseError);
    }

    return results;
  }

  // Amazon result parser
  parseAmazonResults($, product, maxResults) {
    const results = [];
    
    $('[data-component-type="s-search-result"]').slice(0, maxResults).each((i, element) => {
      try {
        const $item = $(element);
        const title = $item.find('h2 a span').text().trim();
        const priceWhole = $item.find('.a-price-whole').first().text().replace(/[^\d]/g, '');
        const priceFraction = $item.find('.a-price-fraction').first().text().replace(/[^\d]/g, '');
        const link = $item.find('h2 a').attr('href');
        const image = $item.find('img').attr('src');

        if (title && priceWhole && this.isRelevantMatch(title, product)) {
          const price = parseFloat(`${priceWhole}.${priceFraction || '00'}`);
          
          results.push({
            retailer: 'Amazon',
            title: title,
            price: price,
            currency: 'USD',
            url: link ? `https://www.amazon.com${link}` : null,
            image: image,
            availability: 'Available',
            confidence: this.calculateMatchConfidence(title, product)
          });
        }
      } catch (itemError) {
        console.error('Error parsing Amazon item:', itemError);
      }
    });

    return results;
  }

  // Walmart result parser
  parseWalmartResults($, product, maxResults) {
    const results = [];
    
    $('[data-automation-id="product-title"]').slice(0, maxResults).each((i, element) => {
      try {
        const $item = $(element).closest('[data-testid="item-stack"]');
        const title = $(element).text().trim();
        const priceElement = $item.find('[itemprop="price"]');
        const price = parseFloat(priceElement.attr('content') || priceElement.text().replace(/[^\d.]/g, ''));
        const link = $item.find('a').attr('href');
        const image = $item.find('img').attr('src');

        if (title && price && this.isRelevantMatch(title, product)) {
          results.push({
            retailer: 'Walmart',
            title: title,
            price: price,
            currency: 'USD',
            url: link ? `https://www.walmart.com${link}` : null,
            image: image,
            availability: 'Available',
            confidence: this.calculateMatchConfidence(title, product)
          });
        }
      } catch (itemError) {
        console.error('Error parsing Walmart item:', itemError);
      }
    });

    return results;
  }

  // Target result parser (simplified - actual implementation would need more specific selectors)
  parseTargetResults($, product, maxResults) {
    const results = [];
    // Target's structure is more complex and may require different approach
    // This is a placeholder implementation
    return results;
  }

  // Best Buy result parser (simplified)
  parseBestBuyResults($, product, maxResults) {
    const results = [];
    // Best Buy's structure varies and may require different approach
    // This is a placeholder implementation
    return results;
  }

  // Build search query from product data
  buildSearchQuery(product) {
    const queryParts = [];
    
    if (product.brand) queryParts.push(product.brand);
    if (product.name) queryParts.push(product.name);
    if (product.upc || product.barcode) queryParts.push(product.upc || product.barcode);

    return queryParts.join(' ').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Check if a search result is relevant to the product
  isRelevantMatch(title, product) {
    const titleLower = title.toLowerCase();
    const productName = product.name.toLowerCase();
    const productBrand = (product.brand || '').toLowerCase();

    // Check if title contains significant parts of product name or brand
    const nameWords = productName.split(' ').filter(word => word.length > 2);
    const matchingWords = nameWords.filter(word => titleLower.includes(word));
    
    // Require at least 50% word match or brand match
    const wordMatchRatio = matchingWords.length / nameWords.length;
    const brandMatch = productBrand && titleLower.includes(productBrand);

    return wordMatchRatio >= 0.5 || brandMatch;
  }

  // Calculate confidence score for a match
  calculateMatchConfidence(title, product) {
    const titleLower = title.toLowerCase();
    const productName = product.name.toLowerCase();
    const productBrand = (product.brand || '').toLowerCase();

    let confidence = 0;

    // Brand match adds significant confidence
    if (productBrand && titleLower.includes(productBrand)) {
      confidence += 40;
    }

    // Word matching
    const nameWords = productName.split(' ').filter(word => word.length > 2);
    const matchingWords = nameWords.filter(word => titleLower.includes(word));
    confidence += (matchingWords.length / nameWords.length) * 40;

    // Exact name match
    if (titleLower.includes(productName)) {
      confidence += 20;
    }

    return Math.min(Math.round(confidence), 100);
  }

  // Rate limiting check
  checkRateLimit() {
    const now = Date.now();
    const clientId = 'default'; // In real implementation, use IP or user ID

    if (!this.rateLimits.requestCounts.has(clientId)) {
      this.rateLimits.requestCounts.set(clientId, []);
    }

    const requests = this.rateLimits.requestCounts.get(clientId);
    
    // Remove old requests outside time window
    const validRequests = requests.filter(time => now - time < this.rateLimits.timeWindow);
    
    if (validRequests.length >= this.rateLimits.maxRequests) {
      return false;
    }

    // Add current request
    validRequests.push(now);
    this.rateLimits.requestCounts.set(clientId, validRequests);
    
    return true;
  }

  // Get price history for trend analysis
  async getPriceHistory(productId, days = 30) {
    try {
      const product = await Product.findById(productId);
      if (!product) {
        throw new Error('Product not found');
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const history = product.priceHistory
        .filter(entry => entry.date >= cutoffDate)
        .sort((a, b) => a.date - b.date);

      // Calculate trend
      const prices = history.map(h => h.price);
      const trend = this.calculatePriceTrend(prices);

      return {
        success: true,
        data: {
          product: {
            id: product._id,
            name: product.name,
            currentPrice: product.price.current
          },
          history,
          trend,
          lowestPrice: Math.min(...prices),
          highestPrice: Math.max(...prices),
          averagePrice: prices.reduce((sum, price) => sum + price, 0) / prices.length
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Calculate price trend
  calculatePriceTrend(prices) {
    if (prices.length < 2) return 'insufficient_data';

    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    const change = ((lastPrice - firstPrice) / firstPrice) * 100;

    if (Math.abs(change) < 2) return 'stable';
    return change > 0 ? 'increasing' : 'decreasing';
  }

  // Set price alert for a product
  async setPriceAlert(productId, userId, targetPrice, alertType = 'below') {
    try {
      // This would require a PriceAlert model in a real implementation
      // For now, return a placeholder response
      
      return {
        success: true,
        message: 'Price alert functionality would be implemented with a PriceAlert model',
        data: {
          productId,
          userId,
          targetPrice,
          alertType,
          createdAt: new Date()
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new PriceComparisonService();