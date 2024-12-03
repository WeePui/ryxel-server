const express = require('express');
const authController = require('../controllers/authController');
const addressController = require('../controllers/addressController');

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

module.exports = router;
