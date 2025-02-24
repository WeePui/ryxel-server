import express from 'express';
import * as paymentController from '../controllers/paymentController';
import * as authController from '../controllers/authController';

const router = express.Router();

router.use(authController.protect);

router
  .route('/createCheckoutSession')
  .post(paymentController.createCheckoutSession);

  export default router;
