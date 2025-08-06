 const express = require('express');
  const mongoose = require('mongoose');
  const cors = require('cors');

  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      mongodb: mongoose.connection.readyState === 1 ? 'connected' :
  'disconnected'
    });
  });

  app.get('/', (req, res) => {
    res.json({
      message: 'Shop Scanner API',
      status: 'running',
      mongodb: mongoose.connection.readyState === 1 ? 'connected' :
  'disconnected'
    });
  });

  const startServer = async () => {
    try {
      if (process.env.MONGODB_URI) {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB connected successfully');
      } else {
        console.log('No MONGODB_URI - running without database');
      }

      const PORT = process.env.PORT || 3001;
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`MongoDB: ${mongoose.connection.readyState === 1 ? 
  'Connected' : 'Not connected'}`);
      });

    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  };

  startServer();
