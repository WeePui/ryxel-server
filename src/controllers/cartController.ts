import { Request, Response, NextFunction } from 'express';
import mongoose, { Document } from 'mongoose';
import Cart from '../models/cartModel';
import Product from '../models/productModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/AppError';
import { removeCartItem } from './orderController';

interface ICart extends Document {
  user: mongoose.Types.ObjectId;
  products: {
    product: mongoose.Types.ObjectId;
    variant: mongoose.Types.ObjectId;
    quantity: number;
  }[];
}

export const createCart = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user.id;

    let cart = await Cart.findOne({ user });
    if (!cart)
      cart = await Cart.create({
        user: user,
      });

    res.status(200).json({
      status: 'success',
      data: {
        cart,
      },
    });
  }
);

export const getCart = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    let cart = await Cart.findOne({ user: req.user.id });
    if (!cart)
      cart = await Cart.create({
        user: req.user.id
      });

    for (const item of cart?.lineItems || []) {
      const product = await Product.findById(item.product);
      if (product?.isDeleted) {
        cart.removeCartItem(item.product, item.variant);
      }
    }
    cart = await Cart.findOne({ user: req.user.id }).populate({
      path: 'lineItems.product',
      model: 'Product',
    });

    res.status(200).json({
      status: 'success',
      data: {
        cart,
      },
    });
  }
);

export const deleteCart = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const cart = await Cart.findOneAndDelete({ user: req.user.id });
    if (!cart) return next(new AppError('Cart does not exist', 404));

    res.status(200).json({
      status: 'success',
    });
  }
);

export const addOrUpdateCartItem = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user.id;
    const productID = req.params.productID;
    const variantID = req.params.variantID;
    const { quantity } = req.body;

    let cart = await Cart.findOne({ user });
    if (!cart)
      cart = await Cart.create({
        user: user,
      });

    const product = await Product.findById(productID);
    if (!product) {
      return next(new AppError('Product does not exist', 404));
    }
    if (product.isDeleted) {
      return next(new AppError('Product has been removed', 404));
    }

    const variant = product.variants.find(
      (v) => v._id.toString() === variantID
    );
    if (!variant) {
      return next(new AppError('No variant found with that ID', 404));
    }

    const cartItem = cart.lineItems.find(
      (p) =>
        p.product.toString() === productID.toString() &&
        p.variant.toString() === variantID.toString()
    );

    if (!cartItem) {
      if (quantity !== 0) {
        cart.lineItems.push({
          product: new mongoose.Types.ObjectId(productID),
          variant: new mongoose.Types.ObjectId(variantID),
          quantity,
        });
      }
    } else {
      if (quantity === 0) {
        cart.lineItems = cart.lineItems.filter(
          (p) =>
            p.product.toString() !== productID.toString() ||
            p.variant.toString() !== variantID.toString()
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
  }
);

export const deleteAllCartItems = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user.id;
    const cart = await Cart.findOne({ user });
    if (!cart) return next(new AppError('Cart does not exist', 404));

    cart.lineItems = [];
    await cart.save();

    res.status(200).json({
      status: 'success',
      data: {
        cart,
      },
    });
  }
);

export const deleteCartItem = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user.id;
    const productID = req.params.productID;
    const variantID = req.params.variantID;
    const cart = await Cart.findOne({ user });
    if (!cart) return next(new AppError('Cart does not exist', 404));

    const cartItem = cart.lineItems.find(
      (p) =>
        p.product.toString() === productID && p.variant.toString() === variantID
    );
    if (!cartItem) return next(new AppError('Cart item does not exist', 404));

    cart.lineItems = cart.lineItems.filter(
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
  }
);

export const addMultipleItemsToCart = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user.id;
    const { items } = req.body;

    let cart = await Cart.findOne({ user });
    if (!cart)
      cart = await Cart.create({
        user: user,
      });

    for (const item of items) {
      const productId = item.productId;
      const variantId = item.variantId;
      const quantity = item.quantity;

      const product = await Product.findById(productId);
      if (!product) {
        return next(new AppError('Product does not exist', 404));
      }

      const variant = product.variants.find(
        (v) => v._id.toString() === variantId
      );
      if (!variant) {
        return next(new AppError('No variant found with that ID', 404));
      }

      const cartItem = cart.lineItems.find(
        (p) =>
          p.product.toString() === productId.toString() &&
          p.variant.toString() === variantId.toString()
      );

      if (!cartItem) {
        if (quantity !== 0) {
          cart.lineItems.push({
            product: new mongoose.Types.ObjectId(productId),
            variant: new mongoose.Types.ObjectId(variantId),
            quantity,
          });
        }
      } else {
        if (quantity === 0) {
          cart.lineItems = cart.lineItems.filter(
            (p) =>
              p.product.toString() !== productId.toString() ||
              p.variant.toString() !== variantId.toString()
          );
        } else {
          cartItem.quantity = quantity;
        }
      }
    }

    await cart.save();

    res.status(200).json({
      status: 'success',
      data: {
        cart,
      },
    });
  }
);

export const clearCart = async (userId: string) => {
  const cart = await Cart.findOne({ user: userId });
  if (!cart) return;

  cart.lineItems = [];
  await cart.save();
};
