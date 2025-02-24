import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Review from '../models/reviewModel';
import Product from '../models/productModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/AppError';

export const getAllReviews = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  let filter: { product?: mongoose.Types.ObjectId } = {};
  if (req.params.productId) filter = { product: new mongoose.Types.ObjectId(req.params.productId) };

  const reviews = await Review.find(filter);

  res.status(200).json({
    status: 'success',
    results: reviews.length,
    data: {
      reviews,
    },
  });
});

export const createReview = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { productId } = req.params;

  const product = await Product.findById(new mongoose.Types.ObjectId(productId));
  if (!product) return next(new AppError('No product found with that ID', 404));

  const review = {
    user: new mongoose.Types.ObjectId(req.user.id),
    product: new mongoose.Types.ObjectId(productId),
    rating: req.body.rating,
    review: req.body.review,
  };

  await Review.create(review);

  res.status(201).json({
    status: 'success',
    data: {
      review,
    },
  });
});

export const getReviewById = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const review = await Review.findById(req.params.id);

  if (!review) return next(new AppError('No review found with that ID', 404));

  res.status(200).json({
    status: 'success',
    data: {
      review,
    },
  });
});

export const updateReview = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const review = await Review.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!review) return next(new AppError('No review found with that ID', 404));

  res.status(200).json({
    status: 'success',
    data: {
      review,
    },
  });
});

export const deleteReview = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const review = await Review.findByIdAndDelete(req.params.id);

  if (!review) return next(new AppError('No review found with that ID', 404));

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
