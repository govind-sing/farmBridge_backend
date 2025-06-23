// backend/routes/cartRoute.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Cart = require('../models/Cart');
const Product = require('../models/Product');

// POST /api/cart/add - Add product to cart with stock validation
router.post('/add', auth, async (req, res) => {
  const { productId, quantity } = req.body;
  if (!productId || !quantity) {
    return res.status(400).json({ msg: 'Product ID and quantity are required' });
  }
  if (quantity <= 0) {
    return res.status(400).json({ msg: 'Quantity must be greater than 0' });
  }

  try {
    // Fetch the product to check available stock
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ msg: 'Product not found' });
    }

    // Fetch the user's cart
    let cart = await Cart.findOne({ user: req.user.id }).populate('products.productId');
    if (!cart) {
      cart = new Cart({ user: req.user.id, products: [] });
    }

    // Check if the product is already in the cart
    const productIndex = cart.products.findIndex((p) => p.productId.toString() === productId);
    const existingQuantity = productIndex > -1 ? cart.products[productIndex].quantity : 0;
    const totalRequestedQuantity = existingQuantity + quantity;

    // Validate stock availability
    if (totalRequestedQuantity > product.quantity) {
      return res.status(400).json({
        msg: `Insufficient stock for ${product.name}. Available: ${product.quantity} kg`,
      });
    }

    // Update cart
    if (productIndex > -1) {
      cart.products[productIndex].quantity = totalRequestedQuantity;
    } else {
      cart.products.push({ productId, quantity });
    }

    await cart.save();
    await cart.populate('products.productId');
    res.json(cart);
  } catch (err) {
    console.error('Error adding to cart:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/cart - Get user's cart
router.get('/', auth, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id }).populate('products.productId');
    res.json(cart || { user: req.user.id, products: [] });
  } catch (err) {
    console.error('Error fetching cart:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/cart/remove/:productId - Remove product from cart
router.delete('/remove/:productId', auth, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return res.status(404).json({ msg: 'Cart not found' });
    }

    const initialLength = cart.products.length;
    // Remove product from cart
    cart.products = cart.products.filter((p) => p.productId.toString() !== req.params.productId);
    
    if (cart.products.length === initialLength) {
      console.log(`Product ${req.params.productId} not found in cart for user ${req.user.id}`);
      return res.status(404).json({ msg: 'Product not found in cart' });
    }

    await cart.save();
    await cart.populate('products.productId');
    res.json(cart);
  } catch (err) {
    console.error('Error removing from cart:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/cart/update - Update product quantity in cart with stock validation
router.put('/update', auth, async (req, res) => {
  const { productId, quantity } = req.body;
  if (!productId || !quantity) {
    return res.status(400).json({ msg: 'Product ID and quantity are required' });
  }
  if (quantity <= 0) {
    return res.status(400).json({ msg: 'Quantity must be greater than 0' });
  }

  try {
    // Fetch the product to check available stock
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ msg: 'Product not found' });
    }

    // Fetch the user's cart
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return res.status(404).json({ msg: 'Cart not found' });
    }

    const productIndex = cart.products.findIndex((p) => p.productId.toString() === productId);
    if (productIndex === -1) {
      return res.status(404).json({ msg: 'Product not found in cart' });
    }

    // Validate stock availability
    if (quantity > product.quantity) {
      return res.status(400).json({
        msg: `Insufficient stock for ${product.name}. Available: ${product.quantity} kg`,
      });
    }

    // Update quantity
    cart.products[productIndex].quantity = quantity;
    await cart.save();
    await cart.populate('products.productId');
    res.json(cart);
  } catch (err) {
    console.error('Error updating cart quantity:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;