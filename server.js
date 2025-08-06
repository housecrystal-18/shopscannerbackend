 Write(/Users/crystalhouse/Documents/shopscanner-frontend/GITHUB_FILES/ser
       ver.js)
  ⎿  Wrote 14 lines to /Users/crystalhouse/Documents/shopscanner-frontend/G
     THUB_FILES/server.js
     const express = require('express');
     const { app, startServer } = require('./src/app');

     // Health check endpoint (redundant but included for clarity)
     app.get('/health', (req, res) => {
       res.json({
         status: 'ok',
         timestamp: new Date().toISOString(),
         googleOAuth: process.env.GOOGLE_CLIENT_ID ? 'Configured' : 'Not 
     configured'
       });
     });

     // Start the server
     startServer();

