import express from 'express';
import {
  ghnWebhook,
  stripeWebhook,
  testGHNWebhook,
} from '../controllers/webhookController';
import bodyParser from 'body-parser';

const router = express.Router();

router.route('/ghn').post(bodyParser.json(), ghnWebhook);
router.route('/ghn/test').post(bodyParser.json(), testGHNWebhook);

router
  .route('/stripe')
  .post(bodyParser.raw({ type: 'application/json' }), stripeWebhook);

export default router;
