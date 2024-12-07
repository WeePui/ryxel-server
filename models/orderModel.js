const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
            required: [true, 'Order must belong to a user!'],
        },
        checkout: {
            type: new mongoose.Schema({
                total: Number,
                shippingFee: Number,
                discount: Number
            }),
            required: [true, 'Order must have a checkout!']
        },
        payment: {
            //TO BE CHANGED WHEN PAYMENT IS ADDED
            type: new mongoose.Schema({
                method: String,
                transactionId: String
            }),
            required: [true, 'Order must have a payment!']
        },
        shippingAddress: {
            type: mongoose.Schema.ObjectId,
            ref: 'ShippingAddress',
            required: [true, 'Order must have a shipping address!']
        },
        status: {
            type: String,
            enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
            default: 'pending',
        },
        products: {
            type: [{
                product: { type: mongoose.Schema.ObjectId, ref: 'Product' },
                variant: { type: mongoose.Schema.ObjectId, ref: 'Product.variants' },
                quantity: Number
            }],
            required: [true, 'Order must have products!']
        },
    },
    { timestamps: true }
);

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
