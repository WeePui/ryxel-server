import { Request, Response, NextFunction } from 'express';
import catchAsync from '../utils/catchAsync';
import stripe from 'stripe';
import AppError from '../utils/AppError';
import { getLineItemsInfo } from '../utils/getLineItemsInfo';
import moment from 'moment';
import CryptoJS from 'crypto-js';
import axios from 'axios';
import { changeOrderStatus } from './orderController';
import { clearCart } from './cartController';

const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY as string, {
  typescript: true,
});

const zalopayConfig = {
  app_id: '2553',
  key1: 'PcY4iZIKFCIdgZvA6ueMcMHHUbRLYjPL',
  key2: 'kLtgPl8HHhfvMuDHPwKfgfsY4Ydm9eIz',
  endpoint: 'https://sb-openapi.zalopay.vn/v2/create',
};

export const createStripeCheckoutSession = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { _id: orderId, lineItems } = req.body;

    if (!lineItems) {
      return next(new AppError('No line items provided', 400));
    }

    try {
      const items = await getLineItemsInfo(lineItems);

      const stripeLineItems = items.map((item) => {
        return {
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
        client_reference_id: req.user.id,
        metadata: {
          order_id: orderId,
        },
        line_items: stripeLineItems,
        mode: 'payment',
        success_url: `http://localhost:3000/account/orders/${orderId}`,
      });

      res.status(200).json({
        status: 'success',
        session,
      });
    } catch (error) {
      return next(new AppError((error as Error).message, 400));
    }
  }
);

export const createZaloPayCheckoutSession = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { _id: orderId, lineItems } = req.body;

    if (!lineItems) {
      return next(new AppError('No line items provided', 400));
    }

    try {
      const items = await getLineItemsInfo(lineItems);

      const zaloItems = items.map((item) => {
        return {
          itemid: item.variant._id.toString(),
          itemname: item.variant.name,
          itemprice: item.variant.price,
          itemquantity: item.quantity,
        };
      });

      const embed_data = {
        redirecturl: `http://localhost:3000/account/orders/${orderId}`,
        orderId,
        userId: req.user.id,
      };
      const transId = Math.floor(Date.now() / 1000); // TODO: replace with your unique transaction ID

      const order = {
        app_id: zalopayConfig.app_id,
        app_trans_id: `${moment().format('YYMMDD')}_${transId}`,
        app_user: req.user.email,
        app_time: Date.now(),
        item: JSON.stringify(zaloItems),
        amount: zaloItems.reduce(
          (total, item) => total + item.itemprice * item.itemquantity,
          0
        ), // TODO: replace with your total amount
        description: 'Thanh toán đơn hàng từ cửa hàng Ryxel Store.',
        bank_code: '',
        embed_data: JSON.stringify(embed_data),
        mac: '',
        callback_url:
          'https://f85f-2402-800-63a8-d7c1-689e-9879-df9b-953b.ngrok-free.app/api/v1/payments/zalopay/callback',
      };

      const data =
        zalopayConfig.app_id +
        '|' +
        order.app_trans_id +
        '|' +
        order.app_user +
        '|' +
        order.amount +
        '|' +
        order.app_time +
        '|' +
        order.embed_data +
        '|' +
        order.item;
      order.mac = CryptoJS.HmacSHA256(data, zalopayConfig.key1).toString();

      axios
        .post(zalopayConfig.endpoint, null, { params: order })
        .then((response) => {
          if (response.data.return_code !== 1) {
            return next(new AppError(response.data.return_message, 400));
          }

          res.status(200).json({
            status: 'success',
            data: response.data,
          });
        })
        .catch((err) => next(new AppError((err as Error).message, 400)));
    } catch (error) {
      return next(new AppError((error as Error).message, 400));
    }
  }
);

export const zalopayCallback = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const dataStr = req.body.data;
    const reqMac = req.body.mac;
    const mac = CryptoJS.HmacSHA256(dataStr, zalopayConfig.key2).toString();

    if (mac !== reqMac) {
      return next(new AppError('Invalid MAC', 400));
    } else {
      const data = JSON.parse(dataStr);
      console.log(data);
      const { orderId, userId } = JSON.parse(data.embed_data);
      console.log(orderId);
      await changeOrderStatus(orderId, 'pending');
      await clearCart(userId);
    }

    res.status(200).json({
      status: 'success',
      message: 'Payment successful',
    });
  }
);

export const fulfillCheckout = async (sessionId: string) => {
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

  // Check the Checkout Session's payment_status property
  // to determine if fulfillment should be peformed
  if (checkoutSession.payment_status !== 'unpaid') {
    // TODO: Perform fulfillment of the line items
    await changeOrderStatus(checkoutSession!.metadata!.order_id, 'pending');
    await clearCart(checkoutSession.client_reference_id as string);
    // TODO: Record/save fulfillment status for this
    // Checkout Session
  }
};
