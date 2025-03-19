import express from 'express';
import * as authController from '../controllers/authController';
import * as discountController from '../controllers/discountController';

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
  .post(authController.protect, discountController.checkDiscount)
  .patch(
    authController.protect,
    authController.restrictTo('admin')
    //discountController.updateDiscount
  )
  .delete(
    authController.protect,
    authController.restrictTo('admin'),
    discountController.deleteDiscount
  );

export default router;
