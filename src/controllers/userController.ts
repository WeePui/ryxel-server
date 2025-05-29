import { Request, Response, NextFunction } from "express";
import User from "../models/userModel";
import Order from "../models/orderModel";
import Review from "../models/reviewModel";
import catchAsync from "../utils/catchAsync";
import AppError from "../utils/AppError";
import { uploadImage, deleteImage } from "../utils/cloudinaryService";

const filterObj = (obj: any, ...allowedFields: string[]) => {
  const newObj: any = {};
  Object.keys(obj).forEach((el) => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

export const getAllUsers = catchAsync(async (req: Request, res: Response) => {
  const {
    search,
    role,
    emailVerified,
    page = 1,
    limit = 10,
    sort = "-createdAt",
  } = req.query;

  // Build query object
  let query: any = {};

  // Search by name or email
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  // Filter by role
  if (role) {
    query.role = role;
  }

  // Filter by email verification status
  if (emailVerified !== undefined) {
    query.emailVerified = emailVerified === "true";
  }

  // Calculate pagination
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  // Execute query with pagination
  const users = await User.find(query)
    .sort(sort as string)
    .skip(skip)
    .limit(limitNum)
    .select(
      "-password -passwordResetToken -passwordResetExpires -otp -otpExpires"
    );

  // Get total count for pagination
  const totalResults = await User.countDocuments(query);

  res.status(200).json({
    status: "success",
    results: totalResults,
    data: {
      users,
      totalResults,
      page: pageNum,
      totalPages: Math.ceil(totalResults / limitNum),
    },
  });
});

export const getUserById = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = await User.findById(req.params.id);

    if (!user) {
      return next(new AppError("No user found with that ID", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        user,
      },
    });
  }
);

// For image upload. Request header must be 'Content-Type: multipart/form-data'
export const updateUser = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!user) {
      return next(new AppError("No user found with that ID", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        user,
      },
    });
  }
);

export const deleteUser = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) return next(new AppError("No user found with that ID", 404));

    res.status(204).json({
      status: "success",
      data: null,
    });
  }
);

export const updateProfile = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.body.password || req.body.passwordConfirm) {
      return next(
        new AppError(
          "This route is not for password updates. Please use /updatePassword.",
          400
        )
      );
    }

    // Filtered out unwanted fields names that are not allowed to be updated
    const filteredBody = filterObj(req.body, "name", "gender");

    const user = await User.findById(req.user.id);

    if (!user) {
      return next(new AppError("No user found with that ID", 404));
    }

    if (req.file) {
      const DEFAULT_PUBLIC_ID = "avatars/test-public-id";
      console.log(user.photo.publicId === DEFAULT_PUBLIC_ID);
      const [uploadResult, deleteResult] = await Promise.all([
        uploadImage("avatars", req.file.path),
        user.photo.publicId !== DEFAULT_PUBLIC_ID
          ? deleteImage(user.photo.publicId!)
          : Promise.resolve({ result: "ok" }),
      ]);

      if (!uploadResult)
        return next(new AppError("Error uploading image", 500));

      if (deleteResult.result && deleteResult.result !== "ok")
        return next(new AppError("Error deleting image", 500));

      filteredBody.photo = {
        publicId: uploadResult.public_id,
        url: uploadResult.secure_url,
      };
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      filteredBody,
      {
        new: true,
        runValidators: true,
      }
    );

    res.status(200).json({
      status: "success",
      data: {
        user: updatedUser,
      },
    });
  }
);

export const getProfile = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = await User.findById(req.user.id);

    if (!user) {
      return next(new AppError("No user found with that ID", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        user,
      },
    });
  }
);

export const deleteProfile = catchAsync(async (req: Request, res: Response) => {
  await User.findByIdAndUpdate(req.user.id, { active: false });

  res.status(204).json({
    status: "success",
    data: null,
  });
});

export const getUserAnalytics = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError("No user found with that ID", 404));
    }

    // Get user order statistics
    const orderStats = await Order.aggregate([
      { $match: { user: user._id } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: "$subtotal" },
          averageOrderValue: { $avg: "$subtotal" },
          pendingOrders: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          completedOrders: {
            $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] },
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
          },
        },
      },
    ]);

    // Get recent orders
    const recentOrders = await Order.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("lineItems.product", "name imageCover")
      .select("orderCode status subtotal createdAt lineItems");

    // Get user reviews
    const reviewStats = await Review.aggregate([
      { $match: { user: user._id } },
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          averageRating: { $avg: "$rating" },
        },
      },
    ]);

    // Get monthly spending pattern (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlySpending = await Order.aggregate([
      {
        $match: {
          user: user._id,
          status: { $nin: ["unpaid", "cancelled"] },
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          totalSpent: { $sum: "$subtotal" },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Get favorite categories
    const favoriteCategories = await Order.aggregate([
      { $match: { user: user._id, status: { $nin: ["unpaid", "cancelled"] } } },
      { $unwind: "$lineItems" },
      {
        $lookup: {
          from: "products",
          localField: "lineItems.product",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $lookup: {
          from: "categories",
          localField: "product.category",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: "$category" },
      {
        $group: {
          _id: "$category._id",
          categoryName: { $first: "$category.name" },
          totalSpent: { $sum: "$lineItems.subtotal" },
          itemCount: { $sum: "$lineItems.quantity" },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 5 },
    ]);

    res.status(200).json({
      status: "success",
      data: {
        user,
        orderStats: orderStats[0] || {
          totalOrders: 0,
          totalSpent: 0,
          averageOrderValue: 0,
          pendingOrders: 0,
          completedOrders: 0,
          cancelledOrders: 0,
        },
        recentOrders,
        reviewStats: reviewStats[0] || {
          totalReviews: 0,
          averageRating: 0,
        },
        monthlySpending,
        favoriteCategories,
      },
    });
  }
);

export const getUserOrderHistory = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.params.id;
    const { page = 1, limit = 10, status, sort = "-createdAt" } = req.query;

    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError("No user found with that ID", 404));
    }

    // Build query
    let query: any = { user: userId };
    if (status) {
      query.status = status;
    }

    // Calculate pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Get orders with pagination
    const orders = await Order.find(query)
      .sort(sort as string)
      .skip(skip)
      .limit(limitNum)
      .populate("lineItems.product", "name imageCover price")
      .populate("shippingAddress")
      .select("-__v");

    const totalResults = await Order.countDocuments(query);

    res.status(200).json({
      status: "success",
      results: totalResults,
      data: {
        orders,
        totalResults,
        page: pageNum,
        totalPages: Math.ceil(totalResults / limitNum),
      },
    });
  }
);

export const updateUserStatus = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.params.id;
    const { emailVerified, active, role } = req.body;

    console.log("Updating user status:", {
      userId,
      emailVerified,
      active,
      role,
    });

    const updateData: any = {};
    if (emailVerified !== undefined) updateData.emailVerified = emailVerified;
    if (active !== undefined) updateData.active = active;
    if (role !== undefined) updateData.role = role;

    const user = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).select(
      "-password -passwordResetToken -passwordResetExpires -otp -otpExpires"
    );

    if (!user) {
      return next(new AppError("No user found with that ID", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        user,
      },
    });
  }
);
