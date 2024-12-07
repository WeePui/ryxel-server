const Order = require('../models/orderModel');
const Product = require('../models/productModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Create a new order
exports.createOrder = catchAsync(async (req, res, next) => {
    const newOrder = await Order.create(req.body);
    res.status(201).json({
        status: 'success',
        data: {
            order: newOrder
        }
    });
});

// Get an order by ID
exports.getOrderByID = catchAsync(async (req, res, next) => {
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
exports.updateOrder = catchAsync(async (req, res, next) => {
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
exports.deleteOrder = catchAsync(async (req, res, next) => {
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
exports.getAllOrders = catchAsync(async (req, res, next) => {
    const { status, startDate, endDate } = req.query;

    // Build the query object
    let query = {};

    if (status) {
        query.status = status;
    }

    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
            query.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
            query.createdAt.$lte = new Date(endDate);
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


exports.getUserOrders = catchAsync(async (req, res, next) => {
    const user = req.user.id;
    const { status, startDate, endDate } = req.query;

    // Build the query object
    let query = { user: user };

    if (status) {
        query.status = status;
    }

    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
            query.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
            query.createdAt.$lte = new Date(endDate);
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

exports.cancelOrder = catchAsync(async (req, res, next) => {
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
})

exports.updateOrderStatus = catchAsync(async (req, res, next) => {
    const order = await Order.findById(req.params.id);

    if (!order) {
        return next(new AppError('No order found with that ID', 404));
    }

    // Check if the order was placed more than 30 minutes ago
    const currentTime = new Date();
    const orderTime = new Date(order.createdAt);
    const timeDifference = (currentTime - orderTime) / (1000 * 60); // Time difference in minutes
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
            const variant = product.variants.id(item.variant);
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


