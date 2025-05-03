import express from 'express';
import * as reviewController from '../controllers/reviewController';
import * as authController from '../controllers/authController';
import multer from 'multer';

const storage = multer.memoryStorage();
const upload = multer({ storage });
const router = express.Router({ mergeParams: true });

router.route('/').get(reviewController.getAllReviews).post(
  authController.protect,
  authController.restrictTo('user')
  // reviewController.createReview
);

router
  .route('/order/:orderId')
  .post(
    authController.protect,
    upload.any(),
    authController.restrictTo('user'),
    reviewController.createReviewsByOrder
  )
  .patch(
    authController.protect,
    upload.any(),
    authController.restrictTo('user'),
    reviewController.updateReviewsByOrder
  );

router
  .route('/:id')
  .get(reviewController.getReviewById)
  .patch(
    authController.protect,
    authController.restrictTo('user', 'admin'),
    reviewController.updateReview
  )
  .delete(
    authController.protect,
    authController.restrictTo('user', 'admin'),
    reviewController.deleteReview
  );

export default router;
