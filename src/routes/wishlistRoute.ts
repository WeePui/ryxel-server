import express from 'express';
import * as wishlistController from '../controllers/wishlistController';
import * as authController from '../controllers/authController';

const router = express.Router();

router.get('/:shareCode', wishlistController.getWishlistByShareCode);

router.use(authController.protect);

router.route('/').get(wishlistController.getWishlist);

router
  .route('/:productId')
  .post(wishlistController.addToWishlist)
  .delete(wishlistController.removeFromWishlist);

export default router;
