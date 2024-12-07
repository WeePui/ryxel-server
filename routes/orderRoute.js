const express = require('express');
const orderController = require('../controllers/orderController');
const authController = require('../controllers/authController');

const router = express.Router();

// Routes for individual users to view their own orders
router
  .route('/')
  .get(authController.protect, orderController.getUserOrders) // Get all orders for a user
  .post(authController.protect, orderController.createOrder); // Create a new order

router
  .route('/:id')
  .get(authController.protect, orderController.getOrderByID) // Get an order by ID
  .put(authController.protect, orderController.updateOrderStatus) // Update the status of an order
  .patch(authController.protect, orderController.updateOrder) // Update an order by ID
  .delete(authController.protect, orderController.deleteOrder); // Delete an order by ID

// Route for admin to view all users' orders. TO BE CHANGED WHEN ADMIN ROUTES ARE IMPLEMENTED
router
  .route('/admin/all')
  .get(
    authController.protect,
    authController.restrictTo('admin'),
    orderController.getAllOrders
  ); // Get all orders (Admin)

module.exports = router;
