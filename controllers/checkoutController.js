const Cart = require('../models/cartModel');
const Order = require('../models/orderModel');
const Product = require('../models/productModel');
const Discount = require('../models/discountModel');
const ShippingAddress = require('../models/shippingAddressModel');
const discountController = require('../controllers/discountController');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const shippingController = require('../utils/shippingFee');
/*PAYLOAD EXAMPLE
{
    
}
*/

const getShippingFee = async (district, ward, weight) => {
  const from_district = 3695;
  const shippingFee = await shippingController.calculateShippingFee(
    from_district,
    district,
    ward.toString(),
    weight
  );
  return shippingFee;
};

// Helper function to calculate total price
const calculateTotalPrice = (cart) => {
  let totalPrice = 0;
  cart.products.forEach((item) => {
    totalPrice += item.product.variants.id(item.variant).price * item.quantity;
    console.log('price', item.product.variants.id(item.variant).price);
  });
  console.log('Total', totalPrice);
  return totalPrice;
};

exports.checkout = catchAsync(async (req, res, next) => {
  const user = req.user.id;
  let shippingAddressId = 0;
  let shippingWard,
    shippingDistrict = 0;
  if (!req.body.shippingAddress) {
    const shippingAddress = await ShippingAddress.findOne({
      user: user,
      isDefault: true,
    });
    if (!shippingAddress) {
      return next(new AppError('Shipping address not found', 404));
    }
    shippingAddressId = shippingAddress._id;
    shippingWard = shippingAddress.ward;
    shippingDistrict = shippingAddress.district;
  } else {
    const shippingAddress = await ShippingAddress.findById(
      req.body.shippingAddress
    );
    if (!shippingAddress) {
      return next(new AppError('Shipping address not found', 404));
    }
    shippingAddressId = shippingAddress._id;
    shippingWard = shippingAddress.ward.code;
    shippingDistrict = shippingAddress.district.code;
  }

  const discount = await Discount.findOne({ code: req.body.code });

  // Validate cart
  const cart = await Cart.findOne({ user: user }).populate('products.product');
  if (!cart || cart.products.length === 0) {
    return next(new AppError('Cart is empty or does not exist', 404));
  }
  let weight = 0;
  // Check product details and availability
  for (const item of cart.products) {
    const product = await Product.findById(item.product._id);
    if (!product) {
      return next(
        new AppError(`Product with ID ${item.product._id} does not exist`, 404)
      );
    }

    const variant = product.variants.id(item.variant);

    if (!variant) {
      return next(
        new AppError(
          `Variant with ID ${item.variant} does not exist for product ${product.name}`,
          404
        )
      );
    }
    console.log('cart', item.quantity);
    if (variant.stock < item.quantity) {
      return next(
        new AppError(
          `Insufficient stock for variant ${variant.name} of product ${product.name}`,
          400
        )
      );
    }
    weight += variant.weight * item.quantity;
  }
  const shippingFee = await getShippingFee(
    shippingDistrict.code,
    shippingWard.code,
    weight,
    res
  );
  console.log('Shipping Fee:', shippingFee);
  // Calculate total and discounted prices
  const totalPrice = calculateTotalPrice(cart);

  // Validate discount
  let discountAmount = 0;
  if (discount) {
    if (new Date(discount.endDate) < Date.now() && discount.isActive) {
      discount.isActive = false;
    }
    usedUserId = req.user.id.toString();
    const userUsageCount = discount.usedUser.filter(
      (userId) => userId.toString() === usedUserId
    ).length;
    if (userUsageCount >= discount.maxUsePerUser) {
      throw new AppError(
        'User has reached the maximum number of uses for this discount',
        400
      );
    }
    if (!discount.isActive) {
      return next(new AppError('Discount code is not active', 404));
    }
    if (totalPrice < discount.minOrderValue) {
      return next(
        new AppError(
          `Minimum order value of ${discount.minOrderValue} is required to use this discount code`,
          404
        )
      );
    }
    discountAmount = (totalPrice * discount.discountPercentage) / 100;
    if (discountAmount > discount.discountMaxValue) {
      discountAmount = discount.discountMaxValue;
    }
  } else return next(new AppError('Discount code is invalid', 404));

  // Process payment (this is a placeholder, integrate with a real payment gateway)
  const paymentResult = {
    status: 'success',
    transactionId: 'txn_123456',
  };

  if (paymentResult.status !== 'success') {
    return next(new AppError('Payment failed', 400));
  }

  // Create order
  const newOrder = await Order.create({
    user: user,
    checkout: {
      total: totalPrice,
      shippingFee: shippingFee, //to be changed when update shipping fee API
      discount: discountAmount,
    },
    payment: {
      method: 'Credit Card', // Example payment method
      transactionId: paymentResult.transactionId,
    },
    shippingAddress: shippingAddressId,
    status: 'pending',
    products: cart.products,
  });

  // Reduce stock for each product variant
  for (const item of cart.products) {
    const product = await Product.findById(item.product._id);
    product.sold += item.quantity;
    const variant = product.variants.id(item.variant);
    variant.stock -= item.quantity;
    variant.sold += item.quantity;
    await product.save();
  }

  // Update discount usage
  await discountController.updateDiscountUsage(discount._id, user);

  // Clear cart
  cart.products = [];
  //await cart.save();

  res.status(201).json({
    status: 'success',
    data: {
      order: newOrder,
    },
  });
});
