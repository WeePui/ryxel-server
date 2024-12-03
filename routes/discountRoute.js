const express = require('express');
const authController = require('../controllers/authController');
const disountController = require('../controllers/discountController');

const router = express.Router();

router
  .route('/')
  .get(disountController.getAllDiscounts)
  .post(
    authController.protect,
    authController.restrictTo('admin'),
    disountController.createDiscount
  );

router
  .route('/:id')
  .get(disountController.getDiscountById)
  .patch(
    authController.protect,
    authController.restrictTo('admin'),
    disountController.updateDiscount
  )
  .delete(
    authController.protect,
    authController.restrictTo('admin'),
    disountController.deleteDiscount
  );

module.exports = router;
