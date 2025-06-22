// backend/routes/product.js
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only JPEG, JPG, and PNG images are allowed'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// GET /api/product/seller - Get all products listed by the seller
router.get('/seller', auth, async (req, res) => {
  try {
    const products = await Product.find({ seller: req.user.id });
    res.json(products || []);
  } catch (err) {
    console.error('Error fetching seller products:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/product/:id - Update a product's price, quantity, and image
router.put('/:id', auth, upload.single('image'), async (req, res) => {
  const price = req.body.price ? parseFloat(req.body.price) : undefined;
  const quantity = req.body.quantity ? parseInt(req.body.quantity, 10) : undefined;
  const image = req.file ? `/uploads/${req.file.filename}` : undefined;

  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ msg: 'Product not found' });
    }
    if (product.seller.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized to update this product' });
    }

    // Validate and update price if provided
    if (price !== undefined) {
      if (isNaN(price) || price < 0) {
        return res.status(400).json({ msg: 'Price must be a non-negative number' });
      }
      product.price = price;
    }

    // Validate and update quantity if provided
    if (quantity !== undefined) {
      if (isNaN(quantity) || quantity < 0 || !Number.isInteger(quantity)) {
        return res.status(400).json({ msg: 'Quantity must be a non-negative integer' });
      }
      product.quantity = quantity;
    }

    // Update image if a new one is uploaded
    if (image !== undefined) {
      product.image = image;
    }

    await product.save();
    res.json({ msg: 'Product updated successfully', product });
  } catch (err) {
    console.error('Error updating product:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/product - List a new product
router.post('/', auth, upload.single('image'), async (req, res) => {
  const { name, description } = req.body;
  const price = parseFloat(req.body.price); // Convert price string to a number
  const quantity = parseInt(req.body.quantity, 10); // Convert quantity string to an integer
  const image = req.file ? `/uploads/${req.file.filename}` : '/uploads/farm.jpg'; // Default image if none uploaded

  // Validate the parsed values
  if (!name || isNaN(price) || isNaN(quantity)) {
    return res.status(400).json({ msg: 'Name, price, and quantity are required' });
  }
  if (price < 0) {
    return res.status(400).json({ msg: 'Price must be a non-negative number' });
  }
  if (quantity < 0 || !Number.isInteger(quantity)) {
    return res.status(400).json({ msg: 'Quantity must be a non-negative integer' });
  }

  try {
    const product = new Product({
      name,
      price,
      quantity,
      description,
      image,
      seller: req.user.id,
    });
    await product.save();
    res.status(201).json({ msg: 'Product listed successfully', product });
  } catch (err) {
    console.error('Error listing product:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/product - Get all products
router.get('/', async (req, res) => {
  try {
    const products = await Product.find().populate('seller', 'name');
    res.json(products || []);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;