import Order from "../models/orderModel";
import sendEmail from "./email";
import { sendOrderStatusUpdatedNotification } from "./notificationHelpers";

export interface OrderStatusAlert {
  orderId: string;
  orderCode: string;
  userId: string;
  issue: string;
  severity: "low" | "medium" | "high" | "critical";
  timestamp: Date;
}

// Send notification to user about stale unpaid order
const sendStaleOrderNotification = async (order: any) => {
  try {
    await sendOrderStatusUpdatedNotification(
      {
        _id: order._id.toString(),
        userId: order.user.toString(),
        orderCode: order.orderCode,
        status: order.status,
        totalAmount: order.total,
      },
      order.status,
      order.status,
      "⏰ Your order payment is still pending. Please complete payment to avoid cancellation. Our system is monitoring your payment status."
    );

    console.log(
      `📱 Sent stale order notification to user for order: ${order.orderCode}`
    );
  } catch (error) {
    console.error(
      `Failed to send stale order notification for ${order.orderCode}:`,
      error
    );
  }
};

export interface OrderStatusAlert {
  orderId: string;
  orderCode: string;
  userId: string;
  issue: string;
  severity: "low" | "medium" | "high" | "critical";
  timestamp: Date;
}

// Monitor for potential payment issues
export const monitorOrderStatus = async () => {
  try {
    console.log("Running order status monitoring...");

    const alerts: OrderStatusAlert[] = [];

    // Check for orders that have been unpaid for more than 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const staleUnpaidOrders = await Order.find({
      status: "unpaid",
      createdAt: {
        $lt: twoHoursAgo,
        $gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });
    for (const order of staleUnpaidOrders) {
      alerts.push({
        orderId: order._id.toString(),
        orderCode: order.orderCode,
        userId: order.user.toString(),
        issue: `Order has been unpaid for more than 2 hours`,
        severity: "medium",
        timestamp: new Date(),
      });

      // Send user notification about stale unpaid order
      await sendStaleOrderNotification(order);
    }

    // Check for orders with duplicate payment attempts
    const duplicatePaymentOrders = await Order.aggregate([
      {
        $match: {
          "checkout.paymentId": { $exists: true },
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id: "$checkout.paymentId",
          orders: {
            $push: { _id: "$_id", orderCode: "$orderCode", user: "$user" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $match: { count: { $gt: 1 } },
      },
    ]);

    for (const duplicate of duplicatePaymentOrders) {
      for (const order of duplicate.orders) {
        alerts.push({
          orderId: order._id.toString(),
          orderCode: order.orderCode,
          userId: order.user.toString(),
          issue: `Duplicate payment ID detected: ${duplicate._id}`,
          severity: "critical",
          timestamp: new Date(),
        });
      }
    }

    // Check for orders stuck in processing for too long (more than 48 hours)
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const stuckProcessingOrders = await Order.find({
      status: "processing",
      updatedAt: { $lt: fortyEightHoursAgo },
    });

    for (const order of stuckProcessingOrders) {
      alerts.push({
        orderId: order._id.toString(),
        orderCode: order.orderCode,
        userId: order.user.toString(),
        issue: `Order stuck in processing status for more than 48 hours`,
        severity: "high",
        timestamp: new Date(),
      });
    }

    // Log and handle alerts
    if (alerts.length > 0) {
      console.log(`Found ${alerts.length} order status alerts`);
      await handleOrderAlerts(alerts);
    } else {
      console.log("No order status issues detected");
    }
  } catch (error) {
    console.error("Error in order status monitoring:", error);
  }
};

// Handle alerts based on severity
const handleOrderAlerts = async (alerts: OrderStatusAlert[]) => {
  try {
    // Group alerts by severity
    const criticalAlerts = alerts.filter((a) => a.severity === "critical");
    const highAlerts = alerts.filter((a) => a.severity === "high");
    const mediumAlerts = alerts.filter((a) => a.severity === "medium");

    // Send immediate notifications for critical issues
    if (criticalAlerts.length > 0) {
      await sendCriticalOrderAlert(criticalAlerts);
    }

    // Log all alerts
    for (const alert of alerts) {
      console.log(
        `[${alert.severity.toUpperCase()}] Order ${alert.orderCode}: ${alert.issue}`
      );
    }

    // Save alerts to database for tracking (optional)
    // await saveAlertsToDatabase(alerts);
  } catch (error) {
    console.error("Error handling order alerts:", error);
  }
};

// Send critical alerts via email or monitoring system
const sendCriticalOrderAlert = async (alerts: OrderStatusAlert[]) => {
  try {
    const alertContent = alerts
      .map(
        (alert) =>
          `Order: ${alert.orderCode}\nIssue: ${alert.issue}\nTime: ${alert.timestamp}\n---`
      )
      .join("\n");    // Send to admin email
    await sendEmail({
      to: process.env.ADMIN_EMAIL || "admin@ryxel.com",
      subject: `🚨 CRITICAL Order Alert - ${alerts.length} Issues Detected`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">🚨 Critical Order Alert</h2>
          <p><strong>${alerts.length} critical order issues detected:</strong></p>
          <div style="background: #fef2f2; padding: 15px; border-radius: 8px; border-left: 4px solid #dc2626;">
            <pre style="white-space: pre-wrap; font-family: monospace; margin: 0;">${alertContent}</pre>
          </div>
          <p><strong>Action Required:</strong> Please investigate these issues immediately.</p>
        </div>
      `,
    });

    console.log(`Sent critical alert email for ${alerts.length} issues`);
  } catch (error) {
    console.error("Error sending critical order alert:", error);
  }
};

// Start monitoring with scheduled intervals
export const startOrderStatusMonitoring = () => {
  // Run every 30 minutes
  setInterval(
    () => {
      monitorOrderStatus();
    },
    30 * 60 * 1000
  );

  // Run immediately on startup
  setTimeout(() => {
    monitorOrderStatus();
  }, 5000); // Wait 5 seconds after startup

  console.log("Order status monitoring started - will run every 30 minutes");
};
