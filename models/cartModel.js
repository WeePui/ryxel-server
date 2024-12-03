const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Cart must belong to a user!'],
    },
    products: [
        {
            product: {
                type: mongoose.Schema.ObjectId,
                ref: 'Product',
                required: [true, 'Cart must contains a product!'],
            },
            quantity: {
                type: Number,
                default: 1,
            },
        },
    ],
});

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;