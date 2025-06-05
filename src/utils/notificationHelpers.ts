import FirebaseNotificationService from "./firebaseNotificationService";
import ExpoNotificationService from "./expoNotificationService";
import {
  sendExpoOrderCreatedNotification,
  sendExpoOrderStatusUpdatedNotification,
  sendExpoOrderShippedNotification,
  sendExpoOrderDeliveredNotification,
  sendExpoOrderCancelledNotification,
  sendExpoPromotionalNotification,
} from "./expoNotificationHelpers";
import { Types } from "mongoose";

const notificationService = FirebaseNotificationService.getInstance();
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
 * Send notification when a new order is created
 */
export const sendOrderCreatedNotification = async (orderData: OrderData) => {
  try {
    // Send both FCM and Expo notifications
    const [fcmResult, expoResult] = await Promise.allSettled([
      notificationService.sendOrderNotification({
        userId: orderData.userId,
        orderId: orderData._id,
        orderCode: orderData.orderCode,
        type: "order_created",
        title: "🎉 Đặt hàng thành công!",
        body: `Đơn hàng #${orderData.orderCode} của bạn đã được tạo thành công với tổng giá trị ${formatCurrency(
          orderData.totalAmount
        )}. Chúng tôi sẽ xử lý đơn hàng trong thời gian sớm nhất.`,
        data: {
          orderCode: orderData.orderCode,
          totalAmount: orderData.totalAmount,
          status: orderData.status,
          clickAction: `/account/orders/${orderData.orderCode}`,
        },
      }),
      sendExpoOrderCreatedNotification(orderData),
    ]);

    console.log(
      `Order created notifications sent for order ${orderData.orderCode}:`,
      { fcm: fcmResult, expo: expoResult }
    );

    // Return success if at least one notification was sent successfully
    const fcmSuccess =
      fcmResult.status === "fulfilled" && fcmResult.value.success;
    const expoSuccess =
      expoResult.status === "fulfilled" && expoResult.value.success;

    return {
      success: fcmSuccess || expoSuccess,
      fcm: fcmResult,
      expo: expoResult,
    };
  } catch (error) {
    console.error("Error sending order created notification:", error);
    return { success: false, error: (error as Error).message };
  }
};

/**
 * Send notification when order status is updated
 */
export const sendOrderStatusUpdatedNotification = async (
  orderData: OrderData,
  oldStatus: string,
  newStatus: string,
  adminNotes?: string
) => {
  try {
    const { title, body, type } = getStatusUpdateMessage(
      newStatus,
      orderData.orderCode,
      adminNotes
    );

    // Send both FCM and Expo notifications
    const [fcmResult, expoResult] = await Promise.allSettled([
      notificationService.sendOrderNotification({
        userId: orderData.userId,
        orderId: orderData._id,
        orderCode: orderData.orderCode,
        type: type as any,
        title,
        body,
        data: {
          orderCode: orderData.orderCode,
          oldStatus,
          newStatus,
          totalAmount: orderData.totalAmount,
          adminNotes,
          clickAction: `/account/orders/${orderData.orderCode}`,
        },
      }),
      sendExpoOrderStatusUpdatedNotification(
        orderData,
        oldStatus,
        newStatus,
        adminNotes
      ),
    ]);

    console.log(
      `Order status update notifications sent for order ${orderData.orderCode}:`,
      { fcm: fcmResult, expo: expoResult }
    );

    // Return success if at least one notification was sent successfully
    const fcmSuccess =
      fcmResult.status === "fulfilled" && fcmResult.value.success;
    const expoSuccess =
      expoResult.status === "fulfilled" && expoResult.value.success;

    return {
      success: fcmSuccess || expoSuccess,
      fcm: fcmResult,
      expo: expoResult,
    };
  } catch (error) {
    console.error("Error sending order status update notification:", error);
    return { success: false, error: (error as Error).message };
  }
};

/**
 * Send notification when order is shipped
 */
export const sendOrderShippedNotification = async (
  orderData: OrderData,
  trackingInfo?: { trackingNumber?: string; carrier?: string }
) => {
  try {
    let body = `Đơn hàng #${orderData.orderCode} đã được giao cho đối tác vận chuyển và đang trên đường đến bạn.`;

    if (trackingInfo?.trackingNumber) {
      body += ` Mã vận đơn: ${trackingInfo.trackingNumber}`;
    }

    // Send both FCM and Expo notifications
    const [fcmResult, expoResult] = await Promise.allSettled([
      notificationService.sendOrderNotification({
        userId: orderData.userId,
        orderId: orderData._id,
        orderCode: orderData.orderCode,
        type: "order_shipped",
        title: "🚚 Đơn hàng đang được giao!",
        body,
        data: {
          orderCode: orderData.orderCode,
          trackingNumber: trackingInfo?.trackingNumber,
          carrier: trackingInfo?.carrier,
          clickAction: `/account/orders/${orderData.orderCode}`,
        },
      }),
      sendExpoOrderShippedNotification(orderData, trackingInfo),
    ]);

    console.log(
      `Order shipped notifications sent for order ${orderData.orderCode}:`,
      { fcm: fcmResult, expo: expoResult }
    );

    // Return success if at least one notification was sent successfully
    const fcmSuccess =
      fcmResult.status === "fulfilled" && fcmResult.value.success;
    const expoSuccess =
      expoResult.status === "fulfilled" && expoResult.value.success;

    return {
      success: fcmSuccess || expoSuccess,
      fcm: fcmResult,
      expo: expoResult,
    };
  } catch (error) {
    console.error("Error sending order shipped notification:", error);
    return { success: false, error: (error as Error).message };
  }
};

/**
 * Send notification when order is delivered
 */
export const sendOrderDeliveredNotification = async (orderData: OrderData) => {
  try {
    // Send both FCM and Expo notifications
    const [fcmResult, expoResult] = await Promise.allSettled([
      notificationService.sendOrderNotification({
        userId: orderData.userId,
        orderId: orderData._id,
        orderCode: orderData.orderCode,
        type: "order_delivered",
        title: "✅ Đơn hàng đã được giao!",
        body: `Đơn hàng #${orderData.orderCode} đã được giao thành công. Cảm ơn bạn đã mua sắm tại Ryxel Store! Đừng quên đánh giá sản phẩm nhé.`,
        data: {
          orderCode: orderData.orderCode,
          clickAction: `/account/orders/${orderData.orderCode}`,
          showReviewPrompt: true,
        },
      }),
      sendExpoOrderDeliveredNotification(orderData),
    ]);

    console.log(
      `Order delivered notifications sent for order ${orderData.orderCode}:`,
      { fcm: fcmResult, expo: expoResult }
    );

    // Return success if at least one notification was sent successfully
    const fcmSuccess =
      fcmResult.status === "fulfilled" && fcmResult.value.success;
    const expoSuccess =
      expoResult.status === "fulfilled" && expoResult.value.success;

    return {
      success: fcmSuccess || expoSuccess,
      fcm: fcmResult,
      expo: expoResult,
    };
  } catch (error) {
    console.error("Error sending order delivered notification:", error);
    return { success: false, error: (error as Error).message };
  }
};

/**
 * Send notification when order is cancelled
 */
export const sendOrderCancelledNotification = async (
  orderData: OrderData,
  reason?: string,
  refundInfo?: { amount: number; method: string; timeline: string }
) => {
  try {
    let body = `Đơn hàng #${orderData.orderCode} đã được hủy.`;

    if (reason) {
      body += ` Lý do: ${reason}`;
    }

    if (refundInfo) {
      body += ` Số tiền ${formatCurrency(refundInfo.amount)} sẽ được hoàn lại qua ${refundInfo.method} trong vòng ${refundInfo.timeline}.`;
    }

    // Send both FCM and Expo notifications
    const [fcmResult, expoResult] = await Promise.allSettled([
      notificationService.sendOrderNotification({
        userId: orderData.userId,
        orderId: orderData._id,
        orderCode: orderData.orderCode,
        type: "order_cancelled",
        title: "❌ Đơn hàng đã bị hủy",
        body,
        data: {
          orderCode: orderData.orderCode,
          reason,
          refundInfo,
          clickAction: `/account/orders/${orderData.orderCode}`,
        },
      }),
      sendExpoOrderCancelledNotification(orderData, reason, refundInfo),
    ]);

    console.log(
      `Order cancelled notifications sent for order ${orderData.orderCode}:`,
      { fcm: fcmResult, expo: expoResult }
    );

    // Return success if at least one notification was sent successfully
    const fcmSuccess =
      fcmResult.status === "fulfilled" && fcmResult.value.success;
    const expoSuccess =
      expoResult.status === "fulfilled" && expoResult.value.success;

    return {
      success: fcmSuccess || expoSuccess,
      fcm: fcmResult,
      expo: expoResult,
    };
  } catch (error) {
    console.error("Error sending order cancelled notification:", error);
    return { success: false, error: (error as Error).message };
  }
};

/**
 * Send promotional notification
 */
export const sendPromotionalNotification = async (
  userIds: (string | Types.ObjectId)[] | "all",
  title: string,
  body: string,
  data?: Record<string, any>,
  imageUrl?: string
) => {
  try {
    const payload = { title, body, data, imageUrl };

    // Send both FCM and Expo notifications
    const [fcmResult, expoResult] = await Promise.allSettled([
      userIds === "all"
        ? notificationService.sendToAllUsers(payload, "promotion")
        : notificationService.sendToMultipleUsers(
            userIds,
            payload,
            "promotion"
          ),
      sendExpoPromotionalNotification(userIds, title, body, data),
    ]);

    console.log(`Promotional notifications sent:`, {
      fcm: fcmResult,
      expo: expoResult,
    });

    // Return success if at least one notification was sent successfully
    const fcmSuccess =
      fcmResult.status === "fulfilled" && fcmResult.value.success;
    const expoSuccess =
      expoResult.status === "fulfilled" && expoResult.value.success;

    return {
      success: fcmSuccess || expoSuccess,
      fcm: fcmResult,
      expo: expoResult,
    };
  } catch (error) {
    console.error("Error sending promotional notification:", error);
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
) {
  const messages: Record<
    string,
    { title: string; body: string; type: string }
  > = {
    confirmed: {
      title: "✅ Đơn hàng đã được xác nhận!",
      body: `Đơn hàng #${orderCode} đã được xác nhận và đang được chuẩn bị. ${
        adminNotes || "Chúng tôi sẽ sớm giao hàng cho bạn."
      }`,
      type: "order_status_updated",
    },
    preparing: {
      title: "📦 Đang chuẩn bị đơn hàng",
      body: `Đơn hàng #${orderCode} đang được chuẩn bị. ${
        adminNotes || "Chúng tôi đang đóng gói sản phẩm cho bạn."
      }`,
      type: "order_status_updated",
    },
    ready_to_ship: {
      title: "🚀 Đơn hàng sẵn sàng giao",
      body: `Đơn hàng #${orderCode} đã được chuẩn bị xong và sẵn sàng giao. ${
        adminNotes || "Đơn hàng sẽ sớm được giao cho đối tác vận chuyển."
      }`,
      type: "order_status_updated",
    },
    shipping: {
      title: "🚚 Đơn hàng đang được giao!",
      body: `Đơn hàng #${orderCode} đang trên đường đến bạn. ${
        adminNotes || "Vui lòng chú ý điện thoại để nhận hàng."
      }`,
      type: "order_shipped",
    },
    delivered: {
      title: "✅ Đơn hàng đã được giao!",
      body: `Đơn hàng #${orderCode} đã được giao thành công. ${
        adminNotes || "Cảm ơn bạn đã mua sắm tại Ryxel Store!"
      }`,
      type: "order_delivered",
    },
    cancelled: {
      title: "❌ Đơn hàng đã bị hủy",
      body: `Đơn hàng #${orderCode} đã được hủy. ${
        adminNotes || "Vui lòng liên hệ với chúng tôi nếu có thắc mắc."
      }`,
      type: "order_cancelled",
    },
    refunded: {
      title: "💰 Đơn hàng đã được hoàn tiền",
      body: `Đơn hàng #${orderCode} đã được hoàn tiền. ${
        adminNotes ||
        "Số tiền sẽ được chuyển về tài khoản của bạn trong vài ngày làm việc."
      }`,
      type: "order_status_updated",
    },
  };

  return (
    messages[status] || {
      title: "📱 Cập nhật đơn hàng",
      body: `Đơn hàng #${orderCode} đã được cập nhật trạng thái thành "${status}". ${
        adminNotes || ""
      }`,
      type: "order_status_updated",
    }
  );
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

export { notificationService as FirebaseNotificationService };
