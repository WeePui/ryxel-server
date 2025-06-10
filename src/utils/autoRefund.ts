import Order from "../models/orderModel";
import { refundStripePayment, refundZaloPayPayment } from "../controllers/paymentController";
import sendEmail from "./email";

export interface DuplicatePaymentRefund {
  orderId: string;
  orderCode: string;
  userId: string;
  duplicatePaymentId: string;
  refundAmount: number;
  refundMethod: "stripe" | "zalopay";
  refundStatus: "pending" | "success" | "failed";
  timestamp: Date;
}

// Automatic duplicate payment detection and refund
export const autoRefundDuplicatePayments = async () => {
  try {
    console.log("🔍 Scanning for duplicate payments to auto-refund...");

    // Find orders with duplicate payment IDs
    const duplicatePayments = await Order.aggregate([
      {
        $match: {
          "checkout.paymentId": { $exists: true },
          status: { $in: ["pending", "processing", "shipped", "delivered"] },
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
        }
      },
      {
        $group: {
          _id: "$checkout.paymentId",
          count: { $sum: 1 },
          orders: { $push: "$$ROOT" }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    const refundResults: DuplicatePaymentRefund[] = [];

    for (const duplicateGroup of duplicatePayments) {
      const orders = duplicateGroup.orders;
      
      // Keep the first order (earliest created), refund others
      const ordersToRefund = orders.slice(1);

      for (const orderToRefund of ordersToRefund) {
        console.log(`🔄 Processing automatic refund for duplicate order: ${orderToRefund.orderCode}`);

        try {
          const refundResult: DuplicatePaymentRefund = {
            orderId: orderToRefund._id.toString(),
            orderCode: orderToRefund.orderCode,
            userId: orderToRefund.user.toString(),
            duplicatePaymentId: orderToRefund.checkout.paymentId,
            refundAmount: orderToRefund.checkout.amount,
            refundMethod: orderToRefund.paymentMethod,
            refundStatus: "pending",
            timestamp: new Date()
          };

          // Process refund based on payment method
          if (orderToRefund.paymentMethod === "stripe") {
            await refundStripePayment(
              orderToRefund.checkout.paymentId,
              orderToRefund.checkout.amount
            );
          } else if (orderToRefund.paymentMethod === "zalopay") {
            await refundZaloPayPayment(
              orderToRefund.checkout.paymentId,
              orderToRefund.checkout.amount
            );
          }

          // Update order status
          await Order.findByIdAndUpdate(orderToRefund._id, {
            status: "refunded",
            adminNotes: `Automatically refunded - duplicate payment detected for payment ID: ${orderToRefund.checkout.paymentId}`
          });

          refundResult.refundStatus = "success";
          refundResults.push(refundResult);

          console.log(`✅ Successfully auto-refunded duplicate order: ${orderToRefund.orderCode}`);

          // Send email notification to user
          await sendDuplicatePaymentRefundEmail(orderToRefund, refundResult);

          // Send admin notification
          await sendAdminDuplicateRefundAlert(orderToRefund, refundResult);

        } catch (error) {
          console.error(`❌ Failed to auto-refund order ${orderToRefund.orderCode}:`, error);
          
          const failedRefund: DuplicatePaymentRefund = {
            orderId: orderToRefund._id.toString(),
            orderCode: orderToRefund.orderCode,
            userId: orderToRefund.user.toString(),
            duplicatePaymentId: orderToRefund.checkout.paymentId,
            refundAmount: orderToRefund.checkout.amount,
            refundMethod: orderToRefund.paymentMethod,
            refundStatus: "failed",
            timestamp: new Date()
          };
          
          refundResults.push(failedRefund);

          // Alert admin about failed auto-refund
          await sendAdminRefundFailureAlert(orderToRefund, error as Error);
        }
      }
    }

    if (refundResults.length > 0) {
      console.log(`🎯 Auto-refund summary: ${refundResults.length} refunds processed`);
      console.log(`✅ Successful: ${refundResults.filter(r => r.refundStatus === "success").length}`);
      console.log(`❌ Failed: ${refundResults.filter(r => r.refundStatus === "failed").length}`);
    } else {
      console.log("✨ No duplicate payments found - all systems clean!");
    }

    return refundResults;

  } catch (error) {
    console.error("💥 Error in auto-refund process:", error);
    
    // Alert admin about system failure
    await sendAdminSystemAlert("Auto-refund system failure", error as Error);
    
    throw error;
  }
};

// Send email to user about automatic refund
const sendDuplicatePaymentRefundEmail = async (order: any, refundResult: DuplicatePaymentRefund) => {
  const subject = `🔄 Automatic Refund Processed - Order #${order.orderCode}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4CAF50;">Automatic Refund Notification</h2>
      
      <p>Dear Customer,</p>
      
      <p>We detected a duplicate payment for your order and have automatically processed a refund for you.</p>
      
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3>Refund Details:</h3>
        <ul>
          <li><strong>Order Code:</strong> ${order.orderCode}</li>
          <li><strong>Refund Amount:</strong> ${(refundResult.refundAmount).toLocaleString('vi-VN')} VND</li>
          <li><strong>Payment Method:</strong> ${refundResult.refundMethod.toUpperCase()}</li>
          <li><strong>Refund Date:</strong> ${refundResult.timestamp.toLocaleDateString('vi-VN')}</li>
        </ul>
      </div>
      
      <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h4 style="color: #1976d2; margin: 0 0 10px 0;">What happened?</h4>
        <p style="margin: 0;">Our system detected that you were charged multiple times for the same order. We automatically processed a refund for the duplicate charge to ensure you only pay once.</p>
      </div>
      
      <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h4 style="color: #f57c00; margin: 0 0 10px 0;">Refund Timeline:</h4>
        <ul style="margin: 0;">
          ${refundResult.refundMethod === 'stripe' ? 
            '<li>Stripe refunds typically appear in 5-10 business days</li>' :
            '<li>ZaloPay refunds typically appear in 3-7 business days</li>'
          }
          <li>You will receive a separate notification from your payment provider</li>
        </ul>
      </div>
      
      <p>Your original order remains active and will be processed normally. No action is required from you.</p>
      
      <p>If you have any questions, please contact our customer support.</p>
      
      <p>Best regards,<br>Ryxel Store Team</p>
    </div>
  `;

  try {    await sendEmail({
      to: order.user.email,
      subject,
      html
    });
  } catch (error) {
    console.error("Failed to send refund email:", error);
  }
};

// Send admin alert about auto-refund
const sendAdminDuplicateRefundAlert = async (order: any, refundResult: DuplicatePaymentRefund) => {
  const subject = `🤖 Auto-Refund Processed - ${order.orderCode}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif;">
      <h2>Automatic Duplicate Payment Refund</h2>
      
      <p>The system automatically detected and processed a duplicate payment refund:</p>
      
      <ul>
        <li><strong>Order:</strong> ${order.orderCode}</li>
        <li><strong>User:</strong> ${order.user.email}</li>
        <li><strong>Payment ID:</strong> ${refundResult.duplicatePaymentId}</li>
        <li><strong>Refund Amount:</strong> ${refundResult.refundAmount.toLocaleString('vi-VN')} VND</li>
        <li><strong>Method:</strong> ${refundResult.refundMethod.toUpperCase()}</li>
        <li><strong>Status:</strong> ✅ SUCCESS</li>
      </ul>
      
      <p>No manual intervention required.</p>
    </div>
  `;
  try {
    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'admin@ryxel.com',
      subject,
      html
    });
  } catch (error) {
    console.error("Failed to send admin alert:", error);
  }
};

// Send admin alert about failed auto-refund
const sendAdminRefundFailureAlert = async (order: any, error: Error) => {
  const subject = `🚨 AUTO-REFUND FAILED - ${order.orderCode}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif;">
      <h2 style="color: #f44336;">Automatic Refund Failed</h2>
      
      <p><strong>MANUAL INTERVENTION REQUIRED</strong></p>
      
      <p>Failed to automatically refund duplicate payment:</p>
      
      <ul>
        <li><strong>Order:</strong> ${order.orderCode}</li>
        <li><strong>User:</strong> ${order.user.email}</li>
        <li><strong>Payment ID:</strong> ${order.checkout.paymentId}</li>
        <li><strong>Amount:</strong> ${order.checkout.amount.toLocaleString('vi-VN')} VND</li>
        <li><strong>Method:</strong> ${order.paymentMethod.toUpperCase()}</li>
      </ul>
      
      <div style="background: #ffebee; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h4 style="color: #f44336;">Error Details:</h4>
        <pre style="background: #fff; padding: 10px; border-radius: 4px; overflow-x: auto;">${error.message}</pre>
      </div>
      
      <p><strong>Action Required:</strong> Please manually process refund in admin panel.</p>
    </div>
  `;
  try {
    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'admin@ryxel.com',
      subject,
      html
    });
  } catch (error) {
    console.error("Failed to send failure alert:", error);
  }
};

// Send admin alert about system failure
const sendAdminSystemAlert = async (title: string, error: Error) => {
  const subject = `🚨 SYSTEM ALERT: ${title}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif;">
      <h2 style="color: #f44336;">System Alert</h2>
      
      <p><strong>Critical Issue:</strong> ${title}</p>
      
      <div style="background: #ffebee; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h4 style="color: #f44336;">Error Details:</h4>
        <pre style="background: #fff; padding: 10px; border-radius: 4px; overflow-x: auto;">${error.message}</pre>
        <pre style="background: #fff; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px;">${error.stack}</pre>
      </div>
      
      <p><strong>Action Required:</strong> Please investigate and resolve immediately.</p>
    </div>
  `;
  try {
    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'admin@ryxel.com',
      subject,
      html
    });
  } catch (error) {
    console.error("Failed to send system alert:", error);
  }
};

// Schedule auto-refund to run every 6 hours
export const startAutoRefundScheduler = () => {
  setInterval(() => {
    autoRefundDuplicatePayments();
  }, 6 * 60 * 60 * 1000); // Every 6 hours
  
  console.log("Auto-refund scheduler started - will run every 6 hours");
};
