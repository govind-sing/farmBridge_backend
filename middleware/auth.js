// backend/middleware/auth.js
const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  // Get token from Authorization header
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    return res.status(401).json({ msg: 'No Authorization header, authorization denied' });
  }

  // Check if the header starts with "Bearer "
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ msg: 'Invalid token format, authorization denied' });
  }

  // Extract the token (remove "Bearer " prefix)
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ msg: 'No token provided, authorization denied' });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    if (!decoded.user) {
      return res.status(401).json({ msg: 'Invalid token payload, authorization denied' });
    }
    req.user = decoded.user; // Set req.user to the decoded user object
    next();
  } catch (err) {
    console.error('Token verification error:', err.message);
    res.status(401).json({ msg: 'Token is not valid' });
  }
};