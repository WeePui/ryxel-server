const express = require('express');
const authController = require('../controllers/authController');
const discountController = require('../controllers/discountController');

const router = express.Router();

router
  .route('/')
  .get(discountController.getAllDiscounts)
  .post(
    authController.protect,
    authController.restrictTo('admin'),
    discountController.createDiscount
  );
router
  .route('/:id')
  .get(authController.protect, discountController.getDiscountById)
  .post(authController.protect, discountController.verifyDiscount)
  .patch(
    authController.protect,
    authController.restrictTo('admin'),
    discountController.updateDiscount
  )
  .delete(
    authController.protect,
    authController.restrictTo('admin'),
    discountController.deleteDiscount
  );

module.exports = router;
