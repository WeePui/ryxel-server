const validator = require('validator');
const mongoose = require('mongoose');

const shippingAddressSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
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
  city: {
    name: {
      type: String,
      required: [true, 'Please provide your city (or province)!'],
      trim: true,
    },
    code: {
      type: Number,
      required: [true, 'Please provide your city code!'],
      trim: true,
    },
  },
  district: {
    name: {
      type: String,
      required: [true, 'Please provide your city (or province)!'],
      trim: true,
    },
    code: {
      type: Number,
      required: [true, 'Please provide your city code!'],
      trim: true,
    },
  },
  ward: {
    name: {
      type: String,
      required: [true, 'Please provide your city (or province)!'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Please provide your city code!'],
      trim: true,
    },
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
