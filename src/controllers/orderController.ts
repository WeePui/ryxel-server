import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Order from '../models/orderModel';
import Product from '../models/productModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/AppError';
import * as shippingController from '../utils/shippingFee';
import ShippingAddress from '@models/shippingAddressModel';

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
      (v) => v._id.toString() === item.variant
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
      console.log('Order not found');
      return;
    }
    await order.save();
    if (status === 'cancelled') increaseStock(order.lineItems);

    console.log('Order status updated to', order.status);
  } catch (error) {
    console.error('Error updating order status:', error);
  }
};

const getShippingFee = async (
  district: number,
  ward: string,
  weight: number
) => {
  const from_district = 3695;
  const shippingFee = await shippingController.calculateShippingFee(
    from_district,
    district,
    ward,
    weight
  );
  return shippingFee;
};

const calculateTotalPrice = (cart: any) => {
  let totalPrice = 0;
  cart.forEach((item: any) => {
    totalPrice += item.quantity * item.unitPrice;
  });
  console.log('Total', totalPrice);
  return totalPrice;
};

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
      const shippingAddressID = req.body.address;
      const paymentMethod = req.body.paymentMethod;
      const userID = req.user.id;
      const orderItems = req.body.lineItems;

      let status = 'unpaid';
      if (paymentMethod === 'cod') {
        status = 'pending';
      }

      const orderProducts = orderItems.map((item: any) => ({
        product: item.product,
        variant: item.variant,
        quantity: item.quantity,
        unitPrice: item.unitPrice, // Include unitPrice if provided by the frontend
      }));

      const newOrder = await Order.create(
        [
          {
            user: userID,
            paymentMethod,
            shippingAddress: shippingAddressID,
            status,
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
      next(err); // Pass the error to the next middleware
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
      .populate('lineItems.variant');
    if (!order) return next(new AppError('Order not found', 404));

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

    const orders = await Order.find(query)
      .populate('User')
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

    const orders = await Order.find(query)
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
    const orders = await Order.find()
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

// Cancel an order by ID from user side
export const cancelOrder = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return next(new AppError('No order found with that ID', 404));
    }
    // Check if the order was placed more than 30 minutes ago
    const currentTime = new Date();
    const orderTime = new Date(order.createdAt);
    const timeDifference =
      (currentTime.getTime() - orderTime.getTime()) / (1000 * 60); // Time difference in minutes
    console.log('time', timeDifference);

    if (timeDifference > 30) {
      return next(
        new AppError(
          'Order cannot be cancelled after 30 minutes from the order time',
          400
        )
      );
    } else {
      increaseStock(order.lineItems);

      res.status(200).json({
        status: 'success',
        data: {
          order,
        },
      });
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
    if (order.status === 'cancelled') increaseStock(order.lineItems);

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
