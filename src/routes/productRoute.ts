import express from 'express';
import * as productController from '../controllers/productController';
import * as authController from '../controllers/authController';
// import reviewRouter from './reviewRoute';

const router = express.Router();

// router.use('/:productId/reviews', reviewRouter);

router
  .route('/top-5-bestsellers')
  .get(productController.aliasTopProducts, productController.getAllProducts);
router
  .route('/')
  .get(productController.getAllProducts)
  .post(
    authController.protect,
    authController.restrictTo('admin'),
    productController.createProduct
  );
router
  .route('/:id')
  .get(productController.getProductById)
  .patch(
    authController.protect,
    authController.restrictTo('admin'),
    productController.updateProduct
  )
  .delete(
    authController.protect,
    authController.restrictTo('admin'),
    productController.deleteProduct
  );

export default router;
