const express = require('express');
const checkoutController = require('../controllers/checkoutController');
const authController = require('../controllers/authController');

const router = express.Router();

router
    .route('/')
    .post(authController.protect, checkoutController.checkout); // Process checkout 

module.exports = router;
