import { Request, Response, NextFunction } from 'express';
import Discount, { IDiscount } from '../models/discountModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/AppError';
import Product from '../models/productModel';
import APIFeatures from '../utils/apiFeatures';

//TO VALIDATE IF THE DISCOUNT CODE IS USABLE AND RETURN THE DISCOUNT AMOUNT FOR FRONT END USAGE
export const checkDiscount = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const discountCode = req.params.id;
    const orderItems = req.body.lineItems;
    const userId = req.user.id;

    const { isValid, discountAmount } = await verifyDiscount(
      discountCode,
      orderItems,
      userId
    );

    res.status(200).json({
      status: 'success',
      data: {
        isValid,
        discountAmount,
      },
    });
  }
);

export const verifyDiscount = async (
  discountCode: string,
  lineItems: any,
  userId: string
) => {
  console.log('Discount code:', discountCode);

  if (!discountCode) {
    return {
      isValid: false,
      discountAmount: 0,
      discountId: null,
    };
  }

  console.log('hello');

  const discount = await Discount.findOne({
    code: discountCode.toUpperCase(),
  });

  let isValid = true;
  let discountAmount = 0;
  let discountId;
  if (discount) {
    if (!lineItems) {
      throw new AppError('Items does not exist', 404);
    }

    if (
      new Date(discount.endDate).getTime() < Date.now() &&
      discount.isActive
    ) {
      discount.isActive = false;
      await discount.save();
    }

    let totalPrice = 0;
    for (const item of lineItems) {
      const product = await Product.findById(item.product);
      if (!product) throw new AppError('No product found with that ID', 404);
      const variant = product.variants.find(
        (v) => v._id.toString() === item.variant
      );
      if (!variant) throw new AppError('No variant found with that ID', 404);
      totalPrice += variant.price * item.quantity;
    }

    const userUsageCount = discount.usedUser.filter(
      (usedUserId) => usedUserId.toString() === userId
    ).length;

    discountId = discount.id;

    if (
      !discount.isActive &&
      totalPrice < discount.minOrderValue &&
      userUsageCount >= discount.maxUsePerUser
    ) {
      isValid = false;
    } else {
      discountAmount = (totalPrice * discount.discountPercentage) / 100;
      discountAmount = Math.min(discountAmount, discount.discountMaxValue);
    }
  } else {
    isValid = false;
  }

  return {
    isValid,
    discountAmount,
    discountId,
  };
};

export const getAllDiscounts = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { remainingUses, isActive, startDate, endDate, search } = req.query;

    const query: any = {};

    if (remainingUses) {
      query.maxUse = { $gte: Number(remainingUses) };
    }

    if ('isActive' in req.query) {
      query.isActive = isActive === 'true';
    }

    if (startDate) {
      query.startDate = {};
      query.startDate.$gte = new Date(startDate as string);
    }

    if (endDate) {
      query.endDate = {};
      query.endDate.$lte = new Date(endDate as string);
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }, // ví dụ nếu có trường "code" voucher
      ];
    }

    const apiFeatures = new APIFeatures(Discount.find(query), req.query)
      .sort()
      .paginate();

    const [discounts, totalDiscounts] = await Promise.all([
      apiFeatures.query.exec(),
      Discount.countDocuments(query),
    ]);

    res.status(200).json({
      status: 'success',
      totalDiscounts,
      results: discounts.length,
      data: {
        discounts,
      },
    });
  }
);



export const getDiscountById = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
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
  }
);

export const createDiscount = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const discount = await Discount.create(req.body);
    if (new Date(discount.startDate) >= new Date(discount.endDate)) {
      return next(
        new AppError('The start date must be before the end date', 404)
      );
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
  }
);

export const updateDiscount = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const updates: Partial<IDiscount> = req.body;

    const discount = await Discount.findById(id);
    if (!discount)
      return next(new AppError('No discount found with that ID', 404));

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
  }
);

//UPDATE THE DISCOUNT USAGE, RUN AFTER ORDER IS PLACED
const updateDiscountUsage = async (discountId: String, userId: string) => {
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
};

export const deleteDiscount = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    await Discount.findByIdAndDelete(req.params.id);

    res.status(204).json({
      status: 'success',
      data: null,
    });
  }
);
