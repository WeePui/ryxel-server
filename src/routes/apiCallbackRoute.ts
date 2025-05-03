import express from 'express';
import * as reviewController from '../controllers/reviewController';

const router = express.Router({ mergeParams: true });

router
  .route('/nsfw_detected')
  .post(
    reviewController.processNSFWReview
  )

export default router;

//TO BE IMPLEMENTING THE SECURITY FUNCTION IN THE FUTURE