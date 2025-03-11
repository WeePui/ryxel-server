import express from 'express';
import * as paymentController from '../controllers/paymentController';
import * as authController from '../controllers/authController';

const router = express.Router();

router.post('/zalopay/callback', paymentController.zalopayCallback);

router.use(authController.protect);

router
  .route('/createStripeCheckoutSession')
  .post(paymentController.createStripeCheckoutSession);

router
  .route('/createZaloPayCheckoutSession')
  .post(paymentController.createZaloPayCheckoutSession);

export default router;
