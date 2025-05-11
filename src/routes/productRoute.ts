import express from 'express';
import * as productController from '../controllers/productController';
import * as authController from '../controllers/authController';
import multer from 'multer';
// import reviewRouter from './reviewRoute';

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });

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
    upload.any(),
    productController.createProduct
  );

router.route('/filters').get(productController.getFilterData);

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

router.route('/slug/:slug').get(productController.getProductBySlug);

router
  .route('/cart-product-recommend/:productId')
  .get(productController.getCartProductRecommend);

router
  .route('/similar-products/:productId')
  .get(productController.getSimilarProduct);

export default router;
