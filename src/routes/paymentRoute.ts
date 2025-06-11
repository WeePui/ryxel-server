import express from 'express';
import * as paymentController from '../controllers/paymentController';
import * as authController from '../controllers/authController';
import { validatePaymentRequest, paymentRateLimit } from '../middleware/paymentValidation';

const router = express.Router();

// Test endpoint for ZaloPay callback testing
router.post('/zalopay/test', (req, res) => {
  console.log('ZaloPay test endpoint hit:', {
    body: req.body,
    headers: req.headers,
    timestamp: new Date().toISOString()
  });
  res.status(200).json({
    status: 'success',
    message: 'Test endpoint working',
    receivedData: req.body
  });
});

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
