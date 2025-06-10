import Order from "../models/orderModel";
import { fulfillCheckout } from "../controllers/paymentController";
import stripe from "stripe";

const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY as string, {
  typescript: true,
});

// Webhook processing with retry mechanism
export const processStripeWebhookWithRetry = async (sessionId: string, maxRetries = 3) => {
  let attempts = 0;
  
  while (attempts < maxRetries) {
    try {
      await fulfillCheckout(sessionId);
      console.log(`Successfully processed webhook for session ${sessionId} on attempt ${attempts + 1}`);
      return;
    } catch (error) {
      attempts++;
      console.error(`Webhook processing failed for session ${sessionId}, attempt ${attempts}:`, error);
      
      if (attempts >= maxRetries) {
        console.error(`Max retries reached for session ${sessionId}, manual intervention required`);
        // Log to database or alerting system for manual review
        await logFailedWebhook(sessionId, error as Error);
        throw error;
      }
      
      // Exponential backoff: wait 2^attempt seconds
      const waitTime = Math.pow(2, attempts) * 1000;
      console.log(`Retrying webhook processing for session ${sessionId} in ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
};

// Log failed webhooks for manual review
const logFailedWebhook = async (sessionId: string, error: Error) => {
  try {
    // You could save this to a separate collection for failed webhooks
    console.error(`FAILED WEBHOOK - Session: ${sessionId}, Error: ${error.message}, Stack: ${error.stack}`);
    
    // Optional: Send alert to monitoring system
    // await sendSlackAlert(`Failed webhook processing for session ${sessionId}: ${error.message}`);
  } catch (logError) {
    console.error("Error logging failed webhook:", logError);
  }
};

// Check for unprocessed successful payments and attempt to process them
export const checkUnprocessedPayments = async () => {
  try {
    console.log("Checking for unprocessed successful payments...");
    
    // Find orders that are still unpaid but might have successful payments
    const unpaidOrders = await Order.find({
      status: "unpaid",
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours only
    });

    for (const order of unpaidOrders) {
      try {
        // Check if there's a successful payment for this order in Stripe
        const sessions = await stripeClient.checkout.sessions.list({
          limit: 100,
        });

        const matchingSession = sessions.data.find(
          session => session.metadata?.order_id === order.orderCode && 
                    session.payment_status === "paid"
        );

        if (matchingSession) {
          console.log(`Found unprocessed successful payment for order ${order.orderCode}, processing...`);
          await fulfillCheckout(matchingSession.id);
        }
      } catch (error) {
        console.error(`Error checking payment for order ${order.orderCode}:`, error);
      }
    }
  } catch (error) {
    console.error("Error in checkUnprocessedPayments:", error);
  }
};

// Recovery mechanism for webhook failures
export const startPaymentRecoveryCheck = () => {
  // Run every 2 hours to check for unprocessed payments
  setInterval(() => {
    checkUnprocessedPayments();
  }, 2 * 60 * 60 * 1000);
  
  console.log("Payment recovery check started - will run every 2 hours");
};
