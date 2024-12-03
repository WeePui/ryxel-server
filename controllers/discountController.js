const Discount = require('../models/discountModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Get all discounts
// Get disount by ID
// Create/update/delete discount
// Verify discount code(?)

/*const verifyDiscount = async (discountCode, userId) => {
  discountCode = discountCode.toUpperCase();
  const discount = await Discount.findOne({ code: discountCode });
  if (!discount) {
    return {
      isValid: false,
      message: 'Discount code is invalid',
    };
  }
  if (new Date(discount.endDate) < new Date.now() && discount.isActive) {
    discount.isActive = false;
  }
  if (!discount.isActive) {
    return {
      isValid: false,
      message: 'Discount code is not active',
    };
  }
  if (discount.maxUse <= discount.usageCount) {
    return {
      isValid: false,
      message: 'Discount code has reached its maximum usage',
    };
  }
  if (userId == discount.usedUser) {
    return {
      isValid: false,
      message: `Minimum order value of ${discount.minOrderValue} is required to use this discount code`,
    };
  }
};*/

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
    return next(new AppError('The start date must be before the end date', 404));
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
  if (!discount) return next(new AppError('No discount found with that ID', 404));

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

exports.updateDiscountUsage = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { usedUser } = req.body;

  const discount = await Discount.findById(id);
  if (!discount) return next(new AppError('No discount found with that ID', 404));

  // Ensure usedUser is a string
  const usedUserId = usedUser.toString();

  // Check if the user has already used the discount the maximum number of times
  const userUsageCount = discount.usedUser.filter(userId => userId.toString() === usedUserId).length;
  if (userUsageCount >= discount.maxUsePerUser) {
    return next(new AppError('User has reached the maximum number of uses for this discount', 400));
  }

  // Check if the discount has been used the maximum number of times
  if (discount.usedUser.length >= discount.maxUse) {
    return next(new AppError('Discount has reached the maximum number of uses', 400));
  }

  // Add the user to the usedUser array
  discount.usedUser.push(usedUserId);

  // Check if the discount should be deactivated
  if (new Date(discount.endDate) < Date.now() || discount.usedUser.length >= discount.maxUse) {
    discount.isActive = false;
  }

  await discount.save();

  res.status(200).json({
    status: 'success',
    data: {
      discount,
    },
  });
});


exports.deleteDiscount = catchAsync(async (req, res) => {
  await Discount.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});


