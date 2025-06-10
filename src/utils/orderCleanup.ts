import Order from "../models/orderModel";
import cron from "node-cron";

// Clean up old unpaid orders automatically
export const cleanupOldUnpaidOrders = async () => {
  try {
    // Find unpaid orders older than 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const oldUnpaidOrders = await Order.find({
      status: "unpaid",
      createdAt: { $lt: twentyFourHoursAgo },
    });

    if (oldUnpaidOrders.length > 0) {
      console.log(`Found ${oldUnpaidOrders.length} old unpaid orders, cancelling them`);
      
      // Update all old unpaid orders to cancelled
      await Order.updateMany(
        {
          status: "unpaid",
          createdAt: { $lt: twentyFourHoursAgo },
        },
        {
          status: "cancelled",
        }
      );

      console.log(`Successfully cancelled ${oldUnpaidOrders.length} old unpaid orders`);
    }
  } catch (error) {
    console.error("Error in scheduled cleanup of old unpaid orders:", error);
  }
};

// Schedule the cleanup to run every 2 hours
export const startOrderCleanupScheduler = () => {
  // Run every 2 hours at minute 0
  cron.schedule('0 */2 * * *', () => {
    console.log('Running scheduled cleanup of old unpaid orders...');
    cleanupOldUnpaidOrders();
  });
  
  console.log('Order cleanup scheduler started - will run every 2 hours');
};
