// backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
app.use('/uploads', express.static('uploads'));

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json()); // Parse JSON bodies

// Import Routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/order'); // Corrected from 'orders' to match filename
const plantRoutes = require('./routes/plant');
const foodRoutes = require('./routes/food');
const cartRoutes = require('./routes/cart');

// Use Routes
app.use('/api/auth', authRoutes);
app.use('/api/product', productRoutes);
app.use('/api/order', orderRoutes); 
app.use('/api/plant', plantRoutes);
app.use('/api/food', foodRoutes);
app.use('/api/cart', cartRoutes);

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1); // Exit process if MongoDB fails to connect
  });

// Basic Route
app.get('/', (req, res) => {
  res.send('Agri Market Backend');
});

// Start Server
const PORT = process.env.PORT || 5001;
app.listen(PORT, (err) => {
  if (err) {
    console.error('Server failed to start:', err);
    process.exit(1);
  }
  console.log(`Server running on port ${PORT}`);
});