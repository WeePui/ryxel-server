const Cart = require('../models/cartModel');
const Product = require('../models/productModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

const createCart = (userID) => {
    return Cart.create({
        user: userID
    });
};


exports.addToCart = catchAsync(async (req, res, next) => {
    const user = req.user.id;
    const { productId, quantity } = req.body;;

    let cart = await Cart.findOne({ user: user });
    if (!cart) cart = await createCart(user);

    const product = await Product.findById(productId);
    if (!product) {
        console.log('Product not found:', productId); // Log if product is not found
        return next(new AppError('Product does not exist', 404));
    }

    const cartItem = cart.products.find((p) => p.productId.toString() === productId);
    if (cartItem) {
        cartItem.quantity += quantity;
    } else {
        cart.products.push({ productId, quantity }); // Add the product to the cart
    }

    await cart.save();  // Save the updated cart
    res.status(200).json({
        status: 'success',
        data: {
            cart
        },
    });
});


exports.getCart = catchAsync(async (req, res, next) => {
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) return next(new AppError('Cart does not exist', 404));
    res.status(200).json({
        status: 'success',
        data: {
            cart
        },
    });
})

//remove the cart
exports.deleteCart = catchAsync(async (req, res, next) => {
    const cart = await Cart.findOneAndDelete({ user: req.user.id });
    if (!cart) return next(new AppError('Cart does not exist', 404));
    res.status(200).json({
        status: 'success'
    });
})

exports.updateCartItems = catchAsync(async (req, res, next) => {
    const user = req.user.id;
    const productID = req.params.productID; // Accessing the productID from the URL parameter
    const { quantity } = req.body; // Assuming quantity is passed in the request body

    const cart = await Cart.findOne({ user: user });
    if (!cart) return next(new AppError('Cart does not exist', 404));

    const product = await Product.findById(productID);
    if (!product) return next(new AppError('Product does not exist', 404));

    const cartItem = cart.products.find((p) => p.productId.toString() === productID);
    if (!cartItem) return next(new AppError('Cart item does not exist', 404));

    if (quantity !== undefined) {
        // Update the quantity
        cartItem.quantity = quantity;
    } else {
        cartItem.quantity++;
    }

    await cart.save();

    res.status(200).json({
        status: 'success',
        data: {
            cart
        },
    });
});


//Remove all products from cart
exports.deleteAllCartItems = catchAsync(async (req, res, next) => {
    const user = req.user.id;
    const cart = await Cart.findOne({ user: user });
    if (!cart) return next(new AppError('Cart does not exist', 404));

    cart.products = []; // Clear all items in the cart
    await cart.save();

    res.status(200).json({
        status: 'success',
        data: {
            cart
        },
    });
});

//Remove a single product from cart
exports.deleteCartItem = catchAsync(async (req, res, next) => {
    const user = req.user.id;
    const productID = req.params.productID; // Accessing the productID from the URL parameter
    const cart = await Cart.findOne({ user: user });
    if (!cart) return next(new AppError('Cart does not exist', 404));

    const cartItem = cart.products.find((p) => p.productId.toString() === productID);
    if (!cartItem) return next(new AppError('Cart item does not exist', 404));

    cart.products = cart.products.filter((p) => p.productId.toString() !== productID);
    await cart.save();

    res.status(200).json({
        status: 'success',
        data: {
            cart
        },
    });
});





