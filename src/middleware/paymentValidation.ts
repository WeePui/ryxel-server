import { Request, Response, NextFunction } from "express";
import Order from "../models/orderModel";
import AppError from "../utils/AppError";

// Middleware to validate payment requests and prevent double charging
export const validatePaymentRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { orderCode } = req.body;
    
    if (!orderCode) {
      return next(new AppError("Order code is required", 400));
    }

    // Find the order
    const order = await Order.findOne({ orderCode });
    if (!order) {
      return next(new AppError("Order not found", 404));
    }

    // Check if order belongs to the user (unless admin)
    if (req.user.role !== "admin" && order.user.toString() !== req.user.id) {
      return next(new AppError("You can only pay for your own orders", 403));
    }

    // Validate order status
    if (order.status !== "unpaid") {
      return next(new AppError(`Order is already ${order.status} and cannot be paid again`, 400));
    }

    // Check if order already has a payment session in progress
    if (order.checkout && order.checkout.checkoutId) {
      // Check if this checkout session was created recently (within last 10 minutes)
      const recentThreshold = new Date(Date.now() - 10 * 60 * 1000);
      if (order.updatedAt > recentThreshold) {
        return next(new AppError("A payment session is already in progress for this order. Please wait or use the existing session.", 429));
      }
    }

    // Check for any other unpaid orders by this user (double protection)
    const otherUnpaidOrders = await Order.find({
      user: req.user.id,
      status: "unpaid",
      _id: { $ne: order._id }
    });

    if (otherUnpaidOrders.length > 0) {
      return next(new AppError("You have other unpaid orders. Please complete or cancel them first.", 400));
    }

    // Add order to request for use in controller
    req.order = order;
    next();
  } catch (error) {
    console.error("Error in payment validation middleware:", error);
    return next(new AppError("Payment validation failed", 500));
  }
};

// Rate limiting for payment requests
export const paymentRateLimit = (() => {
  const attempts = new Map<string, { count: number; lastAttempt: Date }>();
  const MAX_ATTEMPTS = 3;
  const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.user.id}:${req.body.orderCode}`;
    const now = new Date();
    const userAttempts = attempts.get(key);

    if (userAttempts) {
      const timeSinceLastAttempt = now.getTime() - userAttempts.lastAttempt.getTime();
      
      if (timeSinceLastAttempt < WINDOW_MS) {
        if (userAttempts.count >= MAX_ATTEMPTS) {
          return next(new AppError("Too many payment attempts. Please wait 5 minutes before trying again.", 429));
        }
        userAttempts.count++;
      } else {
        userAttempts.count = 1;
      }
      userAttempts.lastAttempt = now;
    } else {
      attempts.set(key, { count: 1, lastAttempt: now });
    }

    // Clean up old entries every 10 minutes
    if (Math.random() < 0.01) { // 1% chance to clean up
      const cutoff = new Date(now.getTime() - WINDOW_MS);
      for (const [key, data] of attempts.entries()) {
        if (data.lastAttempt < cutoff) {
          attempts.delete(key);
        }
      }
    }

    next();
  };
})();

// Declare order property on Request interface
declare global {
  namespace Express {
    interface Request {
      order?: any;
    }
  }
}
