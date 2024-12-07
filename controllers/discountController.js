const Discount = require('../models/discountModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Cart = require('../models/cartModel');

// Get all discounts
// Get disount by ID
// Create/update/delete discount
// Verify discount code(?)

exports.verifyDiscount = catchAsync(async (req, res) => {
  const discountCode = req.params.id;
  const discount = await Discount.findOne({
    code: discountCode.toString().toUpperCase(),
  });

  let isValid = true;
  // Validate discount
  let discountAmount = 0;
  if (discount) {
    if (new Date(discount.endDate) < Date.now() && discount.isActive) {
      discount.isActive = false;
    }
    usedUserId = req.user.id.toString();
    const cart = await Cart.findOne({ user: req.user.id });
    const totalPrice = cart.subtotal;
    const userUsageCount = discount.usedUser.filter(
      (userId) => userId.toString() === usedUserId
    ).length;
    if (userUsageCount >= discount.maxUsePerUser) {
      isValid = false;
    }
    if (!discount.isActive) {
      isValid = false;
    }
    if (totalPrice < discount.minOrderValue) {
      isValid = false;
    }
    discountAmount = (totalPrice * discount.discountPercentage) / 100;
    if (discountAmount > discount.discountMaxValue) {
      discountAmount = discount.discountMaxValue;
    }
    console.log('p', totalPrice);
  } else {
    isValid = false;
  }
  res.status(200).json({
    status: 'success',
    data: {
      isValid,
      discountAmount,
    },
  });
});

exports.getAllDiscounts = catchAsync(async (req, res) => {
  const { active } = req.query;
  let query = {};

  if (active) {
    query.isActive = active === 'true';
  }

  const discounts = await Discount.find(query);

  res.status(200).json({
    status: 'success',
    results: discounts.length,
    data: {
      discounts,
    },
  });
});

exports.getDiscountById = catchAsync(async (req, res, next) => {
  const discount = await Discount.findById(req.params.id);

  if (!discount) {
    return next(new AppError('No discount found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      discount,
    },
  });
});

exports.createDiscount = catchAsync(async (req, res, next) => {
  const discount = await Discount.create(req.body);
  if (new Date(discount.startDate) >= new Date(discount.endDate)) {
    return next(
      new AppError('The start date must be before the end date', 404)
    );
  }
  if (new Date(discount.endDate) < Date.now()) {
    return next(new AppError('The end date must be in the future', 404));
  }

  res.status(201).json({
    status: 'success',
    data: {
      discount,
    },
  });
});

exports.updateDiscount = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const updates = req.body;

  const discount = await Discount.findById(id);
  if (!discount)
    return next(new AppError('No discount found with that ID', 404));

  // Update the discount fields with the provided data
  Object.keys(updates).forEach((key) => {
    discount[key] = updates[key];
  });

  await discount.save();

  res.status(200).json({
    status: 'success',
    data: {
      discount,
    },
  });
});

exports.updateDiscountUsage = catchAsync(async (discountId, userId) => {
  const discount = await Discount.findById(discountId);
  if (!discount) throw new AppError('No discount found with that ID', 404);

  // Ensure usedUser is a string
  const usedUserId = userId.toString();

  // Add the user to the usedUser array
  discount.usedUser.push(usedUserId);

  // Check if the discount has been used the maximum number of times
  if (discount.usedUser.length >= discount.maxUse) {
    discount.isActive = false;
  }
  await discount.save();
});

exports.deleteDiscount = catchAsync(async (req, res) => {
  await Discount.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
