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
  getShippingFee,
  cancelOrder,
  getOrderByOrderCode,
} from '../controllers/orderController';
import { protect, restrictTo } from '../controllers/authController';

const router = express.Router();

router.route('/shippingFee').post(getShippingFee); // Get shipping fee

router.use(protect);

// Routes for individual users to view their own orders
router
  .route('/')
  .get(getUserOrders) // Get all orders for a user
  .post(createOrder); // Create a new order

router.route('/checkUnpaidOrder').get(checkUnpaidOrder); // Check if user has unpaid order

router.route('/orderCode/:code').get(getOrderByOrderCode); // Get an order by order code
router
  .route('/:id')
  .get(getOrderByID) // Get an order by ID
  .patch(updateOrder) // Update an order by ID
  .delete(deleteOrder); // Delete an order by ID

router.route('/:id/cancel').patch(cancelOrder); // Cancel an order

// Route for admin to view all users' orders. TO BE CHANGED WHEN ADMIN ROUTES ARE IMPLEMENTED
router.route('/admin/all').get(restrictTo('admin'), getAllOrders); // Get all orders (Admin)

router.route('/checkout');
//.post(protect, checkout); // Process checkout

export default router;
