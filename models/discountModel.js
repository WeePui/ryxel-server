const mongoose = require('mongoose');

const discountSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Discount code is required'],
    },
    name: {
      type: String,
      required: [true, 'Discount name is required'],
      trim: true,
    },
    startDate: {
      type: Date,
      required: [true, 'Discount start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'Discount end date is required'],
    },
    maxUse: {
      type: Number,
      required: [true, 'Discount max uses is required'],
      default: 1,
    }, //number of times this discount code can be used
    minOrderValue: {
      type: Number,
      required: [true, 'Minimum order value is required'],
      default: 0,
    }, //minimum order value
    discountPercentage: {
      type: Number,
      required: [true, 'Discount percentage is required'],
      min: [1, 'Discount percentage must be above 0'],
      max: [100, 'Discount percentage must be below 100'],
    }, //percentage of discount
    discountMaxValue: {
      type: Number,
      required: [true, 'Discount max value is required'],
    }, //max value of discount
    maxUsePerUser: {
      type: Number,
      required: [true, 'Discount max use per user is required'],
      default: 1,
    }, //number of times this discount code can be used by one user
    usedUser: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: [],
    }], //A collection contains all user id who used this discount
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const Discount = mongoose.model('Discount', discountSchema);

module.exports = Discount;
