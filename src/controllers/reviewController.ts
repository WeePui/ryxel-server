import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Review from '../models/reviewModel';
import Product from '../models/productModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/AppError';

export const getAllReviews = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    let filter: { product?: mongoose.Types.ObjectId } = {};
    if (req.params.productId)
      filter = { product: new mongoose.Types.ObjectId(req.params.productId) };

    const reviews = await Review.find(filter);

    res.status(200).json({
      status: 'success',
      results: reviews.length,
      data: {
        reviews,
      },
    });
  }
);

export const createReview = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { productId } = req.params;

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    const images = files?.['images']; // Array of image files
    const video = files?.['video']; // Array with a single video file

    const product = await Product.findById(
      new mongoose.Types.ObjectId(productId)
    );
    if (!product)
      return next(new AppError('No product found with that ID', 404));

    if (req.files === undefined) {
      return next(new AppError('Files undefined', 400));
    }
    if (images && images.length > 0) {
      const uploadedImages = await Promise.all(
        images.map((file) => uploadProductReview(file.buffer))
      );
      review.images = uploadedImages.map(
        (img) => (img as { secure_url: string }).secure_url
      );
    }

    if (video && video.length > 0) {
      const uploadedVideo = await uploadVideo(video[0].buffer);

      if (!uploadedVideo || !uploadedVideo.secure_url) {
        throw new Error('Failed to upload video.');
      }

      review.video = uploadedVideo.secure_url;
    }

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
  }
);

export const getReviewById = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const review = await Review.findById(req.params.id);

    if (!review) return next(new AppError('No review found with that ID', 404));

    res.status(200).json({
      status: 'success',
      data: {
        review,
      },
    });
  }
);

export const updateReview = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
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
  }
);

export const deleteReview = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const review = await Review.findByIdAndDelete(req.params.id);

    if (!review) return next(new AppError('No review found with that ID', 404));

    res.status(204).json({
      status: 'success',
      data: null,
    });
  }
);
