import mongoose from 'mongoose';
import Wishlist from '../models/wishlistModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/AppError';
import { RequestHandler } from 'express';
import Product from '../models/productModel';

export const getWishlist: RequestHandler = catchAsync(
  async (req, res, next) => {
    let wishlist = await Wishlist.findOne({ user: req.user.id }).populate(
      'products'
    );

    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user.id, products: [] });
    }

    res.status(200).json({
      status: 'success',
      data: {
        wishlist,
      },
    });
  }
);

export const addToWishlist: RequestHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user.id;
    const product = await Product.findById(req.params.productId);

    if (!product) {
      return next(new AppError('Product not found', 404));
    }

    let wishlist = await Wishlist.findOne({
      user: userId,
    });

    if (!wishlist) {
      wishlist = await Wishlist.create({ user: userId, products: [] });
    }

    const productExists = wishlist.products.includes(product._id);

    if (!productExists) {
      wishlist.products.push(product._id);
      await wishlist.save();
    }

    res.status(200).json({
      status: 'success',
      data: {
        wishlist: await wishlist.populate('products'),
      },
    });
  }
);

export const removeFromWishlist: RequestHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user.id;
    const product = await Product.findById(req.params.productId);

    if (!product) {
      return next(new AppError('Product not found', 404));
    }

    let wishlist = await Wishlist.findOne({
      user: userId,
    });

    if (!wishlist) {
      wishlist = await Wishlist.create({ user: userId, products: [] });
    }

    wishlist.products = wishlist.products.filter(
      (p) => p.toString() !== product._id.toString()
    );
    await wishlist.save();

    res.status(200).json({
      status: 'success',
      data: {
        wishlist: await wishlist.populate('products'),
      },
    });
  }
);

export const getWishlistByShareCode: RequestHandler = catchAsync(
  async (req, res, next) => {
    const wishlist = await Wishlist.findOne({
      shareCode: req.params.shareCode,
    });

    if (!wishlist) {
      return next(new AppError('Wishlist not found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        wishlist,
      },
    });
  }
);
