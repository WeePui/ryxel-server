import { Request, Response, NextFunction } from 'express';
import mongoose, { ObjectId } from 'mongoose';
import User from '../models/userModel';
import Cart from '../models/cartModel';
import Order from '../models/orderModel';
import Product from '../models/productModel';
import Discount from '../models/discountModel';
import ShippingAddress from '../models/shippingAddressModel';
import * as discountController from './discountController';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/AppError';
import * as shippingController from '../utils/shippingFee';
import { strict } from 'node:assert';

/*
const updateDiscountUsage = async (discount: mongoose.Types.ObjectId, user: typeof User) => {
  
  // Ensure usedUser is a string
  const usedUserId = userId.toString();

  // Add the user to the usedUser array
  discount.usedUser.push(usedUserId as any);

  // Check if the discount has been used the maximum number of times
  if (discount.usedUser.length >= discount.maxUse) {
    discount.isActive = false;
  }
  await discount.save();
};
*/
const getShippingFee = async (district: number, ward: string, weight: number) => {
  const from_district = 3695;
  const shippingFee = await shippingController.calculateShippingFee(
    from_district,
    district,
    ward,
    weight
  );
  return shippingFee;
};

// Helper function to calculate total price
const calculateTotalPrice = (cart: any) => {
  let totalPrice = 0;
  cart.products.forEach((item: any) => {
    totalPrice += item.product.variants.id(item.variant).price * item.quantity;
    console.log('price', item.product.variants.id(item.variant).price);
  });
  console.log('Total', totalPrice);
  return totalPrice;
};

export const checkout = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  let userID = req.user.id;
  const user = User.findById(userID);
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  //const user = new mongoose.Types.ObjectId(req.user.id);
  let shippingAddressId: ObjectId;
  let shippingWard: any, shippingDistrict: any = 0;

  if (!req.body.shippingAddress) {
    const shippingAddress = await ShippingAddress.findOne({
      user: user,
      isDefault: true,
    });
    if (!shippingAddress) {
      return next(new AppError('Shipping address not found', 404));
    }
    shippingAddressId = shippingAddress._id;
    shippingWard = shippingAddress.ward;
    shippingDistrict = shippingAddress.district;
  } else {
    const shippingAddress = await ShippingAddress.findById(req.body.shippingAddress);
    if (!shippingAddress) {
      return next(new AppError('Shipping address not found', 404));
    }
    shippingAddressId = shippingAddress._id;
    shippingWard = shippingAddress.ward.code;
    shippingDistrict = shippingAddress.district.code;
  }

  const discount = await Discount.findOne({ code: req.body.code });

  // Validate cart
  const cart = await Cart.findOne({ user: user }).populate('products.product');
  if (!cart || cart.products.length === 0) {
    return next(new AppError('Cart is empty or does not exist', 404));
  }

  let weight = 0;
  // Check product details and availability
  for (const item of cart.products) {
    const product = await Product.findById(item.product._id);
    if (!product) {
      return next(new AppError(`Product with ID ${item.product._id} does not exist`, 404));
    }

    const variant = product.variants.find(v => v._id.equals(item.variant));
    if (!variant) {
      return next(new AppError(`Variant with ID ${item.variant} does not exist for product ${product.name}`, 404));
    }
    console.log('cart', item.quantity);
    if (variant.stock < item.quantity) {
      return next(new AppError(`Insufficient stock for variant ${variant.name} of product ${product.name}`, 400));
    }
    weight += (variant.weight || 0) * item.quantity;
  }

  const shippingFee = await getShippingFee(
    shippingDistrict.code,
    shippingWard.code,
    weight
  );
  console.log('Shipping Fee:', shippingFee);

  // Calculate total and discounted prices
  const totalPrice = calculateTotalPrice(cart);

  // Validate discount
  let discountAmount = 0;
  if (discount) {
    if (new Date(discount.endDate).getTime() < Date.now() && discount.isActive) {
      discount.isActive = false;
    }
    const usedUserId = req.user.id.toString();
    const userUsageCount = discount.usedUser.filter(
      (userId: any) => userId.toString() === usedUserId
    ).length;
    if (userUsageCount >= discount.maxUsePerUser) {
      throw new AppError('User has reached the maximum number of uses for this discount', 400);
    }
    if (!discount.isActive) {
      return next(new AppError('Discount code is not active', 404));
    }
    if (totalPrice < discount.minOrderValue) {
      return next(new AppError(`Minimum order value of ${discount.minOrderValue} is required to use this discount code`, 404));
    }
    discountAmount = (totalPrice * discount.discountPercentage) / 100;
    if (discountAmount > discount.discountMaxValue) {
      discountAmount = discount.discountMaxValue;
    }
  } else {
    return next(new AppError('Discount code is invalid', 404));
  }

  // Process payment (this is a placeholder, integrate with a real payment gateway)
  const paymentResult = {
    status: 'success',
    transactionId: 'txn_123456',
  };

  if (paymentResult.status !== 'success') {
    return next(new AppError('Payment failed', 400));
  }

  // Create order
  const newOrder = await Order.create({
    user: user,
    checkout: {
      total: totalPrice,
      shippingFee: shippingFee, // to be changed when update shipping fee API
      discount: discountAmount,
    },
    payment: {
      method: 'Credit Card', // Example payment method
      transactionId: paymentResult.transactionId,
    },
    shippingAddress: shippingAddressId,
    status: 'pending',
    products: cart.products,
  });

  // Reduce stock for each product variant
  for (const item of cart.products) {
    const product = await Product.findById(item.product._id);
    if (product) {
      if (product.sold !== undefined) {
        product.sold += item.quantity;
      }
      const variant = product.variants.find(v => v._id.equals(item.variant));
      if (variant) {
        variant.stock -= item.quantity;
        if (variant.sold !== undefined) {
          variant.sold += item.quantity;
        }
        await product.save();
      }
    }
  }

  // Update discount usage. UNKNOW HOW TO IMPLEMENT NEED HELP
  /*
  if (discount) {
    await updateDiscountUsage((discount.id), user);
  }
  */

  // Clear cart
  cart.products = [];
  await cart.save();

  res.status(201).json({
    status: 'success',
    data: {
      order: newOrder,
    },
  });
});
