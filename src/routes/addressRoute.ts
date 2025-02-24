import express from 'express';
import * as addressController from '../controllers/addressController';
import * as authController from '../controllers/authController';

const router = express.Router();

router.use(authController.protect);

router
  .route('/')
  .get(addressController.getUserShippingAddress)
  .post(addressController.addShippingAddress);

router
  .route('/:id')
  .patch(addressController.updateShippingAddress)
  .delete(addressController.deleteShippingAddress);

router.route('/:id/default').patch(addressController.setDefaultShippingAddress);

export default router;
