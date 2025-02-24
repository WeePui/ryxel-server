import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Discount, { IDiscount } from '../models/discountModel'
import Cart from '../models/cartModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/AppError';

export const verifyDiscount = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const discountCode = req.params.id;
  const discount = await Discount.findOne({
    code: discountCode.toString().toUpperCase(),
  });

  let isValid = true;
  // Validate discount
  let discountAmount = 0;
  if (discount) {
    if (new Date(discount.endDate).getTime() < Date.now() && discount.isActive) {
      discount.isActive = false;
    }
    const usedUserId = req.user.id.toString();
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return next(new AppError('Cart does not exist', 404));
    }
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

export const getAllDiscounts = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { active } = req.query;
  let query: { isActive?: boolean } = {};

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

export const getDiscountById = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
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

export const createDiscount = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const discount = await Discount.create(req.body);
  if (new Date(discount.startDate) >= new Date(discount.endDate)) {
    return next(new AppError('The start date must be before the end date', 404));
  }
  if (new Date(discount.endDate).getTime() < Date.now()) {
    return next(new AppError('The end date must be in the future', 404));
  }

  res.status(201).json({
    status: 'success',
    data: {
      discount,
    },
  });
});

export const updateDiscount = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const updates: Partial<IDiscount> = req.body;

  const discount = await Discount.findById(id);
  if (!discount) return next(new AppError('No discount found with that ID', 404));

  // Update the discount fields with the provided data
  Object.keys(updates).forEach((key) => {
    if (key in discount) {
      discount.set(key, updates[key as keyof IDiscount]);
    }
  });

  await discount.save();

  res.status(200).json({
    status: 'success',
    data: {
      discount,
    },
  });
});

//TO BE UPDATE AND PUT IN THE CHECKOUT PROCESS
/*export const updateDiscountUsage = catchAsync(async (discountId: String, userId: ) => {
  const discount = await Discount.findById(discountId);
  if (!discount) throw new AppError('No discount found with that ID', 404);

  // Ensure usedUser is a string
  const usedUserId = userId.toString();

  // Add the user to the usedUser array
  discount.usedUser.push(usedUserId as any);

  // Check if the discount has been used the maximum number of times
  if (discount.usedUser.length >= discount.maxUse) {
    discount.isActive = false;
  }
  await discount.save();
});*/

export const deleteDiscount = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  await Discount.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
