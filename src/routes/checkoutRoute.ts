import express from 'express';
import * as checkoutController from '../controllers/checkoutController';
import * as authController from'../controllers/authController';

const router = express.Router();

router
    .route('/')
    .post(authController.protect, checkoutController.checkout); // Process checkout 

export default router
