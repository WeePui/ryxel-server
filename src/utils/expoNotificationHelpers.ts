import { Types } from "mongoose";
import ExpoNotificationService from "./expoNotificationService";

const expoNotificationService = ExpoNotificationService.getInstance();

export interface OrderData {
  _id: string | Types.ObjectId;
  orderCode: string;
  userId: string | Types.ObjectId;
  totalAmount: number;
  status: string;
  user?: {
    name: string;
    email: string;
  };
}

/**
 * Send Expo notification when a new order is created
 */
export const sendExpoOrderCreatedNotification = async (
  orderData: OrderData
) => {
  try {
    const result = await expoNotificationService.sendOrderNotification({
      userId: orderData.userId,
      orderId: orderData._id,
      orderCode: orderData.orderCode,
      type: "order_created",
      title: "🎉 Order Placed Successfully!",
      body: `Your order #${orderData.orderCode} for ${formatCurrency(orderData.totalAmount)} has been placed successfully and is being processed.`,
      data: {
        orderId: orderData._id.toString(),
        orderCode: orderData.orderCode,
        amount: orderData.totalAmount,
        status: orderData.status,
        timestamp: new Date().toISOString(),
      },
      sound: "default",
      badge: 1,
    });

    if (result.success) {
      console.log(
        `✅ Expo order created notification sent for order ${orderData.orderCode}`
      );
    } else {
      console.log(
        `❌ Failed to send Expo order created notification: ${result.error}`
      );
    }

    return result;
  } catch (error) {
    console.error("Error sending Expo order created notification:", error);
    return { success: false, error: (error as Error).message };
  }
};

/**
 * Send Expo notification when order status is updated
 */
export const sendExpoOrderStatusUpdatedNotification = async (
  orderData: OrderData,
  oldStatus: string,
  newStatus: string,
  adminNotes?: string
) => {
  try {
    const statusMessage = getStatusUpdateMessage(
      newStatus,
      orderData.orderCode,
      adminNotes
    );

    const result = await expoNotificationService.sendOrderNotification({
      userId: orderData.userId,
      orderId: orderData._id,
      orderCode: orderData.orderCode,
      type: "order_status_updated",
      title: "📦 Order Status Updated",
      body: statusMessage,
      data: {
        orderId: orderData._id.toString(),
        orderCode: orderData.orderCode,
        oldStatus,
        newStatus,
        adminNotes: adminNotes || "",
        timestamp: new Date().toISOString(),
      },
      sound: "default",
    });

    if (result.success) {
      console.log(
        `✅ Expo order status notification sent for order ${orderData.orderCode}: ${oldStatus} → ${newStatus}`
      );
    } else {
      console.log(
        `❌ Failed to send Expo order status notification: ${result.error}`
      );
    }

    return result;
  } catch (error) {
    console.error("Error sending Expo order status notification:", error);
    return { success: false, error: (error as Error).message };
  }
};

/**
 * Send Expo notification when order is shipped
 */
export const sendExpoOrderShippedNotification = async (
  orderData: OrderData,
  trackingInfo?: { trackingNumber?: string; carrier?: string }
) => {
  try {
    let body = `Your order #${orderData.orderCode} has been shipped! 🚚`;

    if (trackingInfo?.trackingNumber) {
      body += ` Track with: ${trackingInfo.trackingNumber}`;
      if (trackingInfo.carrier) {
        body += ` via ${trackingInfo.carrier}`;
      }
    }

    const result = await expoNotificationService.sendOrderNotification({
      userId: orderData.userId,
      orderId: orderData._id,
      orderCode: orderData.orderCode,
      type: "order_shipped",
      title: "🚚 Your Order is On Its Way!",
      body,
      data: {
        orderId: orderData._id.toString(),
        orderCode: orderData.orderCode,
        trackingNumber: trackingInfo?.trackingNumber || "",
        carrier: trackingInfo?.carrier || "",
        timestamp: new Date().toISOString(),
      },
      sound: "default",
    });

    if (result.success) {
      console.log(
        `✅ Expo order shipped notification sent for order ${orderData.orderCode}`
      );
    } else {
      console.log(
        `❌ Failed to send Expo order shipped notification: ${result.error}`
      );
    }

    return result;
  } catch (error) {
    console.error("Error sending Expo order shipped notification:", error);
    return { success: false, error: (error as Error).message };
  }
};

/**
 * Send Expo notification when order is delivered
 */
export const sendExpoOrderDeliveredNotification = async (
  orderData: OrderData
) => {
  try {
    const result = await expoNotificationService.sendOrderNotification({
      userId: orderData.userId,
      orderId: orderData._id,
      orderCode: orderData.orderCode,
      type: "order_delivered",
      title: "✅ Order Delivered Successfully!",
      body: `Your order #${orderData.orderCode} has been delivered! We hope you love your purchase. Don't forget to leave a review! ⭐`,
      data: {
        orderId: orderData._id.toString(),
        orderCode: orderData.orderCode,
        deliveredAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      },
      sound: "default",
    });

    if (result.success) {
      console.log(
        `✅ Expo order delivered notification sent for order ${orderData.orderCode}`
      );
    } else {
      console.log(
        `❌ Failed to send Expo order delivered notification: ${result.error}`
      );
    }

    return result;
  } catch (error) {
    console.error("Error sending Expo order delivered notification:", error);
    return { success: false, error: (error as Error).message };
  }
};

/**
 * Send Expo notification when order is cancelled
 */
export const sendExpoOrderCancelledNotification = async (
  orderData: OrderData,
  reason?: string,
  refundInfo?: { amount: number; method: string; timeline: string }
) => {
  try {
    let body = `Your order #${orderData.orderCode} has been cancelled.`;

    if (reason) {
      body += ` Reason: ${reason}`;
    }

    if (refundInfo) {
      body += ` Refund of ${formatCurrency(refundInfo.amount)} via ${refundInfo.method} will be processed within ${refundInfo.timeline}.`;
    }

    const result = await expoNotificationService.sendOrderNotification({
      userId: orderData.userId,
      orderId: orderData._id,
      orderCode: orderData.orderCode,
      type: "order_cancelled",
      title: "❌ Order Cancelled",
      body,
      data: {
        orderId: orderData._id.toString(),
        orderCode: orderData.orderCode,
        reason: reason || "",
        refundInfo: refundInfo || {},
        timestamp: new Date().toISOString(),
      },
      sound: "default",
    });

    if (result.success) {
      console.log(
        `✅ Expo order cancelled notification sent for order ${orderData.orderCode}`
      );
    } else {
      console.log(
        `❌ Failed to send Expo order cancelled notification: ${result.error}`
      );
    }

    return result;
  } catch (error) {
    console.error("Error sending Expo order cancelled notification:", error);
    return { success: false, error: (error as Error).message };
  }
};

/**
 * Send Expo promotional notification
 */
export const sendExpoPromotionalNotification = async (
  userIds: (string | Types.ObjectId)[] | "all",
  title: string,
  body: string,
  data?: Record<string, any>,
  sound?: "default" | null
) => {
  try {
    let result;

    if (userIds === "all") {
      result = await expoNotificationService.sendToAllUsers(
        {
          title,
          body,
          data: data || {},
          sound: sound || "default",
        },
        "promotion"
      );
    } else {
      result = await expoNotificationService.sendToMultipleUsers(
        userIds,
        {
          title,
          body,
          data: data || {},
          sound: sound || "default",
        },
        "promotion"
      );
    }

    if (result.success) {
      const target =
        userIds === "all" ? "all users" : `${userIds.length} users`;
      console.log(`✅ Expo promotional notification sent to ${target}`);
    } else {
      console.log(`❌ Failed to send Expo promotional notification`);
    }

    return result;
  } catch (error) {
    console.error("Error sending Expo promotional notification:", error);
    return { success: false, error: (error as Error).message };
  }
};

/**
 * Get status update message based on new status
 */
function getStatusUpdateMessage(
  status: string,
  orderCode: string,
  adminNotes?: string
): string {
  const messages: Record<string, string> = {
    pending: `Your order #${orderCode} is pending confirmation.`,
    confirmed: `Great news! Your order #${orderCode} has been confirmed and is being prepared.`,
    processing: `Your order #${orderCode} is currently being processed.`,
    shipped: `Your order #${orderCode} has been shipped! 🚚`,
    delivered: `Your order #${orderCode} has been delivered! ✅`,
    cancelled: `Your order #${orderCode} has been cancelled. ❌`,
    refunded: `Your order #${orderCode} has been refunded. 💰`,
    on_hold: `Your order #${orderCode} is currently on hold.`,
  };

  let message =
    messages[status] ||
    `Your order #${orderCode} status has been updated to: ${status}`;

  if (adminNotes) {
    message += ` Note: ${adminNotes}`;
  }

  return message;
}

/**
 * Format currency to VND
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(amount);
}

export { expoNotificationService as ExpoNotificationService };
