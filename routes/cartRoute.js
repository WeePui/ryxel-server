const express = require('express');
const cartController = require('../controllers/cartController');
const authController = require('../controllers/authController');

const router = express.Router();

router
    .route('/')
    .get(authController.protect, cartController.getCart) // Get the cart
    .post(authController.protect, cartController.addToCart) // Add items to the cart
    .delete(authController.protect, cartController.deleteCart); // Delete the entire cart

router
    .route('/items')
    .delete(authController.protect, cartController.deleteAllCartItems); // Remove all items from the cart

router
    .route('/items/:productID')
    .patch(authController.protect, cartController.updateCartItems) // Update a specific cart item
    .delete(authController.protect, cartController.deleteCartItem); // Remove a specific cart item

module.exports = router;
