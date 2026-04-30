// backend/models/Product.js
const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const productSchema = new mongoose.Schema({
  name:        { type: String,  required: true },
  price:       { type: Number,  required: true },
  quantity:    { type: Number,  required: true },
  description: { type: String },
  image:       { type: String },
  seller:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt:   { type: Date, default: Date.now },

  // ── Rating fields ──────────────────────────────────────────────────────────
  ratings:       [ratingSchema],
  averageRating: { type: Number, default: 0 },
  totalRatings:  { type: Number, default: 0 },
});

// Recompute averageRating & totalRatings whenever ratings array changes
productSchema.methods.recalculateRatings = function () {
  if (this.ratings.length === 0) {
    this.averageRating = 0;
    this.totalRatings  = 0;
  } else {
    const sum          = this.ratings.reduce((acc, r) => acc + r.rating, 0);
    this.averageRating = Math.round((sum / this.ratings.length) * 10) / 10;
    this.totalRatings  = this.ratings.length;
  }
};

module.exports = mongoose.model('Product', productSchema);