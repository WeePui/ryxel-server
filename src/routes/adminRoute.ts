import express from 'express';
import * as adminController from '../controllers/adminController';
import * as authController from '../controllers/authController';
// import reviewRouter from './reviewRoute';

const router = express.Router();

router.use(authController.protect, authController.restrictTo('admin'));

router.route('/dashboard').get(adminController.getDashboard);

router.route('/dashboard/recent-orders').get(adminController.getRecentOrders);

router.route('/dashboard/revenue').get(adminController.getRevenue);

router.route('/dashboard/top-customers').get(adminController.getTopCustomers);

router.route('/products/sold').get(adminController.getProductsSold);

router.route('/dashboard/category-sales').get(adminController.getCategorySales);

router.route('/products/stock').get(adminController.getStockSummary);

router.route('/products/summary').get(adminController.getProductsSummary);

router.route('/orders/top-provinces').get(adminController.getTopProvinces);

router.route('/users/users-summary').get(adminController.getUserStats);

router.route('/users/top-provinces').get(adminController.getTopProvincesWithMostPurchasingUsers);

router
  .route('/orders/order-by-status')
  .get(adminController.getOrderStatusCounts);

router.route('/orders/summary').get(adminController.getOrderStats);

export default router;
