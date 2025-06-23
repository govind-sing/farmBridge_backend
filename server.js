// backend/server.js

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();

// Serve static files from /uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Enable CORS for all origins
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/product', require('./routes/products'));
app.use('/api/order', require('./routes/order'));
app.use('/api/plant', require('./routes/plant'));
app.use('/api/food', require('./routes/food'));
app.use('/api/cart', require('./routes/cart'));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// Basic Health Check Route
app.get('/', (req, res) => {
  res.send('🌾 Agri Market Backend is running!');
});

// Start Server
const PORT = process.env.PORT || 5001;
app.listen(PORT, (err) => {
  if (err) {
    console.error('❌ Server failed to start:', err);
    process.exit(1);
  }
  console.log(`🚀 Server running on port ${PORT}`);
});
