 1    const express = require('express');
        2 +  const mongoose = require('mongoose');
        3    const cors = require('cors');
        4    
        5    const app = express();
        6    
        7 +  // Basic middleware
        8    app.use(cors());
        9    app.use(express.json());
       10    
       11 +  // Health check endpoint
       12    app.get('/health', (req, res) => {
       13 -    res.json({ status: 'ok' });
       13 +    res.json({ 
       14 +      status: 'ok',
       15 +      mongodb: mongoose.connection.readyState === 1 ? 
     'connected'
          +  : 'disconnected'
       16 +    });
       17    });
       18    
       19    app.get('/', (req, res) => {
       20 -    res.json({ message: 'Shop Scanner API', status: 'running' 
     });
       20 +    res.json({ 
       21 +      message: 'Shop Scanner API', 
       22 +      status: 'running',
       23 +      mongodb: mongoose.connection.readyState === 1 ? 
     'connected'
          +  : 'disconnected'
       24 +    });
       25    });
       26    
       27 -  const PORT = process.env.PORT || 3001;
       28 -  app.listen(PORT, () => {
       29 -    console.log(`Server running on port ${PORT}`);
       30 -  });
       27   \ No newline at end of file
       28 +  // Connect to MongoDB FIRST, then start server
       29 +  const startServer = async () => {
       30 +    try {
       31 +      // Connect to MongoDB
       32 +      if (process.env.MONGODB_URI) {
       33 +        await mongoose.connect(process.env.MONGODB_URI);
       34 +        console.log('MongoDB connected successfully');
       35 +      } else {
       36 +        console.log('No MONGODB_URI - running without 
     database');
       37 +      }
       38 +  
       39 +      // Start server only after successful DB connection
       40 +      const PORT = process.env.PORT || 3001;
       41 +      app.listen(PORT, () => {
       42 +        console.log(`Server running on port ${PORT}`);
       43 +        console.log(`MongoDB: ${mongoose.connection.readyState 
          + === 1 ? 'Connected' : 'Not connected'}`);
       44 +      });
       45 +  
       46 +    } catch (error) {
       47 +      console.error('Failed to start server:', error);
       48 +      process.exit(1);
       49 +    }
       50 +  };
       51 +  
       52 +  startServer();
       53   \ No newline at end of file
