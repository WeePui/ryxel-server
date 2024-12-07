const Cart = require('../models/cartModel');
const Product = require('../models/productModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

const createCart = (userID) => {
  return Cart.create({
    user: userID,
  });
};

const calculateTotalPrice = (cart) => {
  let totalPrice = 0;
  cart.products.forEach((item) => {
    totalPrice += item.product.variants.id(item.variant).price * item.quantity;
  });
  return totalPrice.toFixed(2);
};

exports.createCart = catchAsync(async (req, res, next) => {
  const user = req.user.id;

  let cart = await Cart.findOne({ user: user });
  if (!cart) cart = await createCart(user);

  res.status(200).json({
    status: 'success',
    data: {
      cart,
    },
  });
});

exports.getCart = catchAsync(async (req, res, next) => {
  const cart = await Cart.findOne({ user: req.user.id }).populate(
    'products.product'
  );
  if (!cart) return next(new AppError('Cart does not exist', 404));
  cart.subtotal = calculateTotalPrice(cart);
  await cart.save();
  res.status(200).json({
    status: 'success',
    data: {
      cart,
    },
  });
});

exports.deleteCart = catchAsync(async (req, res, next) => {
  const cart = await Cart.findOneAndDelete({ user: req.user.id });
  if (!cart) return next(new AppError('Cart does not exist', 404));
  res.status(200).json({
    status: 'success',
  });
});

exports.addOrUpdateCartItem = catchAsync(async (req, res, next) => {
  const user = req.user.id;
  const productID = req.params.productID;
  const variantID = req.params.variantID;
  const { quantity } = req.body;

  let cart = await Cart.findOne({ user: user });
  if (!cart) cart = await createCart(user);

  const product = await Product.findById(productID);
  if (!product) {
    return next(new AppError('Product does not exist', 404));
  }

  const variant = product.variants.id(variantID);
  if (!variant) {
    return next(new AppError('Product variant does not exist', 404));
  }

  const cartItem = cart.products.find(
    (p) =>
      p.product.toString() === productID && p.variant.toString() === variantID
  );
  if (!cartItem) {
    if (quantity !== 0) {
      cart.products.push({ product: productID, variant: variantID, quantity });
    }
  } else {
    if (quantity === 0) {
      cart.products = cart.products.filter(
        (p) =>
          p.product.toString() !== productID ||
          p.variant.toString() !== variantID
      );
    } else {
      cartItem.quantity = quantity;
    }
  }

  await cart.save();
  res.status(200).json({
    status: 'success',
    data: {
      cart,
    },
  });
});

exports.deleteAllCartItems = catchAsync(async (req, res, next) => {
  const user = req.user.id;
  const cart = await Cart.findOne({ user: user });
  if (!cart) return next(new AppError('Cart does not exist', 404));

  cart.products = [];
  await cart.save();

  res.status(200).json({
    status: 'success',
    data: {
      cart,
    },
  });
});

exports.deleteCartItem = catchAsync(async (req, res, next) => {
  const user = req.user.id;
  const productID = req.params.productID;
  const variantID = req.params.variantID;
  const cart = await Cart.findOne({ user: user });
  if (!cart) return next(new AppError('Cart does not exist', 404));

  const cartItem = cart.products.find(
    (p) =>
      p.product.toString() === productID && p.variant.toString() === variantID
  );
  if (!cartItem) return next(new AppError('Cart item does not exist', 404));

  cart.products = cart.products.filter(
    (p) =>
      p.product.toString() !== productID || p.variant.toString() !== variantID
  );
  await cart.save();

  res.status(200).json({
    status: 'success',
    data: {
      cart,
    },
  });
});
