import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Order from '../models/orderModel';
import Product from '../models/productModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/AppError';
import ShippingAddress from '../models/shippingAddressModel';
import {
  calculateShippingFee,
  getExpectedDeliveryDate,
  getService,
} from '../utils/shippingFeeService';
import { refundStripePayment, refundZaloPayPayment } from './paymentController';
import { verifyDiscount } from './discountController';
import APIFeatures from '../utils/apiFeatures';

const reduceStock = async (
  orderItems: any,
  session?: mongoose.ClientSession // Optional session parameter
) => {
  for (const item of orderItems) {
    const product = await Product.findById(item.product).session(
      session ?? null
    ); // Use session if provided
    if (!product) throw new AppError('No product found with that ID', 404);

    const variant = product.variants.find(
      (v) => v._id.toString() === item.variant
    );
    if (!variant) throw new AppError('No variant found with that ID', 404);

    variant.stock -= item.quantity;
    variant.sold += item.quantity;
    product.sold += item.quantity;

    await product.save({ session: session ?? null }); // Save with session if provided
  }
};

const increaseStock = async (
  orderItems: any,
  session?: mongoose.ClientSession // Optional session parameter
) => {
  for (const item of orderItems) {
    const product = await Product.findById(item.product).session(
      session ?? null
    ); // Use session if provided
    if (!product) throw new AppError('No product found with that ID', 404);

    const variant = product.variants.find(
      (v) => v._id.toString() === item.variant.toString()
    );
    if (!variant) throw new AppError('No variant found with that ID', 404);

    variant.stock += item.quantity;
    if (variant.sold && variant.sold >= item.quantity)
      variant.sold -= item.quantity;
    if (product.sold && product.sold >= item.quantity)
      product.sold -= item.quantity;

    await product.save({ session: session ?? null }); // Save with session if provided
  }
};

export const changeOrderStatus = async (orderID: string, status: string) => {
  try {
    const order = await Order.findByIdAndUpdate(
      new mongoose.Types.ObjectId(orderID),
      { status: status },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!order) {
      throw new AppError('No order found with that ID', 404);
    }

    await order.save();
    if (status === 'cancelled') {
      await increaseStock(order.lineItems);
    }
  } catch (error) {
    console.error('Error updating order status:', error);
  }
};

export const getShippingFee = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { toDistrictCode, toWardCode } = req.query;
    const { lineItems } = req.body;

    const weight = await calculateTotalWeight(lineItems);

    if (!toDistrictCode || !toWardCode) {
      return next(new AppError('Missing required parameters', 400));
    }

    const service = await getService(Number(toDistrictCode));
    if (!service) return next(new AppError('Cannot get service', 400));

    const shippingFee = await calculateShippingFee(
      service.service_id,
      Number(toDistrictCode),
      toWardCode as string,
      Number(weight)
    );

    if (shippingFee === -1) {
      return next(new AppError('Address is invalid', 400));
    }

    const expectedDeliveryDate = await getExpectedDeliveryDate(
      service.service_id,
      Number(toDistrictCode),
      toWardCode as string
    );

    res.status(200).json({
      status: 'success',
      data: {
        shippingFee,
        expectedDeliveryDate,
      },
    });
  }
);

// Create a new order
export const createOrder = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const unpaidOrder = await Order.findOne({
      user: req.user.id,
      status: 'unpaid',
    });

    if (unpaidOrder) {
      return next(
        new AppError(
          'You have an unpaid order. Please complete the payment',
          400
        )
      );
    }

    const session = await mongoose.startSession(); // Start a session
    session.startTransaction(); // Start a transaction

    try {
      const shippingAddressId = req.body.address;
      const paymentMethod = req.body.paymentMethod;
      const userId = req.user.id;
      const orderItems = req.body.lineItems;
      const discountCode = req.body.code;

      let status = 'unpaid';
      if (paymentMethod === 'cod') {
        status = 'pending';
      }

      const orderProducts = orderItems.map((item: any) => ({
        product: item.product,
        variant: item.variant,
        quantity: item.quantity,
      }));

      const {
        isValid: discountValid,
        discountAmount,
        discountId,
      } = await verifyDiscount(discountCode, orderItems, userId);

      const totalWeight = await calculateTotalWeight(orderProducts);

      const shippingAddress = await ShippingAddress.findOne({
        _id: shippingAddressId,
      });
      if (!shippingAddress)
        throw new AppError('No shipping address found', 400);

      const service = await getService(shippingAddress.district.code);
      if (!service) return next(new AppError('Cannot get service', 400));

      const shippingFee = await calculateShippingFee(
        service.service_id,
        shippingAddress.district.code,
        shippingAddress.ward.code,
        totalWeight
      );
      if (shippingFee === -1)
        return next(new AppError('Address is invalid', 400));

      const newOrder = await Order.create(
        [
          {
            user: userId,
            paymentMethod,
            shippingAddress: shippingAddressId,
            shippingFee,
            status,
            ...(discountValid &&
              discountAmount !== 0 && { discount: discountId, discountAmount }),
            lineItems: orderProducts,
          },
        ],
        { session } // Pass the session to the create method
      );

      await reduceStock(orderProducts, session);

      await session.commitTransaction(); // Commit the transaction
      session.endSession();

      res.status(201).json({
        status: 'success',
        data: {
          order: newOrder[0],
        },
      });
    } catch (err) {
      await session.abortTransaction(); // Roll back transaction in case of error
      session.endSession();

      console.log('Error creating order:', err);

      return next(
        new AppError(`Cannot process the order: ${(err as Error).message}`, 400)
      );
    }
  }
);

// Get an order by ID
export const getOrderByID = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const order = await Order.findById(req.params.id)
      .populate('user')
      .populate('shippingAddress')
      .populate('lineItems.product')
      .populate('lineItems.review');

    if (!order) return next(new AppError('Order not found', 404));

    if (req.user.role === 'admin')
      res.status(200).json({
        status: 'success',
        data: {
          order,
        },
      });

    if (order.user._id.toString() !== req.user.id)
      return next(
        new AppError('You are not authorized to access this order', 403)
      );

    res.status(200).json({
      status: 'success',
      data: {
        order,
      },
    });
  }
);

// Update an order by ID
export const updateOrder = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const order = await Order.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!order) {
      return next(new AppError('No order found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        order,
      },
    });
  }
);

// Delete an order by ID
export const deleteOrder = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const order = await Order.findByIdAndDelete(req.params.id);

    if (!order) {
      return next(new AppError('No order found with that ID', 404));
    }

    res.status(204).json({
      status: 'success',
      data: null,
    });
  }
);

// Get all orders from user side
export const getAllOrders = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { status, startDate, endDate } = req.query;

    // Build the query object
    let query: any = {};

    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate as string);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate as string);
      }
    }

    let apiFeatures = new APIFeatures(Order.find(), req.query);
    apiFeatures = await apiFeatures.search();

    const orders = await apiFeatures.query
      .populate('user')
      .populate('shippingAddress')
      .populate('lineItems.product');

    res.status(200).json({
      status: 'success',
      data: {
        orders,
      },
    });
  }
);

// Get 1 user orders
export const getUserOrders = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user.id;
    const { status, startDate, endDate } = req.query;

    // Build the query object
    let query: any = { user: user };

    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate as string);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate as string);
      }
    }

    let apiFeatures = new APIFeatures(Order.find({ user }), req.query);
    apiFeatures = await apiFeatures.search();

    const orders = await apiFeatures.query
      .populate('user')
      .populate('shippingAddress')
      .populate('lineItems.product');

    res.status(200).json({
      status: 'success',
      data: {
        orders,
      },
    });
  }
);

export const getAdminOrders = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    let apiFeatures = new APIFeatures(Order.find(), req.query);
    apiFeatures = await apiFeatures.search();

    const totalResults = await apiFeatures.count();

    const orders = await apiFeatures.query
      .populate('user')
      .populate('shippingAddress')
      .populate('lineItems.product');

    res.status(200).json({
      status: 'success',
      data: {
        totalResults,
        orders,
      },
    });
  }
);

// Cancel an order by ID from user side
export const cancelOrder = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return next(new AppError('No order found with that ID', 404));
    }

    if (order.status !== 'unpaid' && order.status !== 'pending') {
      return next(new AppError('Order cannot be cancelled', 400));
    }

    const session = await mongoose.startSession(); // Start a session
    session.startTransaction(); // Start a transaction

    try {
      if (order.status !== 'unpaid') {
        // Check if the order was placed more than 30 minutes ago
        const currentTime = new Date();
        const orderTime = new Date(order.createdAt);
        const timeDifference =
          (currentTime.getTime() - orderTime.getTime()) / (1000 * 60); // Time difference in minutes

        if (timeDifference > 30) {
          return next(
            new AppError(
              'Order cannot be cancelled after 30 minutes from the order time',
              400
            )
          );
        }
      }

      if (order.paymentMethod === 'stripe' && order.status !== 'unpaid')
        await refundStripePayment(
          order.checkout!.paymentId,
          order.checkout!.amount
        );

      if (order.paymentMethod === 'zalopay' && order.status !== 'unpaid')
        await refundZaloPayPayment(
          order.checkout!.paymentId,
          order.checkout!.amount
        );

      order.status = 'cancelled';

      await increaseStock(order.lineItems, session);
      await order.save({ session });

      await session.commitTransaction();

      res.status(200).json({
        status: 'success',
        data: {
          order,
        },
      });
    } catch (err) {
      await session.abortTransaction(); // Roll back transaction in case of error
      session.endSession();
      return next(new AppError('Error', 400)); // Pass the error to the next middleware
    }
  }
);

// Update order status
export const updateOrderStatus = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return next(new AppError('No order found with that ID', 404));
    }

    // Update the order status
    order.status = req.body.status;
    await order.save();
    if (order.status === 'cancelled') await increaseStock(order.lineItems);

    res.status(200).json({
      status: 'success',
      data: {
        order,
      },
    });
  }
);

export const checkUnpaidOrder = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const unpaidOrder = await Order.findOne({
      user: new mongoose.Types.ObjectId(req.user.id), // Cast to ObjectId
      status: 'unpaid',
    });

    if (!unpaidOrder) {
      return res.status(404).json({
        status: 'fail',
        message: 'No unpaid order found for this user',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        unpaidOrder,
      },
    });
  }
);

export const getOrderByOrderCode = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const orderCode = req.params.code;
    const userId = req.user.id;

    const order = await Order.findOne({ orderCode, user: userId })
      .populate('user')
      .populate('shippingAddress')
      .populate('lineItems.product')
      .populate('lineItems.review');

    if (!order) {
      return next(new AppError('No order found with that code', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        order,
      },
    });
  }
);

export const addPaymentId = async (
  orderId: string,
  checkout: { paymentId: string; checkoutId: string; amount: number }
) => {
  const order = await Order.findById(orderId);
  if (!order) {
    throw new AppError('No order found with that ID', 404);
  }

  order.checkout = {
    paymentId: checkout.paymentId,
    checkoutId: checkout.checkoutId,
    amount: checkout.amount,
  };
  await order.save();
};

const calculateTotalWeight = async (orderItems: any) => {
  let totalWeight = 0;

  for (const item of orderItems) {
    const product = await Product.findById(item.product);
    if (!product) throw new AppError('No product found with that ID', 404);

    const variant = product.variants.find(
      (v) => v._id.toString() === item.variant
    );
    if (!variant) throw new AppError('No variant found with that ID', 404);

    if (!variant.weight) throw new AppError('No weight found for variant', 404);
    totalWeight += variant.weight * item.quantity;
  }

  if (totalWeight <= 1000) totalWeight = 1000;

  return totalWeight;
};
