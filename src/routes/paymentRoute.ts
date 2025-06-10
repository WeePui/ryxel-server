import express from 'express';
import * as paymentController from '../controllers/paymentController';
import * as authController from '../controllers/authController';
import { validatePaymentRequest, paymentRateLimit } from '../middleware/paymentValidation';

const router = express.Router();

router.post('/zalopay/callback', paymentController.zalopayCallback);

router.use(authController.protect);

router
  .route('/createStripeCheckoutSession')
  .post(
    paymentRateLimit,
    validatePaymentRequest,
    paymentController.createStripeCheckoutSession
  );

router
  .route('/createZaloPayCheckoutSession')
  .post(
    paymentRateLimit,
    validatePaymentRequest,
    paymentController.createZaloPayCheckoutSession
  );

export default router;
