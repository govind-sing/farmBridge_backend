const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const auth = require('../middleware/auth');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const User = require('../models/User');

// GET /api/order/myorders - Get buyer's orders (sorted newest first)
router.get('/myorders', auth, async (req, res) => {
  try {
    const orders = await Order.find({ buyer: req.user.id })
      .populate({
        path: 'products.productId',
        select: 'name price quantity seller', // Include seller for display
      })
      .populate('seller', 'name') // Populate seller name for buyer view
      .sort({ createdAt: -1 }); // Sort newest first
    res.json(orders || []);
  } catch (err) {
    console.error('Error fetching buyer orders:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/order/checkout - Create orders per seller
router.post('/checkout', auth, async (req, res) => {
  const { paymentMethod } = req.body;
  if (!paymentMethod) {
    return res.status(400).json({ msg: 'Payment method is required' });
  }
  try {
    const cart = await Cart.findOne({ user: req.user.id }).populate('products.productId');
    if (!cart || cart.products.length === 0) {
      return res.status(400).json({ msg: 'Cart is empty' });
    }

    // Fetch buyer's address
    const buyer = await User.findById(req.user.id);
    if (!buyer) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Group cart items by seller
    const ordersBySeller = {};
    cart.products.forEach((item) => {
      const sellerId = item.productId.seller.toString();
      if (!ordersBySeller[sellerId]) {
        ordersBySeller[sellerId] = { products: [], totalAmount: 0 };
      }
      ordersBySeller[sellerId].products.push({
        productId: item.productId._id,
        quantity: item.quantity,
      });
      ordersBySeller[sellerId].totalAmount += item.productId.price * item.quantity;
    });

    // Create separate orders for each seller
    const orders = [];
    const transfers = []; // For dummy payment response compatibility
    for (const [sellerId, orderData] of Object.entries(ordersBySeller)) {
      const order = new Order({
        buyer: req.user.id,
        seller: sellerId,
        products: orderData.products,
        totalAmount: orderData.totalAmount,
        paymentMethod,
        status: 'pending',
        buyerAddress: buyer.address || 'Not provided',
      });
      await order.save();
      orders.push(order);
      transfers.push({ sellerId, amount: orderData.totalAmount }); // Matches dummy payment format
    }

    // Reduce product quantities with validation
    for (const item of cart.products) {
      const product = await Product.findById(item.productId._id);
      if (!product) {
        console.warn(`Product ${item.productId._id} not found during checkout`);
        continue;
      }
      if (product.quantity < item.quantity) {
        // Rollback any saved orders if stock is insufficient
        await Order.deleteMany({ _id: { $in: orders.map(o => o._id) } });
        return res.status(400).json({ msg: `Insufficient stock for ${product.name}` });
      }
      product.quantity -= item.quantity;
      await product.save();
    }

    // Clear cart
    cart.products = [];
    await cart.save();

    // Populate orders for response
    await Promise.all(
      orders.map(order =>
        order.populate({
          path: 'products.productId',
          select: 'name price quantity',
        })
      )
    );

    // Calculate total amount for buyer (sum of all seller orders)
    const totalAmount = orders.reduce((sum, order) => sum + order.totalAmount, 0);

    res.json({
      msg: 'Orders placed successfully',
      totalAmount, // For PaymentPage display
      transfers, // For dummy payment compatibility
      orders, // Detailed orders for debugging or future use
    });
  } catch (err) {
    console.error('Error during checkout:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/order/seller - Get all orders for the seller (sorted oldest first for unfulfilled)
router.get('/seller', auth, async (req, res) => {
  try {
    const orders = await Order.find({ seller: req.user.id }) // Filter by seller directly
      .populate({
        path: 'products.productId',
        select: 'name price quantity seller',
      })
      .populate('buyer', 'name')
      .sort({ createdAt: 1 }); // Sort oldest first for unfulfilled orders
    res.json(orders || []);
  } catch (err) {
    console.error('Error fetching seller orders:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/order/mark-done/:id - Mark an order as done
router.put('/mark-done/:id', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate({
      path: 'products.productId',
      select: 'seller',
    });
    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }

    // Verify the seller is authorized
    if (order.seller.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized to mark this order as done' });
    }

    if (order.status === 'completed') {
      return res.status(400).json({ msg: 'Order is already marked as done' });
    }

    order.status = 'completed';
    await order.save();
    res.json({ msg: 'Order marked as done', order });
  } catch (err) {
    console.error('Error marking order as done:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;