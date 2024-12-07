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
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
      variant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product.variants',
      },
      quantity: Number,
    },
  ],
  subtotal: {
    type: Number,
    default: 0,
  },
});

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;
