import express from 'express';
import * as cartController from '../controllers/cartController';
import * as authController from '../controllers/authController';

const router = express.Router();

router.use(authController.protect);

router
  .route('/')
  .get(cartController.getCart) // Get the cart
  .post(cartController.createCart) // Add items to the cart
  .delete(cartController.deleteCart); // Delete the entire cart

router
  .route('/items')
  .post(cartController.addMultipleItemsToCart)
  .delete(cartController.deleteAllCartItems); // Remove all items from the cart

router
  .route('/items/:productID/:variantID')
  .patch(cartController.addOrUpdateCartItem) // Update a specific cart item
  .delete(cartController.deleteCartItem); // Remove a specific cart item

export default router;
