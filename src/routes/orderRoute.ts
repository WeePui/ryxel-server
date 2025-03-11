import express from 'express';
import {
  getUserOrders,
  createOrder,
  getOrderByID,
  updateOrderStatus,
  updateOrder,
  deleteOrder,
  getAllOrders,
  checkUnpaidOrder,
} from '../controllers/orderController';
import { protect, restrictTo } from '../controllers/authController';

const router = express.Router();

// Routes for individual users to view their own orders
router
  .route('/')
  .get(protect, getUserOrders) // Get all orders for a user
  .post(protect, createOrder); // Create a new order

router.route('/checkUnpaidOrder').get(protect, checkUnpaidOrder); // Check if user has unpaid order

router
  .route('/:id')
  .get(protect, getOrderByID) // Get an order by ID
  .put(protect, updateOrderStatus) // Update the status of an order
  .patch(protect, updateOrder) // Update an order by ID
  .delete(protect, deleteOrder); // Delete an order by ID

// Route for admin to view all users' orders. TO BE CHANGED WHEN ADMIN ROUTES ARE IMPLEMENTED
router.route('/admin/all').get(protect, restrictTo('admin'), getAllOrders); // Get all orders (Admin)

router.route('/checkout');
//.post(protect, checkout); // Process checkout

export default router;
