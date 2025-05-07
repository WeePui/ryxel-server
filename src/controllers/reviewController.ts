import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Review from '../models/reviewModel';
import Product from '../models/productModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/AppError';
import {
  deleteImage,
  extractPublicId,
  uploadProductReview,
  uploadVideo,
} from '../utils/cloudinaryService';
import Order from '../models/orderModel';
import { nsfwDetection } from '../utils/python';

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

interface ReviewInput {
  review: string;
  rating: number;
  productId: string;
  variant: string;
  images?: string[];
  video?: string;
  variantId: string;
}

export const createReviewsByOrder = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { orderId } = req.params;
    const { reviews } = req.body;

    const order = await Order.findById({ _id: orderId, user: req.user.id });

    if (!order)
      return next(
        new AppError(
          'No order found with that ID or does not belong to you',
          404
        )
      );
    if (order.reviewCount >= 2)
      return next(
        new AppError('Order has reached the maximum review count', 400)
      );
    if (order.status !== 'delivered')
      return next(new AppError('Order is not delivered yet', 400));
    if (order.createdAt.getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000)
      return next(new AppError('Order is too old to review', 400));

    const lineItemIds = order.lineItems.map((item) => item.product.toString());
    const reviewProductIds = reviews.map(
      (review: ReviewInput) => review.productId
    );

    const hasInvalidReviews = reviewProductIds.some(
      (id: string) => !lineItemIds.includes(id)
    );
    if (hasInvalidReviews) {
      return next(new AppError('Some reviews do not match line items', 400));
    }

    if (req.files && (req.files.length as number) > 0) {
      const allowedMimeTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'video/mp4',
        'video/webm',
      ];
      const invalidFiles = (req.files as Express.Multer.File[]).filter(
        (file: Express.Multer.File) => !allowedMimeTypes.includes(file.mimetype)
      );

      if (invalidFiles.length > 0) {
        return next(
          new AppError(
            'Only JPEG, PNG, WEBP images, and MP4/WEBM videos are allowed',
            400
          )
        );
      }
    }

    const files = req.files as Express.Multer.File[];
    const fileMap: Record<number, { images?: string[]; video?: string }> = {};

    await Promise.all(
      files.map(async (file) => {
        const match = file.fieldname.match(/\[([0-9]+)\]\[(images|video)\]/);
        if (match) {
          const reviewIndex = parseInt(match[1], 10);
          const type = match[2];

          if (!fileMap[reviewIndex]) fileMap[reviewIndex] = {};

          const url = await uploadProductReview(file.buffer, file.mimetype);

          if (type === 'images') {
            if (!fileMap[reviewIndex].images) fileMap[reviewIndex].images = [];
            fileMap[reviewIndex].images!.push(url);
          } else if (type === 'video') {
            fileMap[reviewIndex].video = url;
          }
        }
      })
    );

    reviews.forEach((review: ReviewInput, index: number) => {
      review.images = fileMap[index]?.images || [];
      review.video = fileMap[index]?.video || '';
    });

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const createdReviews = await Review.create(
        reviews.map((review: ReviewInput) => ({
          user: req.user.id,
          product: review.productId,
          rating: review.rating,
          images: review.images,
          video: review.video,
          review: review.review,
          order: orderId,
          variant: review.variantId,
        })),
        { session, ordered: true }
      );

      await session.commitTransaction();
      session.endSession();

      await Promise.all(
        createdReviews.map((review) =>
          Review.calcAverageRatings(review.product, session)
        )
      );

      createdReviews.map((review) => {
        nsfwDetection(review._id as string, review.images as string[]);
      });

      res.status(200).json({
        status: 'success',
        message: 'Review added successfully',
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.log(error);
      return next(new AppError('Failed to create review', 500));
    }
  }
);

interface ReviewUpdateInput {
  _id: string;
  rating: number;
  review: string;
  images?: string[];
  video?: string;
}

export const updateReviewsByOrder = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { orderId } = req.params;
    const { reviews } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const order = await Order.findOne({
        _id: orderId,
        user: req.user.id,
      }).session(session);
      if (!order)
        throw new AppError(
          'No order found with that ID or does not belong to you',
          404
        );

      if (order.reviewCount >= 2)
        throw new AppError('Order has reached the maximum review count', 400);
      if (order.status !== 'delivered')
        throw new AppError('Order is not delivered yet', 400);
      if (order.createdAt.getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000)
        throw new AppError('Order is too old to review', 400);

      // ✅ Kiểm tra định dạng file
      if (req.files && (req.files.length as number) > 0) {
        const allowedMimeTypes = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'video/mp4',
          'video/webm',
        ];
        const invalidFiles = (req.files as Express.Multer.File[]).filter(
          (file: Express.Multer.File) =>
            !allowedMimeTypes.includes(file.mimetype)
        );
        if (invalidFiles.length > 0) {
          throw new AppError(
            'Only JPEG, PNG, WEBP images, and MP4/WEBM videos are allowed',
            400
          );
        }
      }

      const files = req.files as Express.Multer.File[];
      const fileMap: Record<string, { images?: string[]; video?: string }> = {};

      // ✅ Upload file mới lên Cloud
      await Promise.all(
        files.map(async (file) => {
          const match = file.fieldname.match(
            /reviews\[(.+)\]\[(images|video)\]/
          );
          if (match) {
            const reviewId = match[1];
            const type = match[2];

            if (!fileMap[reviewId]) fileMap[reviewId] = {};
            const url = await uploadProductReview(file.buffer, file.mimetype);

            if (type === 'images') {
              if (!fileMap[reviewId].images) fileMap[reviewId].images = [];
              fileMap[reviewId].images!.push(url);
            } else if (type === 'video') {
              fileMap[reviewId].video = url;
            }
          }
        })
      );

      await Promise.all(
        Object.keys(reviews).map(async (reviewId) => {
          const reviewData = reviews[reviewId];

          // ✅ Lấy review cũ trong transaction
          const oldReview = await Review.findOne({
            _id: reviewId,
            order: orderId,
          }).session(session);
          if (!oldReview) throw new AppError('Review not found', 404);

          let oldImages = oldReview.images || [];
          let oldVideo = oldReview.video || '';

          // ✅ Xác định ảnh giữ lại và ảnh mới từ FE
          const newImages = (reviewData.images || []).map((img: any) =>
            typeof img === 'string' ? img : ''
          );
          const uploadedImages = fileMap[reviewId]?.images || [];
          const finalImages = [...newImages.filter(Boolean), ...uploadedImages];

          // ✅ Kiểm tra nếu FE gửi "video": "", BE sẽ xóa video cũ
          let finalVideo = oldVideo;
          if (reviewData.video === '') {
            finalVideo = '';
          } else if (fileMap[reviewId]?.video) {
            finalVideo = fileMap[reviewId]?.video;
          }

          // ✅ Cập nhật review
          const updatedReview = await Review.findOneAndUpdate(
            { _id: reviewId, order: orderId },
            {
              rating: reviewData.rating,
              review: reviewData.review,
              images: finalImages,
              video: finalVideo,
            },
            { new: true, session }
          );
          if (!updatedReview)
            throw new AppError('Failed to update review', 500);

          await Review.calcAverageRatings(updatedReview.product, session);

          // ✅ Xóa ảnh/video cũ nếu bị FE xóa
          process.nextTick(async () => {
            try {
              const removedImages = oldImages.filter(
                (img) => !finalImages.includes(img)
              );
              const removedVideo = oldVideo && finalVideo === '';

              await Promise.all([
                ...removedImages.map((img) =>
                  deleteImage(extractPublicId(img)!)
                ),
                removedVideo ? deleteImage(extractPublicId(oldVideo)!) : null,
              ]);
            } catch (err) {
              console.error('Error deleting old files:', err);
            }
          });
        })
      );

      order.reviewCount += 1;
      await order.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.status(200).json({
        status: 'success',
        data: reviews,
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error(error);
      return next(new AppError('Failed to update reviews', 500));
    }
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

export const processNSFWReview = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { reviewId, isValid, detected } = req.body;
    console.log('hello mtf');

    console.log(detected); //TO DO SOMETHING WITH THE PUSH NOTIFICATION LATER ON

    const review = await Review.findById(reviewId);
    if (!review) return next(new AppError('No review found with that ID', 404));

    if (!isValid) {
      let images = review.images;
      let video = review.video;
      try {
        if (images && images.length > 0) {
          await Promise.all(
            images.map((img) => deleteImage(extractPublicId(img)!))
          );
        }
        if (video) {
          await deleteImage(extractPublicId(video)!);
        }
      } catch (err) {
        console.error('Error deleting old files:', err);
      }

      await Review.findByIdAndDelete(reviewId);
    } else {
      review.status = 'approved';
      await review.save();
    }
    res.status(204).json({
      status: 'success',
      isValid: isValid,
    });
  }
);

// export const createReview = catchAsync(
//   async (req: Request, res: Response, next: NextFunction) => {
//     const { productId } = req.params;

//     const files = req.files as { [fieldname: string]: Express.Multer.File[] };

//     const images = files?.['images']; // Array of image files
//     const video = files?.['video']; // Array with a single video file

//     const product = await Product.findById(
//       new mongoose.Types.ObjectId(productId)
//     );
//     if (!product)
//       return next(new AppError('No product found with that ID', 404));

//     if (req.files === undefined) {
//       return next(new AppError('Files undefined', 400));
//     }
//     if (images && images.length > 0) {
//       const uploadedImages = await Promise.all(
//         images.map((file) => uploadProductReview(file.buffer))
//       );
//       review.images = uploadedImages.map(
//         (img) => (img as { secure_url: string }).secure_url
//       );
//     }

//     if (video && video.length > 0) {
//       const uploadedVideo = await uploadVideo(video[0].buffer);

//       if (!uploadedVideo || !uploadedVideo.secure_url) {
//         throw new Error('Failed to upload video.');
//       }

//       review.video = uploadedVideo.secure_url;
//     }

//     const review = {
//       user: new mongoose.Types.ObjectId(req.user.id),
//       product: new mongoose.Types.ObjectId(productId),
//       rating: req.body.rating,
//       review: req.body.review,
//     };

//     await Review.create(review);

//     res.status(201).json({
//       status: 'success',
//       data: {
//         review,
//       },
//     });
//   }
// );
