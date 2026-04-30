// backend/routes/product.js
const express  = require('express');
const router   = express.Router();
const Product  = require('../models/Product');
const Order    = require('../models/Order');
const auth     = require('../middleware/auth');
const multer   = require('multer');
const path     = require('path');

// ── Multer config ────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename:    (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png/.test(path.extname(file.originalname).toLowerCase()) &&
               /jpeg|jpg|png/.test(file.mimetype);
    ok ? cb(null, true) : cb(new Error('Only JPEG, JPG, and PNG images are allowed'));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ── Helper: did this buyer purchase this product? ────────────────────────────
const hasPurchasedProduct = async (buyerId, productId) => {
  const order = await Order.findOne({
    buyer:              buyerId,
    'products.productId': productId,
    status:             'completed',
  });
  return !!order;
};

// ════════════════════════════════════════════════════════════════════════════
// EXISTING PRODUCT ROUTES
// ════════════════════════════════════════════════════════════════════════════

// GET /api/product/seller
router.get('/seller', auth, async (req, res) => {
  try {
    const products = await Product.find({ seller: req.user.id });
    res.json(products || []);
  } catch (err) {
    console.error('Error fetching seller products:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/product
router.get('/', async (req, res) => {
  try {
    const products = await Product.find().populate('seller', 'name');
    res.json(products || []);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/product
router.post('/', auth, upload.single('image'), async (req, res) => {
  const { name, description } = req.body;
  const price    = parseFloat(req.body.price);
  const quantity = parseInt(req.body.quantity, 10);
  const image    = req.file ? `/uploads/${req.file.filename}` : '/uploads/farm.jpg';

  if (!name || isNaN(price) || isNaN(quantity))
    return res.status(400).json({ msg: 'Name, price, and quantity are required' });
  if (price < 0)
    return res.status(400).json({ msg: 'Price must be a non-negative number' });
  if (quantity < 0 || !Number.isInteger(quantity))
    return res.status(400).json({ msg: 'Quantity must be a non-negative integer' });

  try {
    const product = new Product({ name, price, quantity, description, image, seller: req.user.id });
    await product.save();
    res.status(201).json({ msg: 'Product listed successfully', product });
  } catch (err) {
    console.error('Error listing product:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/product/:id
router.put('/:id', auth, upload.single('image'), async (req, res) => {
  const price    = req.body.price    !== undefined ? parseFloat(req.body.price)       : undefined;
  const quantity = req.body.quantity !== undefined ? parseInt(req.body.quantity, 10)  : undefined;
  const image    = req.file ? `/uploads/${req.file.filename}` : undefined;

  try {
    const product = await Product.findById(req.params.id);
    if (!product)                                       return res.status(404).json({ msg: 'Product not found' });
    if (product.seller.toString() !== req.user.id)      return res.status(403).json({ msg: 'Not authorized' });

    if (price !== undefined) {
      if (isNaN(price) || price < 0) return res.status(400).json({ msg: 'Price must be a non-negative number' });
      product.price = price;
    }
    if (quantity !== undefined) {
      if (isNaN(quantity) || quantity < 0 || !Number.isInteger(quantity))
        return res.status(400).json({ msg: 'Quantity must be a non-negative integer' });
      product.quantity = quantity;
    }
    if (image !== undefined) product.image = image;

    await product.save();
    res.json({ msg: 'Product updated successfully', product });
  } catch (err) {
    console.error('Error updating product:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// RATING ROUTES
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/product/:id/ratings/eligibility
 * Returns whether the logged-in buyer can rate this product.
 * Response: { canRate, alreadyRated, myRating, reason }
 */
router.get('/:id/ratings/eligibility', auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ msg: 'Product not found' });

    // Seller cannot rate their own product
    if (product.seller.toString() === req.user.id) {
      return res.json({ canRate: false, alreadyRated: false, myRating: null, reason: 'own_product' });
    }

    // Must have purchased the product (completed order)
    const purchased = await hasPurchasedProduct(req.user.id, req.params.id);
    if (!purchased) {
      return res.json({ canRate: false, alreadyRated: false, myRating: null, reason: 'not_purchased' });
    }

    // Check if already rated
    const existingRating = product.ratings.find(
      (r) => r.buyer.toString() === req.user.id
    );
    if (existingRating) {
      return res.json({
        canRate:      false,
        alreadyRated: true,
        myRating:     existingRating.rating,
        ratingId:     existingRating._id,
        reason:       'already_rated',
      });
    }

    res.json({ canRate: true, alreadyRated: false, myRating: null, reason: null });
  } catch (err) {
    console.error('Error checking rating eligibility:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

/**
 * POST /api/product/:id/ratings
 * Submit a rating (1–5). Buyer must have a completed order for this product.
 */
router.post('/:id/ratings', auth, async (req, res) => {
  const parsedRating = parseInt(req.body.rating, 10);
  if (!parsedRating || parsedRating < 1 || parsedRating > 5)
    return res.status(400).json({ msg: 'Rating must be an integer between 1 and 5' });

  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ msg: 'Product not found' });

    // Block seller
    if (product.seller.toString() === req.user.id)
      return res.status(403).json({ msg: 'You cannot rate your own product' });

    // Must have purchased
    const purchased = await hasPurchasedProduct(req.user.id, req.params.id);
    if (!purchased)
      return res.status(403).json({ msg: 'You can only rate products you have purchased' });

    // Prevent duplicate
    const alreadyRated = product.ratings.some((r) => r.buyer.toString() === req.user.id);
    if (alreadyRated)
      return res.status(409).json({ msg: 'You have already rated this product' });

    product.ratings.push({ buyer: req.user.id, rating: parsedRating });
    product.recalculateRatings();
    await product.save();

    res.status(201).json({
      msg:           'Rating submitted successfully',
      averageRating: product.averageRating,
      totalRatings:  product.totalRatings,
    });
  } catch (err) {
    console.error('Error submitting rating:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

/**
 * PUT /api/product/:id/ratings/:ratingId
 * Update your own rating.
 */
router.put('/:id/ratings/:ratingId', auth, async (req, res) => {
  const parsedRating = parseInt(req.body.rating, 10);
  if (!parsedRating || parsedRating < 1 || parsedRating > 5)
    return res.status(400).json({ msg: 'Rating must be between 1 and 5' });

  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ msg: 'Product not found' });

    const ratingEntry = product.ratings.id(req.params.ratingId);
    if (!ratingEntry) return res.status(404).json({ msg: 'Rating not found' });

    if (ratingEntry.buyer.toString() !== req.user.id)
      return res.status(403).json({ msg: 'Not authorized to edit this rating' });

    ratingEntry.rating = parsedRating;
    product.recalculateRatings();
    await product.save();

    res.json({
      msg:           'Rating updated successfully',
      averageRating: product.averageRating,
      totalRatings:  product.totalRatings,
    });
  } catch (err) {
    console.error('Error updating rating:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

/**
 * DELETE /api/product/:id/ratings/:ratingId
 * Delete your own rating.
 */
router.delete('/:id/ratings/:ratingId', auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ msg: 'Product not found' });

    const ratingEntry = product.ratings.id(req.params.ratingId);
    if (!ratingEntry) return res.status(404).json({ msg: 'Rating not found' });

    if (ratingEntry.buyer.toString() !== req.user.id)
      return res.status(403).json({ msg: 'Not authorized to delete this rating' });

    ratingEntry.deleteOne();
    product.recalculateRatings();
    await product.save();

    res.json({
      msg:           'Rating deleted successfully',
      averageRating: product.averageRating,
      totalRatings:  product.totalRatings,
    });
  } catch (err) {
    console.error('Error deleting rating:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

/**
 * GET /api/product/:id/ratings/summary
 * Public — returns average, total, and 1–5 star breakdown.
 */
router.get('/:id/ratings/summary', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ msg: 'Product not found' });

    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    product.ratings.forEach((r) => { breakdown[r.rating] = (breakdown[r.rating] || 0) + 1; });

    res.json({
      averageRating: product.averageRating,
      totalRatings:  product.totalRatings,
      breakdown,
    });
  } catch (err) {
    console.error('Error fetching rating summary:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;