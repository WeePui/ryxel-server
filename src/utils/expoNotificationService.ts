import { Expo, ExpoPushToken, ExpoPushMessage } from "expo-server-sdk";
import { Types } from "mongoose";
import User from "../models/userModel";
import Notification, { INotification } from "../models/notificationModel";

export interface ExpoNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: "default" | null;
  badge?: number;
  priority?: "default" | "normal" | "high";
  subtitle?: string;
  channelId?: string;
}

export interface ExpoOrderNotificationData {
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
  sound?: "default" | null;
  badge?: number;
}

class ExpoNotificationService {
  private static instance: ExpoNotificationService;
  private expo: Expo;

  private constructor() {
    this.expo = new Expo({
      // If you want to use FCM v1 API, set useFcmV1 to true
      useFcmV1: false, // Set to true if you want to use FCM v1 API
    });
  }

  public static getInstance(): ExpoNotificationService {
    if (!ExpoNotificationService.instance) {
      ExpoNotificationService.instance = new ExpoNotificationService();
    }
    return ExpoNotificationService.instance;
  }
  /**
   * Send notification to a specific user by user ID
   */
  public async sendToUser(
    userId: string | Types.ObjectId,
    payload: ExpoNotificationPayload,
    type: INotification["type"] = "general",
    orderId?: string | Types.ObjectId,
    orderCode?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const user = await User.findById(userId).select("expoPushTokens");
      if (!user || !user.expoPushTokens || user.expoPushTokens.length === 0) {
        console.log(`No Expo push tokens found for user ${userId}`);

        // Don't save notification to database if user has no tokens
        // This prevents notification records for users who can't receive them
        return {
          success: false,
          error: "No Expo push tokens found for user",
        };
      }

      // Filter valid tokens
      const validTokens = user.expoPushTokens.filter((token) =>
        Expo.isExpoPushToken(token)
      );

      if (validTokens.length === 0) {
        console.log(`No valid Expo push tokens found for user ${userId}`);
        return {
          success: false,
          error: "No valid Expo push tokens found for user",
        };
      }

      // Create messages for all valid tokens
      const messages: ExpoPushMessage[] = validTokens.map((token) => ({
        to: token as ExpoPushToken,
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        sound: payload.sound || "default",
        badge: payload.badge,
        priority: payload.priority || "high",
        subtitle: payload.subtitle,
        channelId: payload.channelId,
      }));

      // Send notifications
      const chunks = this.expo.chunkPushNotifications(messages);
      const tickets = [];

      for (const chunk of chunks) {
        try {
          const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
        } catch (error) {
          console.error("Error sending Expo notification chunk:", error);
        }
      }

      // Only save notification to database if sending was successful
      const successfulTickets = tickets.filter(
        (ticket) => ticket.status === "ok"
      );
      if (successfulTickets.length > 0) {
        try {
          const notification = new Notification({
            userId,
            title: payload.title,
            body: payload.body,
            data: payload.data || {},
            type,
            orderId: orderId || undefined,
            orderCode: orderCode || undefined,
            sentAt: new Date(),
          });

          await notification.save();
        } catch (dbError) {
          console.error("Error saving notification to database:", dbError);
        }
      }

      return {
        success: successfulTickets.length > 0,
        messageId:
          tickets[0] && "id" in tickets[0] ? (tickets[0] as any).id : undefined,
      };
    } catch (error: any) {
      console.error("Error in Expo sendToUser:", error);
      return {
        success: false,
        error: error.message || "Failed to send notification",
      };
    }
  }

  /**
   * Send notification to multiple users
   */
  public async sendToMultipleUsers(
    userIds: (string | Types.ObjectId)[],
    payload: ExpoNotificationPayload,
    type: INotification["type"] = "general"
  ): Promise<{ success: boolean; results: any[] }> {
    const results = [];

    for (const userId of userIds) {
      const result = await this.sendToUser(userId, payload, type);
      results.push({ userId, ...result });
    }

    const successCount = results.filter((r) => r.success).length;

    return {
      success: successCount > 0,
      results,
    };
  }

  /**
   * Send notification to all users
   */
  public async sendToAllUsers(
    titleOrPayload: string | ExpoNotificationPayload,
    bodyOrType?: string | INotification["type"],
    data?: Record<string, any>,
    sound?: "default" | null,
    type: INotification["type"] = "general"
  ): Promise<{ success: boolean; sentCount: number; totalUsers: number }> {
    try {
      let payload: ExpoNotificationPayload;

      if (typeof titleOrPayload === "string") {
        payload = {
          title: titleOrPayload,
          body: bodyOrType as string,
          data: data || {},
          sound: sound || "default",
        };
        type = type;
      } else {
        payload = titleOrPayload;
        type = (bodyOrType as INotification["type"]) || "general";
      }

      // Get all users with Expo push tokens
      const users = await User.find({
        expoPushTokens: { $exists: true, $ne: [] },
      }).select("_id expoPushTokens");

      if (!users || users.length === 0) {
        return {
          success: false,
          sentCount: 0,
          totalUsers: 0,
        };
      }

      // Collect all valid tokens
      const allMessages: ExpoPushMessage[] = [];
      const notificationPromises: Promise<any>[] = [];

      for (const user of users) {
        const validTokens = user.expoPushTokens.filter((token) =>
          Expo.isExpoPushToken(token)
        );

        if (validTokens.length > 0) {
          // Add messages for this user
          const userMessages = validTokens.map((token) => ({
            to: token as ExpoPushToken,
            title: payload.title,
            body: payload.body,
            data: payload.data || {},
            sound: payload.sound || "default",
            badge: payload.badge,
            priority: payload.priority || "high",
            subtitle: payload.subtitle,
            channelId: payload.channelId,
          }));

          allMessages.push(...userMessages);

          // Prepare notification for database
          const notification = new Notification({
            userId: user._id,
            title: payload.title,
            body: payload.body,
            data: payload.data || {},
            type,
            sentAt: new Date(),
          });

          notificationPromises.push(notification.save());
        }
      }

      // Send all notifications
      const chunks = this.expo.chunkPushNotifications(allMessages);
      let sentCount = 0;

      for (const chunk of chunks) {
        try {
          await this.expo.sendPushNotificationsAsync(chunk);
          sentCount += chunk.length;
        } catch (error) {
          console.error("Error sending Expo notification chunk:", error);
        }
      }

      // Save notifications to database
      try {
        await Promise.allSettled(notificationPromises);
      } catch (dbError) {
        console.error("Error saving notifications to database:", dbError);
      }

      return {
        success: sentCount > 0,
        sentCount,
        totalUsers: users.length,
      };
    } catch (error: any) {
      console.error("Error in Expo sendToAllUsers:", error);
      return {
        success: false,
        sentCount: 0,
        totalUsers: 0,
      };
    }
  }

  /**
   * Send order-related notification
   */
  public async sendOrderNotification(
    data: ExpoOrderNotificationData
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const payload: ExpoNotificationPayload = {
      title: data.title,
      body: data.body,
      data: {
        orderId: data.orderId.toString(),
        orderCode: data.orderCode,
        type: data.type,
        ...data.data,
      },
      sound: data.sound || "default",
      badge: data.badge,
    };

    return this.sendToUser(
      data.userId,
      payload,
      data.type,
      data.orderId,
      data.orderCode
    );
  }

  /**
   * Send notification to specific tokens
   */
  public async sendToTokens(
    tokens: string[],
    payload: ExpoNotificationPayload
  ): Promise<{
    success: boolean;
    successCount: number;
    failureCount: number;
    responses: any[];
  }> {
    try {
      // Filter valid tokens
      const validTokens = tokens.filter((token) => Expo.isExpoPushToken(token));

      if (validTokens.length === 0) {
        return {
          success: false,
          successCount: 0,
          failureCount: tokens.length,
          responses: [],
        };
      }

      // Create messages
      const messages: ExpoPushMessage[] = validTokens.map((token) => ({
        to: token as ExpoPushToken,
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        sound: payload.sound || "default",
        badge: payload.badge,
        priority: payload.priority || "high",
        subtitle: payload.subtitle,
        channelId: payload.channelId,
      }));

      // Send notifications
      const chunks = this.expo.chunkPushNotifications(messages);
      const allTickets = [];

      for (const chunk of chunks) {
        try {
          const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
          allTickets.push(...ticketChunk);
        } catch (error) {
          console.error("Error sending Expo notification chunk:", error);
          allTickets.push(
            ...chunk.map(() => ({ status: "error", message: "Failed to send" }))
          );
        }
      }

      const successCount = allTickets.filter(
        (ticket) => ticket.status === "ok"
      ).length;
      const failureCount = allTickets.length - successCount;

      return {
        success: successCount > 0,
        successCount,
        failureCount,
        responses: allTickets,
      };
    } catch (error: any) {
      console.error("Error in Expo sendToTokens:", error);
      return {
        success: false,
        successCount: 0,
        failureCount: tokens.length,
        responses: [],
      };
    }
  }

  /**
   * Register Expo push token for a user
   */
  public async registerToken(
    userId: string | Types.ObjectId,
    token: string,
    platform: string,
    deviceInfo?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!Expo.isExpoPushToken(token)) {
        return {
          success: false,
          message: "Invalid Expo push token",
        };
      }

      const user = await User.findById(userId);
      if (!user) {
        return {
          success: false,
          message: "User not found",
        };
      }

      // Check if token already exists
      if (user.expoPushTokens.includes(token)) {
        return {
          success: true,
          message: "Expo push token already registered",
        };
      }

      // Add token to user's tokens
      user.expoPushTokens.push(token);
      await user.save();

      console.log(
        `Expo push token registered for user ${userId} on ${platform}${deviceInfo ? ` - ${deviceInfo}` : ""}`
      );

      return {
        success: true,
        message: "Expo push token registered successfully",
      };
    } catch (error: any) {
      console.error("Error registering Expo push token:", error);
      return {
        success: false,
        message: error.message || "Failed to register Expo push token",
      };
    }
  }

  /**
   * Unregister Expo push token
   */
  public async unregisterToken(
    token: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Find user with this token
      const user = await User.findOne({ expoPushTokens: token });
      if (!user) {
        return {
          success: true,
          message: "Token not found",
        };
      }

      // Remove token from user's tokens
      user.expoPushTokens = user.expoPushTokens.filter((t) => t !== token);
      await user.save();

      console.log(`Expo push token unregistered for user ${user._id}`);

      return {
        success: true,
        message: "Expo push token unregistered successfully",
      };
    } catch (error: any) {
      console.error("Error unregistering Expo push token:", error);
      return {
        success: false,
        message: error.message || "Failed to unregister Expo push token",
      };
    }
  }

  /**
   * Get all registered Expo tokens (admin only)
   */
  public async getAllTokens(): Promise<{
    success: boolean;
    tokens: { userId: string; tokens: string[] }[];
    totalUsers: number;
    totalTokens: number;
  }> {
    try {
      const users = await User.find({
        expoPushTokens: { $exists: true, $ne: [] },
      }).select("_id expoPushTokens");

      const tokens = users.map((user) => ({
        userId: user._id.toString(),
        tokens: user.expoPushTokens,
      }));

      const totalTokens = users.reduce(
        (sum, user) => sum + user.expoPushTokens.length,
        0
      );

      return {
        success: true,
        tokens,
        totalUsers: users.length,
        totalTokens,
      };
    } catch (error: any) {
      console.error("Error getting all Expo tokens:", error);
      return {
        success: false,
        tokens: [],
        totalUsers: 0,
        totalTokens: 0,
      };
    }
  }

  /**
   * Clean up invalid tokens
   */
  public async cleanupInvalidTokens(): Promise<{
    success: boolean;
    removedCount: number;
  }> {
    try {
      const users = await User.find({
        expoPushTokens: { $exists: true, $ne: [] },
      });

      let removedCount = 0;

      for (const user of users) {
        const validTokens = user.expoPushTokens.filter((token) =>
          Expo.isExpoPushToken(token)
        );

        if (validTokens.length !== user.expoPushTokens.length) {
          const removedFromUser =
            user.expoPushTokens.length - validTokens.length;
          removedCount += removedFromUser;

          user.expoPushTokens = validTokens;
          await user.save();
        }
      }

      return {
        success: true,
        removedCount,
      };
    } catch (error: any) {
      console.error("Error cleaning up invalid Expo tokens:", error);
      return {
        success: false,
        removedCount: 0,
      };
    }
  }
}

export default ExpoNotificationService;
