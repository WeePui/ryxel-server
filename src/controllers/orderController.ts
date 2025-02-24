import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Order from '../models/orderModel';
import Product from '../models/productModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/AppError';

// Create a new order
export const createOrder = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const newOrder = await Order.create(req.body);
    res.status(201).json({
        status: 'success',
        data: {
            order: newOrder
        }
    });
});

// Get an order by ID
export const getOrderByID = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const order = await Order.findById(req.params.id).populate('user').populate('shippingAddress').populate('products.product');
    if (!order) return next(new AppError('Order not found', 404));
    res.status(200).json({
        status: 'success',
        data: {
            order
        }
    });
});

// Update an order by ID
export const updateOrder = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const order = await Order.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true
    });

    if (!order) {
        return next(new AppError('No order found with that ID', 404));
    }

    res.status(200).json({
        status: 'success',
        data: {
            order
        }
    });
});

// Delete an order by ID
export const deleteOrder = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const order = await Order.findByIdAndDelete(req.params.id);

    if (!order) {
        return next(new AppError('No order found with that ID', 404));
    }

    res.status(204).json({
        status: 'success',
        data: null
    });
});

// Get all orders for a user
export const getAllOrders = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
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

    const orders = await Order.find(query).populate('User').populate('shippingAddress').populate('products.product');

    res.status(200).json({
        status: 'success',
        data: {
            orders
        }
    });
});

// Get user orders
export const getUserOrders = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
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

    const orders = await Order.find(query).populate('user').populate('shippingAddress').populate('products.product');

    res.status(200).json({
        status: 'success',
        data: {
            orders
        }
    });
});

// Cancel an order by ID
export const cancelOrder = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const order = await Order.findByIdAndUpdate(req.params.id, { status: 'Cancelled' }, {
        new: true,
        runValidators: true
    });

    if (!order) {
        return next(new AppError('No order found with that ID', 404));
    }

    res.status(200).json({
        status: 'success',
        data: {
            order
        }
    });
});

// Update order status
export const updateOrderStatus = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const order = await Order.findById(req.params.id);

    if (!order) {
        return next(new AppError('No order found with that ID', 404));
    }

    // Check if the order was placed more than 30 minutes ago
    const currentTime = new Date();
    const orderTime = new Date(order.createdAt);
    const timeDifference = (currentTime.getTime() - orderTime.getTime()) / (1000 * 60); // Time difference in minutes
    console.log('time', timeDifference);

    if (req.body.status === 'cancelled' && timeDifference > 30) {
        return next(new AppError('Order cannot be cancelled after 30 minutes from the order time', 400));
    }

    // Update the order status
    order.status = req.body.status;
    await order.save();

    // Process products if the order is cancelled
    if (req.body.status === 'cancelled') {
        for (const item of order.products) {
            console.log('item', item);
            const product = await Product.findById(item.product._id);
            if (!product) {
                return next(new AppError('No product found with that ID', 404));
            }
            const variant = product.variants.find(v => v._id.equals(item.variant));
            if (!variant) {
                return next(new AppError('No variant found with that ID', 404));
            }
            console.log('variant', variant);
            variant.stock += item.quantity;
            await product.save();
        }
    }

    res.status(200).json({
        status: 'success',
        data: {
            order
        }
    });
});
