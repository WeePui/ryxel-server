const validator = require('validator');
const mongoose = require('mongoose');

const shippingAddressSchema = new mongoose.Schema({
  fullname: {
    type: String,
    required: [true, 'Please provide your full name!'],
    trim: true,
  },
  phoneNumber: {
    type: String,
    required: [true, 'Please provide your phone number!'],
    validate: {
      validator: (value) => validator.isMobilePhone(value, 'vi-VN'),
      message: 'Please provide a valid phone number!',
    },
  },
  country: {
    type: String,
    default: 'Vietnam',
    trim: true,
  },
  state: {
    type: String,
    required: [true, 'Please provide your state (or province)!'],
    trim: true,
  },
  city: {
    type: String,
    required: [true, 'Please provide your city!'],
    trim: true,
  },
  district: {
    type: String,
    required: [true, 'Please provide your district!'],
    trim: true,
  },
  address: {
    type: String,
    required: [true, 'Please provide your address!'],
    trim: true,
  },
  addressInfo: {
    type: String,
    trim: true,
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
});

const ShippingAddress = mongoose.model(
  'ShippingAddress',
  shippingAddressSchema
);

module.exports = ShippingAddress;
