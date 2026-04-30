// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Product = require('../models/Product');

// POST /api/auth/register - Register a new user
router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ msg: 'Please enter all fields' });
  }
  try {
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }
    user = new User({
      name,
      email,
      password,
      role: role || 'buyer',
    });
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();

    const payload = { user: { id: user.id, role: user.role } };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'your_jwt_secret', { expiresIn: '7d' });
    res.json({ token });
  } catch (err) {
    console.error('Error during registration:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/auth/login - Login a user
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ msg: 'Please enter all fields' });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }
    const payload = { user: { id: user.id, role: user.role } };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'your_jwt_secret', { expiresIn: '7d' });
    res.json({ token });
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/auth/me - Get user info
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('Error fetching user info:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/auth/logout - Logout user
router.post('/logout', (req, res) => {
  res.json({ msg: 'Logged out successfully' });
});

// PUT /api/auth/update-address - Update user's address
router.put('/update-address', auth, async (req, res) => {
  const { address } = req.body;
  if (!address) {
    return res.status(400).json({ msg: 'Address is required' });
  }
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    user.address = address;
    await user.save();
    res.json({ msg: 'Address updated successfully', user });
  } catch (err) {
    console.error('Error updating address:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});



router.get('/:id/profile', async (req, res) => {
  try {
    const farmer = await User.findById(req.params.id).select(
      'name bio location profilePicture role createdAt'
    );
 
    if (!farmer) return res.status(404).json({ msg: 'Farmer not found' });
 
    // Only expose community (seller) profiles publicly
    if (farmer.role !== 'community') {
      return res.status(403).json({ msg: 'Profile not available' });
    }
 
    // Fetch all products listed by this farmer that still have stock
    const products = await Product.find({ seller: req.params.id })
      .select('name price quantity description image averageRating totalRatings createdAt')
      .sort({ createdAt: -1 });
 
    res.json({
      farmer: {
        _id:            farmer._id,
        name:           farmer.name,
        bio:            farmer.bio || null,
        location:       farmer.location || null,
        profilePicture: farmer.profilePicture || null,
        role:           farmer.role,
        memberSince:    farmer.createdAt,
      },
      products,
      totalProducts:    products.length,
      productsInStock:  products.filter(p => p.quantity > 0).length,
    });
  } catch (err) {
    console.error('Error fetching farmer profile:', err);
    if (err.kind === 'ObjectId') return res.status(404).json({ msg: 'Farmer not found' });
    res.status(500).json({ msg: 'Server error' });
  }
});
 

module.exports = router;