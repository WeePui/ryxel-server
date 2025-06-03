import admin from "../configs/firebase";
import User from "../models/userModel";
import Notification, { INotification } from "../models/notificationModel";
import { Types } from "mongoose";

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string;
}

export interface OrderNotificationData {
  userId: string | Types.ObjectId;
  orderId: string | Types.ObjectId;
  orderCode: string;
  type:
    | "order_created"
    | "order_status_updated"
    | "order_shipped"
    | "order_delivered"
    | "order_cancelled";
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string;
}

class FirebaseNotificationService {
  private static instance: FirebaseNotificationService;

  private constructor() {}

  public static getInstance(): FirebaseNotificationService {
    if (!FirebaseNotificationService.instance) {
      FirebaseNotificationService.instance = new FirebaseNotificationService();
    }
    return FirebaseNotificationService.instance;
  }
  /**
   * Send notification to a specific user by user ID
   */
  public async sendToUser(
    userId: string | Types.ObjectId,
    payload: NotificationPayload,
    type: INotification["type"] = "general",
    orderId?: string | Types.ObjectId,
    orderCode?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Get user's FCM tokens
      const user = await User.findById(userId).select("fcmTokens name email");
      if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
        console.log(`No FCM tokens found for user ${userId}`);

        // Don't save notification to database if user has no tokens
        // This prevents notification records for users who can't receive them
        return { success: false, error: "No FCM tokens found for user" };
      }

      const message = {
        notification: {
          title: payload.title,
          body: payload.body,
          ...(payload.imageUrl && { imageUrl: payload.imageUrl }),
        },
        data: {
          type,
          ...(orderId && { orderId: orderId.toString() }),
          ...(orderCode && { orderCode }),
          ...(payload.data || {}),
        },
        tokens: user.fcmTokens,
      };

      // Send to Firebase
      const response = await admin.messaging().sendEachForMulticast(message);

      // Only save notification to database if sending was successful
      if (response.successCount > 0) {
        const notification = await this.saveNotificationToDatabase({
          userId: userId as Types.ObjectId,
          title: payload.title,
          body: payload.body,
          data: payload.data,
          imageUrl: payload.imageUrl,
          type,
          orderId: orderId as Types.ObjectId,
          orderCode,
          fcmMessageId: response.responses[0]?.messageId,
        });
      }

      // Clean up invalid tokens
      await this.cleanupInvalidTokens(
        user.fcmTokens,
        response.responses,
        userId
      );

      console.log(`Notification sent to user ${userId}:`, {
        successCount: response.successCount,
        failureCount: response.failureCount,
      });

      return {
        success: response.successCount > 0,
        messageId: response.responses[0]?.messageId,
        error: response.failureCount > 0 ? "Some tokens failed" : undefined,
      };
    } catch (error) {
      console.error("Error sending notification to user:", error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Send notification to multiple users by user IDs
   */
  public async sendToMultipleUsers(
    userIds: (string | Types.ObjectId)[],
    payload: NotificationPayload,
    type: INotification["type"] = "general"
  ): Promise<{ success: boolean; results: any[] }> {
    const results = await Promise.allSettled(
      userIds.map((userId) => this.sendToUser(userId, payload, type))
    );

    const successCount = results.filter(
      (result) => result.status === "fulfilled" && result.value.success
    ).length;

    return {
      success: successCount > 0,
      results: results.map((result) =>
        result.status === "fulfilled"
          ? result.value
          : { success: false, error: "Promise rejected" }
      ),
    };
  }
  /**
   * Send notification to all users (broadcast) - overload for direct parameters
   */
  public async sendToAllUsers(
    title: string,
    body: string,
    data?: Record<string, any>,
    imageUrl?: string,
    type?: INotification["type"]
  ): Promise<{ success: boolean; sentCount: number; totalUsers: number }>;

  /**
   * Send notification to all users (broadcast) - with payload object
   */
  public async sendToAllUsers(
    payload: NotificationPayload,
    type?: INotification["type"]
  ): Promise<{ success: boolean; sentCount: number; totalUsers: number }>;
  // Implementation
  public async sendToAllUsers(
    titleOrPayload: string | NotificationPayload,
    bodyOrType?: string | INotification["type"],
    data?: Record<string, any>,
    imageUrl?: string,
    type: INotification["type"] = "general"
  ): Promise<{ success: boolean; sentCount: number; totalUsers: number }> {
    try {
      let payload: NotificationPayload;
      let notificationType: INotification["type"];

      if (typeof titleOrPayload === "string") {
        // Called with individual parameters
        payload = {
          title: titleOrPayload,
          body: bodyOrType as string,
          data,
          imageUrl,
        };
        notificationType = type;
      } else {
        // Called with payload object
        payload = titleOrPayload;
        notificationType = (bodyOrType as INotification["type"]) || "general";
      }

      // Only get users who have FCM tokens (like Expo service does)
      const users = await User.find({
        active: true,
        fcmTokens: { $exists: true, $ne: [] },
      }).select("_id fcmTokens");

      if (!users || users.length === 0) {
        console.log(
          "No users with FCM tokens found for broadcast notification"
        );
        return {
          success: false,
          sentCount: 0,
          totalUsers: 0,
        };
      }

      // Get all valid FCM tokens
      const allTokens: string[] = [];
      const notificationPromises: Promise<any>[] = [];

      for (const user of users) {
        if (user.fcmTokens && user.fcmTokens.length > 0) {
          allTokens.push(...user.fcmTokens);

          // Prepare notification for database
          const notification = new Notification({
            userId: user._id,
            title: payload.title,
            body: payload.body,
            data: payload.data || {},
            imageUrl: payload.imageUrl,
            type: notificationType,
            sentAt: new Date(),
          });

          notificationPromises.push(notification.save());
        }
      }

      if (allTokens.length === 0) {
        console.log("No valid FCM tokens found for broadcast notification");
        return {
          success: false,
          sentCount: 0,
          totalUsers: users.length,
        };
      }

      // Send FCM notification to all tokens
      const message = {
        notification: {
          title: payload.title,
          body: payload.body,
          ...(payload.imageUrl && { imageUrl: payload.imageUrl }),
        },
        data: {
          type: notificationType,
          ...(payload.data || {}),
        },
        tokens: allTokens,
      };

      const response = await admin.messaging().sendEachForMulticast(message);

      // Save notifications to database
      try {
        await Promise.allSettled(notificationPromises);
      } catch (dbError) {
        console.error("Error saving notifications to database:", dbError);
      }

      // Clean up invalid tokens
      if (response.failureCount > 0) {
        const invalidTokens: string[] = [];
        response.responses.forEach((resp, index) => {
          if (!resp.success && resp.error) {
            const errorCode = resp.error.code;
            if (
              errorCode === "messaging/invalid-registration-token" ||
              errorCode === "messaging/registration-token-not-registered"
            ) {
              invalidTokens.push(allTokens[index]);
            }
          }
        });

        if (invalidTokens.length > 0) {
          // Remove invalid tokens from users
          await User.updateMany(
            { fcmTokens: { $in: invalidTokens } },
            { $pull: { fcmTokens: { $in: invalidTokens } } }
          );
          console.log(`Removed ${invalidTokens.length} invalid FCM tokens`);
        }
      }

      console.log(`FCM broadcast notification sent:`, {
        successCount: response.successCount,
        failureCount: response.failureCount,
        totalUsers: users.length,
      });

      return {
        success: response.successCount > 0,
        sentCount: response.successCount,
        totalUsers: users.length,
      };
    } catch (error) {
      console.error("Error sending notification to all users:", error);
      return { success: false, sentCount: 0, totalUsers: 0 };
    }
  }

  /**
   * Send order-related notification
   */
  public async sendOrderNotification(
    data: OrderNotificationData
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.sendToUser(
      data.userId,
      {
        title: data.title,
        body: data.body,
        data: data.data,
        imageUrl: data.imageUrl,
      },
      data.type,
      data.orderId,
      data.orderCode
    );
  }

  /**
   * Save notification to database
   */
  private async saveNotificationToDatabase(data: {
    userId: Types.ObjectId;
    title: string;
    body: string;
    data?: Record<string, any>;
    imageUrl?: string;
    type: INotification["type"];
    orderId?: Types.ObjectId;
    orderCode?: string;
    fcmMessageId?: string;
  }): Promise<INotification> {
    const notification = new Notification({
      userId: data.userId,
      title: data.title,
      body: data.body,
      data: data.data || {},
      imageUrl: data.imageUrl,
      type: data.type,
      orderId: data.orderId,
      orderCode: data.orderCode,
      fcmMessageId: data.fcmMessageId,
      isRead: false,
      sentAt: new Date(),
    });

    return notification.save();
  }

  /**
   * Clean up invalid FCM tokens
   */
  private async cleanupInvalidTokens(
    tokens: string[],
    responses: admin.messaging.SendResponse[],
    userId: string | Types.ObjectId
  ): Promise<void> {
    const invalidTokens: string[] = [];

    responses.forEach((response, index) => {
      if (!response.success && response.error) {
        const errorCode = response.error.code;
        if (
          errorCode === "messaging/invalid-registration-token" ||
          errorCode === "messaging/registration-token-not-registered"
        ) {
          invalidTokens.push(tokens[index]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      console.log(
        `Removing ${invalidTokens.length} invalid FCM tokens for user ${userId}`
      );
      await User.findByIdAndUpdate(userId, {
        $pullAll: { fcmTokens: invalidTokens },
      });
    }
  }

  /**
   * Get user's notifications with pagination
   */
  public async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
    type?: string
  ) {
    return Notification.getUserNotifications(userId, page, limit, type);
  }

  /**
   * Mark notifications as read
   */
  public async markNotificationsAsRead(
    notificationIds: string[],
    userId: string
  ) {
    return Notification.markMultipleAsRead(notificationIds, userId);
  }

  /**
   * Get unread notification count
   */
  public async getUnreadCount(userId: string) {
    return Notification.getUnreadCount(userId);
  }

  /**
   * Mark single notification as read
   */
  public async markNotificationAsRead(notificationId: string, userId: string) {
    const notification = await Notification.findOne({
      _id: notificationId,
      userId: userId,
    });

    if (notification && !notification.isRead) {
      return notification.markAsRead();
    }

    return notification;
  }

  /**
   * Register FCM token for a user
   */
  public async registerToken(
    userId: string | Types.ObjectId,
    token: string,
    platform: string,
    deviceInfo?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return { success: false, message: "User not found" };
      }

      // Check if token already exists
      if (user.fcmTokens.includes(token)) {
        return { success: true, message: "Token already registered" };
      }

      // Add token to user's fcmTokens array
      user.fcmTokens.push(token);
      await user.save();

      console.log(`FCM token registered for user ${userId}: ${token}`);
      return { success: true, message: "Token registered successfully" };
    } catch (error) {
      console.error("Error registering FCM token:", error);
      return { success: false, message: (error as Error).message };
    }
  }

  /**
   * Unregister FCM token
   */
  public async unregisterToken(
    token: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Remove token from all users
      await User.updateMany(
        { fcmTokens: token },
        { $pull: { fcmTokens: token } }
      );

      console.log(`FCM token unregistered: ${token}`);
      return { success: true, message: "Token unregistered successfully" };
    } catch (error) {
      console.error("Error unregistering FCM token:", error);
      return { success: false, message: (error as Error).message };
    }
  }

  /**
   * Send notification to specific tokens
   */
  public async sendToTokens(
    tokens: string[],
    payload: NotificationPayload
  ): Promise<{
    success: boolean;
    successCount: number;
    failureCount: number;
    responses: any[];
  }> {
    try {
      if (!tokens || tokens.length === 0) {
        return {
          success: false,
          successCount: 0,
          failureCount: 0,
          responses: [],
        };
      }

      const message = {
        notification: {
          title: payload.title,
          body: payload.body,
          ...(payload.imageUrl && { imageUrl: payload.imageUrl }),
        },
        data: payload.data || {},
        tokens: tokens,
      };

      // Convert all data values to strings as required by FCM
      Object.keys(message.data).forEach((key) => {
        message.data[key] = String(message.data[key]);
      });

      const response = await admin.messaging().sendEachForMulticast(message);

      console.log(`Notification sent to ${tokens.length} tokens:`, {
        successCount: response.successCount,
        failureCount: response.failureCount,
      });

      return {
        success: response.successCount > 0,
        successCount: response.successCount,
        failureCount: response.failureCount,
        responses: response.responses,
      };
    } catch (error) {
      console.error("Error sending notification to tokens:", error);
      return {
        success: false,
        successCount: 0,
        failureCount: tokens.length,
        responses: [],
      };
    }
  }
}

export default FirebaseNotificationService;
