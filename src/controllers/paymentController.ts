import { Request, Response, NextFunction } from 'express';
import catchAsync from '../utils/catchAsync';
import stripe from 'stripe';
import Cart from '../models/cartModel';
import AppError from '../utils/AppError';

const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY as string);

export const createCheckoutSession = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const cart = await Cart.findOne({ user: req.user.id }).populate({
      path: 'products.product',
      populate: {
        path: 'variants',
        model: 'Variant',
      },
    });

    if (!cart || cart.products.length === 0) {
      return next(new AppError('No products in cart', 404));
    }

    const items = cart.products
      .map((item: any) => {
        const variant = item.product.variants.find(
          (variant: any) => variant._id.toString() === item.variant.toString()
        );

        if (!variant) {
          return next(new AppError('Variant not found', 404));
        }

        variant.name = item.product.name + ' - ' + variant.name;

        return { variant, quantity: item.quantity };
      })
      .filter((item) => item !== undefined);

    const lineItems = items.map((item) => {
      return {
        client_reference_id: req.user.id,
        metadata: [{ key: 'variant', value: item.variant._id }],
        price_data: {
          currency: 'vnd',
          product_data: {
            name: item.variant.name,
            images: [
              'https://images.unsplash.com/photo-1721332153370-56d7cc352d63?q=80&w=1935&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDF8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
            ],
          },
          unit_amount: item.variant.price,
        },
        quantity: item.quantity,
      };
    });

    const session = await stripeClient.checkout.sessions.create({
      line_items: lineItems,
      mode: 'payment',
      success_url: `http://localhost:3000`,
    });

    res.status(200).json({
      status: 'success',
      session,
    });
  }
);

export const fulfillCheckout = async (sessionId: string) => {
  console.log('Fulfilling Checkout Session ' + sessionId);

  // TODO: Make this function safe to run multiple times,
  // even concurrently, with the same session ID

  // TODO: Make sure fulfillment hasn't already been
  // peformed for this Checkout Session

  // Retrieve the Checkout Session from the API with line_items expanded
  const checkoutSession = await stripeClient.checkout.sessions.retrieve(
    sessionId,
    {
      expand: ['line_items'],
    }
  );

  console.log(checkoutSession);

  // Check the Checkout Session's payment_status property
  // to determine if fulfillment should be peformed
  if (checkoutSession.payment_status !== 'unpaid') {
    // TODO: Perform fulfillment of the line items
    // TODO: Record/save fulfillment status for this
    // Checkout Session
  }
};
