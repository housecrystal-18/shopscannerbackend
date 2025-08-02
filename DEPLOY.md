# Railway Deployment Guide

## Quick Deploy Button

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template/shopscanner-backend)

## Manual Deployment

### 1. Create Railway Account
- Go to [railway.app](https://railway.app)
- Sign up with GitHub

### 2. Create New Project
```bash
# Option A: Using Railway CLI
railway login
railway create shopscanner-backend

# Option B: Connect GitHub repo in Railway dashboard
```

### 3. Set Environment Variables

In Railway dashboard, add these environment variables:

```env
NODE_ENV=production
JWT_SECRET=your_super_secure_jwt_secret_key_here_minimum_32_characters
CORS_ORIGINS=https://shopscannerpro.com,https://www.shopscannerpro.com,https://shopscanner-frontend.vercel.app
```

### 4. Deploy
```bash
# Push to trigger deploy
git push origin main

# Or use Railway CLI
railway up
```

### 5. Verify Deployment

Your backend will be available at: `https://shopscanner-backend-production.up.railway.app`

Test endpoints:
- Health: `GET /health`
- Register: `POST /auth/register`
- Login: `POST /auth/login`

### 6. Update Frontend

Update your frontend `.env` file:
```env
VITE_API_BASE_URL=https://shopscanner-backend-production.up.railway.app
VITE_MOCK_API=false
```

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | Set to `production` |
| `JWT_SECRET` | Yes | Strong secret key (32+ chars) |
| `PORT` | No | Auto-set by Railway |
| `CORS_ORIGINS` | Yes | Comma-separated frontend URLs |
| `STRIPE_SECRET_KEY` | Optional | For payments |
| `DATABASE_URL` | Optional | Railway PostgreSQL auto-provided |

## Testing the Deployment

```bash
# Health check
curl https://your-railway-url.up.railway.app/health

# Register user
curl -X POST https://your-railway-url.up.railway.app/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123","selectedPlan":"monthly"}'

# Login
curl -X POST https://your-railway-url.up.railway.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

## Troubleshooting

### Build Fails
- Check Railway build logs
- Ensure all dependencies in package.json
- Verify Node.js version compatibility

### Server Won't Start
- Check environment variables are set
- Verify PORT is not hardcoded
- Check Railway service logs

### CORS Errors
- Verify CORS_ORIGINS includes your frontend domain
- Check frontend API_BASE_URL points to Railway

### 500 Errors
- Check Railway logs: `railway logs`
- Verify JWT_SECRET is set and strong
- Ensure all required routes exist

## Security Checklist

- ✅ Strong JWT_SECRET (32+ characters)
- ✅ NODE_ENV=production
- ✅ CORS configured for production domains only
- ✅ Rate limiting enabled
- ✅ Input validation on all endpoints
- ✅ Error handling doesn't expose internals

## Monitoring

Railway provides:
- Service metrics
- Build logs
- Runtime logs
- Health checks
- Crash detection

Access via Railway dashboard or CLI:
```bash
railway logs
railway status
```

## Auto-Deploy Setup

1. Connect GitHub repo to Railway
2. Enable auto-deploy on main branch
3. Every push triggers deployment
4. Railway automatically builds and deploys

## Custom Domain (Optional)

1. In Railway dashboard, go to Settings
2. Add custom domain
3. Configure DNS CNAME record
4. Update CORS_ORIGINS with new domain