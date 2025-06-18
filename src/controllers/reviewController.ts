import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Review from "../models/reviewModel";
import Product from "../models/productModel";
import catchAsync from "../utils/catchAsync";
import AppError from "../utils/AppError";
import {
  deleteImage,
  extractPublicId,
  uploadProductReview,
} from "../utils/cloudinaryService";
import Order from "../models/orderModel";
import { nsfwDetection } from "../utils/python";
import { sendReviewDeletedNotification } from "../utils/notificationHelpers";

export const getAllReviews = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    let filter: { product?: mongoose.Types.ObjectId } = {};
    if (req.params.productId)
      filter = { product: new mongoose.Types.ObjectId(req.params.productId) };

    const reviews = await Review.find(filter);

    res.status(200).json({
      status: "success",
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
          "No order found with that ID or does not belong to you",
          404
        )
      );
    if (order.reviewCount >= 2)
      return next(
        new AppError("Order has reached the maximum review count", 400)
      );
    if (order.status !== "delivered")
      return next(new AppError("Order is not delivered yet", 400));
    if (order.createdAt.getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000)
      return next(new AppError("Order is too old to review", 400));

    const lineItemIds = order.lineItems.map((item) => item.product.toString());
    const reviewProductIds = reviews.map(
      (review: ReviewInput) => review.productId
    );

    const hasInvalidReviews = reviewProductIds.some(
      (id: string) => !lineItemIds.includes(id)
    );
    if (hasInvalidReviews) {
      return next(new AppError("Some reviews do not match line items", 400));
    }

    if (req.files && (req.files.length as number) > 0) {
      const allowedMimeTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "video/mp4",
        "video/webm",
      ];
      const invalidFiles = (req.files as Express.Multer.File[]).filter(
        (file: Express.Multer.File) => !allowedMimeTypes.includes(file.mimetype)
      );

      if (invalidFiles.length > 0) {
        return next(
          new AppError(
            "Only JPEG, PNG, WEBP images, and MP4/WEBM videos are allowed",
            400
          )
        );
      }
    }

    const files = req.files as Express.Multer.File[];
    const fileMap: Record<number, { images?: string[]; video?: string }> = {};

    await Promise.all(
      files.map(async (file) => {
        // Improved regex that captures the review index more reliably
        const match = file.fieldname.match(
          /reviews\[([0-9]+)\]\[(images|video)\]/
        );
        if (!match) {
          console.warn(`Could not parse fieldname pattern: ${file.fieldname}`);
          return;
        }

        const reviewIndex = parseInt(match[1], 10);
        const type = match[2];

        if (!fileMap[reviewIndex]) fileMap[reviewIndex] = {};

        const url = await uploadProductReview(file.buffer, file.mimetype);

        if (type === "images") {
          if (!fileMap[reviewIndex].images) fileMap[reviewIndex].images = [];
          fileMap[reviewIndex].images!.push(url);
        } else if (type === "video") {
          fileMap[reviewIndex].video = url;
        }
      })
    );

    reviews.forEach((review: ReviewInput, index: number) => {
      review.images = fileMap[index]?.images || [];
      review.video = fileMap[index]?.video || "";
    });

    const reviewObjects = reviews.map((review: ReviewInput) => ({
      user: req.user.id,
      product: review.productId,
      rating: review.rating,
      images: review.images || [],
      video: review.video || "",
      review: review.review || "",
      order: orderId,
      variant: review.variantId,
    }));

    // Try to create all reviews at once
    let createdReviews;
    try {
      createdReviews = await Review.create(reviewObjects);
    } catch (err: any) {
      console.error("Error creating reviews:", err);

      // If bulk creation fails, try individual creation to identify which ones failed
      const individualResults = await Promise.allSettled(
        reviewObjects.map(async (reviewObj: any) => {
          try {
            return await Review.create(reviewObj);
          } catch (individualError: any) {
            return {
              error: true,
              productId: reviewObj.product,
              variantId: reviewObj.variant,
              message: individualError.message,
            };
          }
        })
      );

      // Filter successful and failed creations
      const successful = individualResults
        .filter(
          (result) => result.status === "fulfilled" && !result.value?.error
        )
        .map((result) => (result.status === "fulfilled" ? result.value : null))
        .filter(Boolean);

      const failed = individualResults
        .filter(
          (result) =>
            result.status === "rejected" ||
            (result.status === "fulfilled" && result.value?.error)
        )
        .map((result) => {
          if (result.status === "rejected") {
            return { reason: result.reason?.message || "Unknown error" };
          }
          return result.status === "fulfilled" ? result.value : null;
        })
        .filter(Boolean);

      // If some succeeded but some failed
      if (successful.length > 0) {
        // Process the successful ones
        for (const review of successful) {
          // Run NSFW detection for images
          if (review.images && review.images.length > 0) {
            nsfwDetection(review._id as string, review.images as string[]);
          }

          // Update product ratings
          await Review.calcAverageRatings(review.product);
        }

        // Increment review count since at least one review was created
        await Order.updateOne({ _id: order._id }, { $inc: { reviewCount: 1 } });

        // Return success with information about failed reviews
        return res.status(207).json({
          status: "partial_success",
          message: "Some reviews were created successfully, but others failed",
          data: {
            successful: successful.length,
            failed: failed.length,
            details: { successful, failed },
          },
        });
      }

      // If all failed
      return next(
        new AppError(
          "Could not create any reviews. This may be because you have already reviewed these variants or there was a server error.",
          400
        )
      );
    }

    // If all reviews were created successfully
    const createdReviewsArray = Array.isArray(createdReviews)
      ? createdReviews
      : [createdReviews]; // Process NSFW detection and update product ratings
    for (const review of createdReviewsArray) {
      if (review.images && review.images.length > 0) {
        nsfwDetection(review._id as string, review.images as string[]);
      }
      await Review.calcAverageRatings(review.product);
      // Note: Order lineItem update is handled by the review model's post-save hook
    }

    // Increment review count
    await Order.updateOne({ _id: order._id }, { $inc: { reviewCount: 1 } });
    res.status(200).json({
      status: "success",
      message: "All reviews were processed successfully",
      data: {
        successful: createdReviewsArray.length,
        details: {
          createdReviews: createdReviewsArray.map((review) => ({
            id: review._id,
            productId: review.product,
            variantId: review.variant,
          })),
        },
      },
    });
  }
);

interface ReviewUpdateInput {
  _id: string;
  rating: number;
  review: string;
  images?: string[];
  video?: string;
  product?: string;
  variant?: string;
}

export const updateReviewsByOrder = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { orderId } = req.params;
    const { reviews } = req.body;

    console.log("UPDATE BODY:", req.body);

    const order = await Order.findOne({
      _id: orderId,
      user: req.user.id,
    });

    if (!order) {
      return next(
        new AppError(
          "No order found with that ID or does not belong to you",
          404
        )
      );
    }

    if (order.reviewCount >= 2) {
      return next(
        new AppError("Order has reached the maximum review count", 400)
      );
    }

    if (order.status !== "delivered") {
      return next(new AppError("Order is not delivered yet", 400));
    }

    if (order.createdAt.getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000) {
      return next(new AppError("Order is too old to review", 400));
    }

    // Kiểm tra định dạng file
    if (req.files && (req.files.length as number) > 0) {
      const allowedMimeTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "video/mp4",
        "video/webm",
      ];
      const invalidFiles = (req.files as Express.Multer.File[]).filter(
        (file: Express.Multer.File) => !allowedMimeTypes.includes(file.mimetype)
      );
      if (invalidFiles.length > 0) {
        return next(
          new AppError(
            "Only JPEG, PNG, WEBP images, and MP4/WEBM videos are allowed",
            400
          )
        );
      }
    }

    const files = req.files as Express.Multer.File[];
    const fileMap: Record<number, { images?: string[]; video?: string }> = {};

    // Upload file mới lên Cloud
    await Promise.all(
      files.map(async (file) => {
        // Improved regex that captures the review index more reliably
        const match = file.fieldname.match(
          /reviews\[([0-9]+)\]\[(images|video)\]/
        );
        if (!match) {
          console.warn(`Could not parse fieldname pattern: ${file.fieldname}`);
          return;
        }

        const reviewIndex = parseInt(match[1], 10);
        const type = match[2];

        if (!fileMap[reviewIndex]) fileMap[reviewIndex] = {};

        const url = await uploadProductReview(file.buffer, file.mimetype);

        if (type === "images") {
          if (!fileMap[reviewIndex].images) fileMap[reviewIndex].images = [];
          fileMap[reviewIndex].images!.push(url);
        } else if (type === "video") {
          fileMap[reviewIndex].video = url;
        }
      })
    );

    // Array to collect responses from each review update
    const updateResults = [];
    const updatedReviews = [];

    // Process each review update
    for (let index = 0; index < reviews.length; index++) {
      const reviewData = reviews[index] as ReviewUpdateInput;

      try {
        // Find the original review
        const oldReview = await Review.findOne({
          _id: reviewData._id,
          order: orderId,
        });

        if (!oldReview) {
          updateResults.push({
            error: true,
            reviewId: reviewData._id,
            message: `Review not found or does not belong to this order`,
          });
          continue;
        }

        const oldImages = oldReview.images || [];
        const oldVideo = oldReview.video || "";

        // Process images: keep existing strings from input + add new uploads
        const newImages = (reviewData.images || []).filter(
          (img: any) => typeof img === "string"
        );
        const uploadedImages = fileMap[index]?.images || [];
        const finalImages = [...newImages, ...uploadedImages]; // Process video
        let finalVideo = oldVideo;
        if (reviewData.video === "") {
          finalVideo = "";
        } else if (fileMap[index]?.video) {
          finalVideo = fileMap[index].video || "";
        }

        // Update the review
        const updatedReview = await Review.findByIdAndUpdate(
          reviewData._id,
          {
            rating: reviewData.rating,
            review: reviewData.review,
            images: finalImages,
            video: finalVideo,
          },
          { new: true }
        );
        if (updatedReview) {
          updatedReviews.push(updatedReview);

          // Update product ratings
          await Review.calcAverageRatings(updatedReview.product);
          // Note: Order lineItem update is handled by the review model's post-save hook

          updateResults.push({
            success: true,
            reviewId: updatedReview._id,
            product: updatedReview.product,
            variant: updatedReview.variant,
          });

          // Clean up old files in the background
          process.nextTick(async () => {
            try {
              const removedImages = oldImages.filter(
                (img) => !finalImages.includes(img)
              );
              const removedVideo = oldVideo && finalVideo === "";

              await Promise.all(
                [
                  ...removedImages.map((img) =>
                    deleteImage(extractPublicId(img)!)
                  ),
                  removedVideo ? deleteImage(extractPublicId(oldVideo)!) : null,
                ].filter(Boolean)
              );
            } catch (err) {
              console.error("Error deleting old files:", err);
            }
          });
        }
      } catch (err: any) {
        console.error(`Error updating review at index ${index}:`, err);
        updateResults.push({
          error: true,
          reviewId: reviewData._id,
          message: err.message || "Unknown error during update",
        });
      }
    }

    // Check for NSFW content in uploaded images
    for (const review of updatedReviews) {
      if (review.images && review.images.length > 0) {
        nsfwDetection(review._id as string, review.images as string[]);
      }
    }

    // Increment review count
    await Order.updateOne({ _id: orderId }, { $inc: { reviewCount: 1 } });

    res.status(200).json({
      status: "success",
      message: "Reviews updated successfully",
      data: {
        successful: updatedReviews.length,
        total: reviews.length,
        details: updateResults,
      },
    });
  }
);

export const getReviewById = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const review = await Review.findById(req.params.id);

    if (!review) return next(new AppError("No review found with that ID", 404));

    res.status(200).json({
      status: "success",
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

    if (!review) return next(new AppError("No review found with that ID", 404));

    res.status(200).json({
      status: "success",
      data: {
        review,
      },
    });
  }
);

export const deleteReview = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const review = await Review.findByIdAndDelete(req.params.id);

    if (!review) return next(new AppError("No review found with that ID", 404));

    res.status(204).json({
      status: "success",
      data: null,
    });
  }
);

export const processNSFWReview = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { reviewId, isValid, detected } = req.body;

    const review = await Review.findById(reviewId).populate('product', 'name').populate('user', '_id');
    if (!review) return next(new AppError("No review found with that ID", 404));

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
        console.error("Error deleting old files:", err);
      }

      // Clear the review reference from the order's lineItem before deleting the review
      await Order.updateOne(
        {
          "lineItems.review": reviewId,
        },
        {
          $unset: { "lineItems.$.review": 1 },
        }
      );

      // Send notification to user before deleting the review
      try {
        const productName = (review.product as any)?.name || "Unknown Product";
        const reason = detected ? `Nội dung không phù hợp được phát hiện: ${detected.join(", ")}` : "Nội dung vi phạm chính sách cộng đồng";
        
        await sendReviewDeletedNotification(
          (review.user as any)._id.toString(),
          productName,
          reason
        );
        
        console.log(`✅ Notification sent to user ${(review.user as any)._id} for deleted review of product: ${productName}`);
      } catch (notificationError) {
        console.error("Error sending review deletion notification:", notificationError);
        // Continue with review deletion even if notification fails
      }

      await Review.findByIdAndDelete(reviewId);
    } else {
      review.status = "approved";
      await review.save();
    }
    res.status(204).json({
      status: "success",
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
