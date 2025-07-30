# Shop Scanner Backend API

A comprehensive backend service for a shop scanning application that allows users to scan product barcodes, compare prices, and manage product listings.

## 🚀 Features

### Core Functionality
- **User Authentication** - JWT-based registration and login
- **Product Management** - Full CRUD operations for products
- **Barcode Scanning** - Extract barcodes from images using Google Cloud Vision
- **Price Comparison** - Compare prices across multiple retailers
- **Image Upload** - Multi-size image processing with Sharp
- **Wishlist/Favorites** - User product collections and wishlists

### Security & Performance
- **Rate Limiting** - Configurable limits for different endpoints
- **Security Headers** - Helmet.js security middleware
- **Input Validation** - XSS protection and data sanitization
- **Error Handling** - Comprehensive logging and error management
- **Health Monitoring** - Built-in health check system

## 📋 Prerequisites

- Node.js (v16 or higher)
- MongoDB (v4.4 or higher)
- Google Cloud Vision API credentials (optional)

## 🛠 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd shopscanner-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   
   Create a `.env` file in the root directory:
   ```env
   # Server Configuration
   PORT=3001
   NODE_ENV=development
   
   # Database
   MONGODB_URI=mongodb://localhost:27017/shopscanner
   
   # Authentication
   JWT_SECRET=your-super-secret-jwt-key-here
   
   # Security
   ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
   
   # External APIs (Optional)
   GOOGLE_APPLICATION_CREDENTIALS=path/to/google-credentials.json
   GOOGLE_CLOUD_PROJECT_ID=your-project-id
   BARCODE_LOOKUP_API_KEY=your-barcode-api-key
   BARCODE_LOOKUP_API_URL=https://api.barcodelookup.com/v3/products
   
   # Health Check
   HEALTH_CHECK_URL=http://localhost:3001
   ```

4. **Create required directories**
   ```bash
   mkdir -p uploads/products uploads/barcodes logs
   ```

## 🚦 Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Health Check
```bash
npm run health
```

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/test` - Auth service status

### Products
- `GET /api/products` - List products (with filtering)
- `GET /api/products/:id` - Get single product
- `POST /api/products` - Create product (sellers only)
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product
- `GET /api/products/seller/mine` - Get user's products
- `GET /api/products/meta/categories` - Get categories
- `GET /api/products/barcode/:code` - Find by barcode

### File Upload
- `POST /api/upload/images` - Upload product images
- `POST /api/upload/barcode` - Upload barcode image
- `DELETE /api/upload/images/:filename` - Delete image

### Barcode Scanning
- `POST /api/barcode/scan` - Scan barcode from image
- `GET /api/barcode/lookup/:code` - Lookup product by barcode
- `POST /api/barcode/create-product` - Create product from barcode
- `GET /api/barcode/validate/:code` - Validate barcode format
- `GET /api/barcode/history` - User scan history

### Price Comparison
- `POST /api/price-comparison/compare/:productId` - Compare prices
- `GET /api/price-comparison/history/:productId` - Price history
- `POST /api/price-comparison/alert` - Set price alert
- `GET /api/price-comparison/trending` - Trending prices
- `GET /api/price-comparison/deals` - Best deals
- `POST /api/price-comparison/update-price/:productId` - Update price

### Wishlist
- `GET /api/wishlist` - Get user wishlists
- `GET /api/wishlist/:id` - Get specific wishlist
- `POST /api/wishlist` - Create wishlist
- `PUT /api/wishlist/:id` - Update wishlist
- `DELETE /api/wishlist/:id` - Delete wishlist
- `POST /api/wishlist/:id/items` - Add item to wishlist
- `DELETE /api/wishlist/:id/items/:productId` - Remove item
- `POST /api/wishlist/quick-add` - Quick add to favorites

### System
- `GET /health` - Application health check
- `GET /api/database/test` - Database connection test

## 🔒 Authentication

All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## 📊 Rate Limits

- **General API**: 100 requests per 15 minutes
- **Authentication**: 5 requests per 15 minutes
- **Uploads**: 10 requests per minute
- **Barcode Scanning**: 5 requests per minute
- **Price Comparison**: 3 requests per 5 minutes

## 🗄 Database Models

### User
- Authentication and profile information
- User types: buyer, seller, both
- Subscription plans and usage tracking

### Product
- Comprehensive product information
- Price history and tracking
- Image management
- Seller information
- Geographic location data

### Wishlist
- User product collections
- Shared wishlists
- Priority and notes system

## 🛡 Security Features

- **Helmet.js** security headers
- **Rate limiting** per endpoint type
- **Input sanitization** and XSS protection
- **JWT authentication** with expiration
- **CORS** configuration
- **File upload** validation and size limits

## 📝 Logging

The application logs to:
- `logs/app-YYYY-MM-DD.log` - General application logs
- `logs/error-YYYY-MM-DD.log` - Error logs
- `logs/health-report-timestamp.json` - Health check reports

## 🧪 Testing

```bash
# Run tests
npm test

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix
```

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3001) |
| `NODE_ENV` | No | Environment (development/production) |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | JWT signing secret |
| `ALLOWED_ORIGINS` | No | CORS allowed origins |
| `GOOGLE_APPLICATION_CREDENTIALS` | No | Google Cloud credentials file |
| `BARCODE_LOOKUP_API_KEY` | No | Barcode lookup API key |

### File Structure
```
shopscanner-backend/
├── config/                 # Configuration files
├── middleware/             # Custom middleware
├── models/                 # Database models
├── routes/                 # API routes
├── services/               # Business logic services
├── scripts/                # Utility scripts
├── uploads/                # File storage
├── logs/                   # Application logs
├── server.js               # Main application file
└── package.json            # Dependencies and scripts
```

## 🚀 Deployment

### Production Checklist
1. Set `NODE_ENV=production`
2. Configure production MongoDB URI
3. Set strong JWT secret
4. Configure CORS origins
5. Set up SSL/TLS
6. Configure reverse proxy (nginx)
7. Set up monitoring and alerts
8. Configure log rotation

### Docker Support
```dockerfile
# Dockerfile example
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run linting and tests
6. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Support

For support and questions:
- Check the health endpoint: `/health`
- Review application logs in the `logs/` directory
- Run health check: `npm run health`

## 🔄 Version History

- **v1.0.0** - Initial release with core functionality
  - User authentication
  - Product management
  - Barcode scanning
  - Price comparison
  - Image upload
  - Wishlist system
  - Security and rate limiting
  - Error handling and logging# Deployment trigger
