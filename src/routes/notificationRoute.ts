import express from 'express';
import {
  registerToken,
  unregisterToken,
  sendToUser,
  sendToTokens,
  sendToAllUsers,
  getAllTokens
} from '../controllers/notificationController';
import { protect, restrictTo } from '../utils/authMiddleware';

const router = express.Router();

// Routes for authenticated users
router.use(protect);

router.route('/')
  .post(registerToken)
  .delete(unregisterToken);

// Routes for admin only
router.use(restrictTo('admin'));
router.route('/all-tokens')
  .get(getAllTokens);

router.route('/send')
  .post(sendToUser);

router.route('/send-multiple')
  .post(sendToTokens);

router.route('/send-all')
  .post(sendToAllUsers);

export default router; 