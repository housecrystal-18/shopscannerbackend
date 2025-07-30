# 🚀 Deploy Shop Scanner Backend to Railway

## Quick Railway Deployment Steps

### 1. Create Railway Account
- Go to [railway.app](https://railway.app)
- Sign up with GitHub (recommended)

### 2. Deploy from GitHub
1. **Push backend to GitHub** (if not already done):
   ```bash
   cd /Users/crystalhouse/Documents/shopscanner-backend
   git init
   git add .
   git commit -m "Initial backend deployment"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/shopscanner-backend.git
   git push -u origin main
   ```

2. **Create new Railway project**:
   - Click "New Project" in Railway dashboard
   - Select "Deploy from GitHub repo"
   - Connect your GitHub account
   - Select `shopscanner-backend` repository

### 3. Configure Environment Variables in Railway

**Required Variables**:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/shopscanner
JWT_SECRET=your-super-secret-production-jwt-key-very-long-and-random
ALLOWED_ORIGINS=https://shopscanner-frontend-ej0brmmwe-shop-scanner.vercel.app
```

**Optional but Recommended**:
```
NODE_ENV=production
RATE_LIMIT_MAX_REQUESTS=1000
AUTH_RATE_LIMIT_MAX=10
BARCODE_RATE_LIMIT_MAX=30
PRICE_COMPARISON_RATE_LIMIT_MAX=20
```

### 4. Database Setup Options

#### Option A: Railway PostgreSQL (Recommended)
```bash
# Railway will provide these automatically
DATABASE_URL=postgresql://...
```

#### Option B: MongoDB Atlas (Free)
1. Go to [mongodb.com](https://mongodb.com)
2. Create free cluster
3. Get connection string
4. Add to Railway as MONGODB_URI

#### Option C: Railway MongoDB Plugin
- Add MongoDB plugin in Railway dashboard
- Connection string provided automatically

### 5. Deploy and Test

1. **Automatic deployment**: Railway deploys automatically on git push
2. **Get your API URL**: Something like `https://shopscanner-backend-production.railway.app`
3. **Test health endpoint**: `https://your-url.railway.app/health`

### 6. Update Frontend Configuration

Once deployed, update Vercel environment variables:
```
VITE_API_BASE_URL=https://your-railway-app.railway.app
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_key
```

## Alternative: One-Click Deploy Button

Add this to your GitHub README for easy deployment:

```markdown
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/T8x9oF)
```

## Production Checklist

- [ ] MongoDB database configured
- [ ] JWT_SECRET set to strong random value
- [ ] CORS origins configured for your frontend domain
- [ ] Environment variables set in Railway
- [ ] Health endpoint responding: `/health`
- [ ] Database connection test: `/api/database/test`
- [ ] Frontend updated with production API URL

## Troubleshooting

### Deployment Fails
- Check Railway build logs
- Ensure all dependencies in package.json
- Verify Node.js version compatibility

### Database Connection Issues
- Verify MONGODB_URI format
- Check database user permissions
- Ensure IP whitelist includes Railway IPs (or use 0.0.0.0/0)

### CORS Errors
- Add your Vercel URL to ALLOWED_ORIGINS
- Include both preview and production URLs

### Rate Limiting Issues
- Adjust rate limits in environment variables
- Check Railway logs for blocked requests

## Railway Benefits
- ✅ Free tier with 500 hours/month
- ✅ Automatic HTTPS
- ✅ Easy GitHub integration
- ✅ Built-in monitoring
- ✅ Automatic deployments
- ✅ Multiple database options