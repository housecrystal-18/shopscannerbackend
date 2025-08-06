const express = require('express');
  const cors = require('cors');
  require('dotenv').config();

  const app = express();
  const PORT = process.env.PORT || 3001;

  app.use(cors());
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      googleOAuth: process.env.GOOGLE_CLIENT_ID ? 'Configured' : 'Not 
  configured'
    });
  });

  app.get('/api/auth/google', (req, res) => {
    res.json({
      message: 'Google OAuth endpoint - will be implemented',
      status: 'placeholder'
    });
  });

  app.get('/', (req, res) => {
    res.json({
      message: 'Shop Scanner API',
      version: '1.0.1',
      status: 'running'
    });
  });

  app.listen(PORT, () => {
    console.log('🚀 Server started on port', PORT);
    console.log('🔐 Google OAuth:', process.env.GOOGLE_CLIENT_ID ?
  'Configured' : 'Not configured');
  });

