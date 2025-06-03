import { Request, Response, NextFunction } from "express";
import Notification from "../models/notificationModel";
import User from "../models/userModel";
import AppError from "../utils/AppError";
import catchAsync from "../utils/catchAsync";
import { sendPromotionalNotification } from "../utils/notificationHelpers";
import FirebaseNotificationService from "../utils/firebaseNotificationService";
import ExpoNotificationService from "../utils/expoNotificationService";
import { getUserIdByEmail, getUserIdsByEmails, isValidEmail } from "../utils/notificationUtils";

const firebaseNotificationService = FirebaseNotificationService.getInstance();
const expoNotificationService = ExpoNotificationService.getInstance();

export const registerToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { token, platform, deviceInfo, type } = req.body;
    const userId = req.user.id;

    if (!userId || !token || !platform) {
      throw new AppError("Missing required fields", 400);
    }

    let result;

    // Determine if it's FCM or Expo token based on type or token format
    if (type === "expo" || token.startsWith("ExponentPushToken[")) {
      result = await expoNotificationService.registerToken(
        userId,
        token,
        platform,
        deviceInfo
      );
    } else {
      // Default to FCM for backward compatibility
      result = await firebaseNotificationService.registerToken(
        userId,
        token,
        platform,
        deviceInfo
      );
    }

    if (!result.success) {
      throw new AppError(result.message, 400);
    }

    res.status(200).json({
      status: "success",
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
};

export const unregisterToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { token, type } = req.body;
    if (!token) throw new AppError("Token is required", 400);

    let result;

    // Determine if it's FCM or Expo token based on type or token format
    if (type === "expo" || token.startsWith("ExponentPushToken[")) {
      result = await expoNotificationService.unregisterToken(token);
    } else {
      // Default to FCM for backward compatibility
      result = await firebaseNotificationService.unregisterToken(token);
    }

    if (!result.success) {
      throw new AppError(result.message, 400);
    }

    res.status(200).json({
      status: "success",
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
};

export const sendToUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Handle both flat structure and nested payload structure
    let userIdentifier, payload, notificationType;

    if (req.body.payload) {
      // Nested structure: { userId/email, payload: { title, body, data, ... } }
      userIdentifier = req.body.userId || req.body.email;
      payload = req.body.payload;
      notificationType = req.body.notificationType || "both"; // 'fcm', 'expo', or 'both'
    } else {
      // Flat structure: { userId/email, title, body, type, data, imageUrl, ... }
      const {
        userId: id,
        email,
        title,
        body,
        type,
        data,
        imageUrl,
        notificationType: nType,
        ...otherProps
      } = req.body;
      userIdentifier = id || email;
      notificationType = nType || "both";
      payload = {
        title,
        body,
        data: data || {},
        ...(type && { type }),
        ...(imageUrl && { imageUrl }),
        ...otherProps,
      };
    }

    if (!userIdentifier || !payload?.title || !payload?.body) {
      throw new AppError(
        "Invalid payload: userId or email, title, and body are required",
        400
      );
    }

    // Check if userIdentifier is an email and convert to userId
    let userId = userIdentifier;
    if (isValidEmail(userIdentifier)) {
      const foundUserId = await getUserIdByEmail(userIdentifier);
      if (!foundUserId) {
        throw new AppError(`User with email ${userIdentifier} not found`, 404);
      }
      userId = foundUserId;
    }

    const results = [];

    // Send FCM notification
    if (notificationType === "fcm" || notificationType === "both") {
      try {
        const fcmResult = await firebaseNotificationService.sendToUser(
          userId,
          payload
        );
        results.push({ type: "FCM", ...fcmResult });
      } catch (error) {
        console.error("FCM notification failed:", error);
        results.push({
          type: "FCM",
          success: false,
          error: (error as Error).message,
        });
      }
    }

    // Send Expo notification
    if (notificationType === "expo" || notificationType === "both") {
      try {
        const expoResult = await expoNotificationService.sendToUser(userId, {
          title: payload.title,
          body: payload.body,
          data: payload.data,
          sound: "default",
        });
        results.push({ type: "Expo", ...expoResult });
      } catch (error) {
        console.error("Expo notification failed:", error);
        results.push({
          type: "Expo",
          success: false,
          error: (error as Error).message,
        });
      }
    }

    const hasSuccess = results.some((result) => result.success);

    res.status(200).json({
      status: "success",
      message: "Notification sent",
      results,
      overallSuccess: hasSuccess,
    });
  } catch (err) {
    next(err);
  }
};

export const sendToTokens = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    let payload, targetTokensOrUserIds, notificationType;

    // Handle different payload structures
    if (req.body.payload) {
      // Nested structure: { tokens/userIds/emails, payload: { title, body, data, ... } }
      payload = req.body.payload;
      targetTokensOrUserIds = req.body.tokens || req.body.userIds || req.body.emails;
      notificationType = req.body.notificationType || "both";
    } else {
      // Flat structure: { tokens/userIds/emails, title, body, type, data, imageUrl, ... }
      const {
        tokens,
        userIds,
        emails,
        title,
        body,
        type,
        data,
        imageUrl,
        notificationType: nType,
        ...otherProps
      } = req.body;
      targetTokensOrUserIds = tokens || userIds || emails;
      notificationType = nType || "both";
      payload = {
        title,
        body,
        data: data || {},
        ...(type && { type }),
        ...(imageUrl && { imageUrl }),
        ...otherProps,
      };
    }

    if (
      !Array.isArray(targetTokensOrUserIds) ||
      targetTokensOrUserIds.length === 0 ||
      !payload?.title ||
      !payload?.body
    ) {
      throw new AppError(
        "Invalid payload: tokens/userIds/emails array, title, and body are required",
        400
      );
    }

    // Convert emails to userIds if necessary
    let processedTargets = targetTokensOrUserIds;
    const hasEmails = req.body.emails || targetTokensOrUserIds.some((target: string) => isValidEmail(target));
    
    if (hasEmails) {
      const emailResults = await getUserIdsByEmails(targetTokensOrUserIds);
      const validUserIds = emailResults
        .filter(result => result.userId !== null)
        .map(result => result.userId!);
      
      const invalidEmails = emailResults
        .filter(result => result.userId === null)
        .map(result => result.email);
      
      if (invalidEmails.length > 0) {
        console.warn(`Invalid emails found: ${invalidEmails.join(', ')}`);
      }
      
      processedTargets = validUserIds;
      
      if (processedTargets.length === 0) {
        throw new AppError("No valid users found for the provided email addresses", 404);
      }
    }

    const results = [];

    // Send FCM notifications
    if (notificationType === "fcm" || notificationType === "both") {
      try {
        let fcmResult;
        if (req.body.userIds || req.body.emails || hasEmails) {
          fcmResult = await firebaseNotificationService.sendToMultipleUsers(
            processedTargets,
            payload
          );
        } else {
          fcmResult = await firebaseNotificationService.sendToTokens(
            processedTargets,
            payload
          );
        }
        results.push({ type: "FCM", ...fcmResult });
      } catch (error) {
        console.error("FCM notifications failed:", error);
        results.push({
          type: "FCM",
          success: false,
          error: (error as Error).message,
        });
      }
    }

    // Send Expo notifications
    if (notificationType === "expo" || notificationType === "both") {
      try {
        let expoResult;
        if (req.body.userIds || req.body.emails || hasEmails) {
          expoResult = await expoNotificationService.sendToMultipleUsers(
            processedTargets,
            {
              title: payload.title,
              body: payload.body,
              data: payload.data,
              sound: "default",
            }
          );
        } else {
          expoResult = await expoNotificationService.sendToTokens(
            processedTargets,
            {
              title: payload.title,
              body: payload.body,
              data: payload.data,
              sound: "default",
            }
          );
        }
        results.push({ type: "Expo", ...expoResult });
      } catch (error) {
        console.error("Expo notifications failed:", error);
        results.push({
          type: "Expo",
          success: false,
          error: (error as Error).message,
        });
      }
    }

    const hasSuccess = results.some((result) => result.success);

    res.status(200).json({
      status: "success",
      message: "Notifications sent",
      results,
      overallSuccess: hasSuccess,
    });
  } catch (err) {
    next(err);
  }
};

export const sendToAllUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { title, body, data, imageUrl, notificationType } = req.body;
    if (!title || !body) {
      throw new AppError("Title and body are required", 400);
    }

    const nType = notificationType || "both";
    const results = [];

    // Send FCM notifications
    if (nType === "fcm" || nType === "both") {
      try {
        const fcmResult = await firebaseNotificationService.sendToAllUsers(
          title,
          body,
          data,
          imageUrl
        );
        results.push({ type: "FCM", ...fcmResult });
      } catch (error) {
        console.error("FCM broadcast failed:", error);
        results.push({
          type: "FCM",
          success: false,
          error: (error as Error).message,
        });
      }
    }

    // Send Expo notifications
    if (nType === "expo" || nType === "both") {
      try {
        const expoResult = await expoNotificationService.sendToAllUsers({
          title,
          body,
          data: data || {},
          sound: "default",
        });
        results.push({ type: "Expo", ...expoResult });
      } catch (error) {
        console.error("Expo broadcast failed:", error);
        results.push({
          type: "Expo",
          success: false,
          error: (error as Error).message,
        });
      }
    }

    const hasSuccess = results.some((result) => result.success);

    res.status(200).json({
      status: "success",
      message: "Notification sent to all users",
      results,
      overallSuccess: hasSuccess,
    });
  } catch (err) {
    next(err);
  }
};

export const getAllTokens = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { type } = req.query;

    let fcmData = null;
    let expoData = null;

    if (!type || type === "fcm" || type === "both") {
      const fcmUsers = await User.find({
        fcmTokens: { $exists: true, $not: { $size: 0 } },
        active: true,
      }).select("fcmTokens name email");

      fcmData = {
        users: fcmUsers,
        totalUsers: fcmUsers.length,
        totalTokens: fcmUsers.reduce(
          (sum, user) => sum + user.fcmTokens.length,
          0
        ),
      };
    }

    if (!type || type === "expo" || type === "both") {
      const expoResult = await expoNotificationService.getAllTokens();
      expoData = expoResult;
    }

    res.status(200).json({
      status: "success",
      message: "All tokens retrieved",
      data: {
        fcm: fcmData,
        expo: expoData,
      },
    });
  } catch (err) {
    next(err);
  }
};

// User notification management
export const getUserNotifications = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const type = req.query.type as string;
    const isRead = req.query.isRead as string;

    const filter: any = { userId };

    if (type) {
      filter.type = type;
    }

    if (isRead !== undefined) {
      filter.isRead = isRead === "true";
    }

    const skip = (page - 1) * limit;

    const [notifications, totalCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "name email"),
      Notification.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalCount / limit);
    const unreadCount = await Notification.countDocuments({
      userId,
      isRead: false,
    });

    res.status(200).json({
      status: "success",
      data: {
        notifications,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        unreadCount,
      },
    });
  }
);

export const markAsRead = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { notificationId } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return next(new AppError("Notification not found", 404));
    }

    res.status(200).json({
      status: "success",
      data: { notification },
    });
  }
);

export const markAllAsRead = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user.id;

    await Notification.updateMany(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.status(200).json({
      status: "success",
      message: "All notifications marked as read",
    });
  }
);

export const deleteNotification = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { notificationId } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      userId,
    });

    if (!notification) {
      return next(new AppError("Notification not found", 404));
    }

    res.status(200).json({
      status: "success",
      message: "Notification deleted successfully",
    });
  }
);

export const deleteAllNotifications = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user.id;
    const { type } = req.query;

    const filter: any = { userId };
    if (type) {
      filter.type = type;
    }

    await Notification.deleteMany(filter);

    res.status(200).json({
      status: "success",
      message: "Notifications deleted successfully",
    });
  }
);

// Admin notification management
export const getNotificationStats = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const stats = await Notification.aggregate([
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          delivered: {
            $sum: { $cond: [{ $eq: ["$deliveryStatus", "delivered"] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $eq: ["$deliveryStatus", "failed"] }, 1, 0] },
          },
          pending: {
            $sum: { $cond: [{ $eq: ["$deliveryStatus", "pending"] }, 1, 0] },
          },
        },
      },
    ]);

    const totalNotifications = await Notification.countDocuments();
    const activeTokens = await User.aggregate([
      { $unwind: "$fcmTokens" },
      { $match: { fcmTokens: { $ne: null }, active: true } },
      { $count: "activeTokens" },
    ]);

    res.status(200).json({
      status: "success",
      data: {
        totalNotifications,
        activeTokens: activeTokens[0]?.activeTokens || 0,
        notificationsByType: stats,
      },
    });
  }
);

export const sendPromotionalNotificationController = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { title, body, imageUrl, targetUsers, data } = req.body;

    if (!title || !body) {
      return next(new AppError("Title and body are required", 400));
    }

    let userIds: string[] = [];

    if (targetUsers === "all") {
      const users = await User.find({ active: true }).select("_id");
      userIds = users.map((user: any) => user._id.toString());
    } else if (Array.isArray(targetUsers)) {
      userIds = targetUsers;
    } else {
      return next(new AppError("Invalid targetUsers format", 400));
    }
    const result = await sendPromotionalNotification(
      userIds,
      title,
      body,
      data || {},
      imageUrl
    );

    res.status(200).json({
      status: "success",
      message: "Promotional notification sent",
      data: result,
    });
  }
);

export const getNotificationHistory = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const type = req.query.type as string;
    const status = req.query.status as string;

    const filter: any = {};

    if (type) {
      filter.type = type;
    }

    if (status) {
      filter.deliveryStatus = status;
    }

    const skip = (page - 1) * limit;

    const [notifications, totalCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "name email"),
      Notification.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.status(200).json({
      status: "success",
      data: {
        notifications,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  }
);
