import e, { Request, Response, NextFunction } from 'express';
import catchAsync from '../utils/catchAsync';
import stripe from 'stripe';
import AppError from '../utils/AppError';
import { getLineItemsInfo } from '../utils/getLineItemsInfo';
import moment from 'moment';
import CryptoJS from 'crypto-js';
import axios from 'axios';
import { addPaymentId, changeOrderStatus } from './orderController';
import Cart from '../models/cartModel';
import Order from '../models/orderModel';
import { Types } from 'mongoose';

const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY as string, {
  typescript: true,
});

const zalopayConfig = {
  app_id: '2553',
  key1: 'PcY4iZIKFCIdgZvA6ueMcMHHUbRLYjPL',
  key2: 'kLtgPl8HHhfvMuDHPwKfgfsY4Ydm9eIz',
  endpoint: 'https://sb-openapi.zalopay.vn/v2/create',
  refund_url: 'https://sb-openapi.zalopay.vn/v2/refund',
};

export const createStripeCheckoutSession = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { orderCode, lineItems } = req.body;
    const order = await Order.findOne({ orderCode });
    if (!order) {
      return next(new AppError('Order not found', 404));
    }

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
              images: [item.variant.images[0]],
            },
            unit_amount: item.variant.price,
          },
          quantity: item.quantity,
        };
      });

      let coupon: stripe.Response<stripe.Coupon> | undefined = undefined;

      if (order.discountAmount > 0) {
        try {
          // Kiểm tra xem coupon đã tồn tại chưa
          const existingCoupon = await stripeClient.coupons.retrieve(
            order.orderCode
          );

          coupon = existingCoupon;
        } catch (error) {
          // Tạo coupon với max_redemptions = 1
          coupon = await stripeClient.coupons.create({
            duration: 'forever',
            amount_off: order.discountAmount,
            currency: 'vnd',
            id: order.orderCode, // Đảm bảo id duy nhất
            max_redemptions: 1, // Chỉ có thể sử dụng một lần
          });
        }
      }

      if (order.shippingFee > 0) {
        stripeLineItems.push({
          price_data: {
            currency: 'vnd',
            product_data: { name: 'Phí vận chuyển', images: [] },
            unit_amount: order.shippingFee,
          },
          quantity: 1,
        });
      }

      const session = await stripeClient.checkout.sessions.create({
        client_reference_id: req.user.id,
        metadata: {
          order_id: order.orderCode,
          lineItems: JSON.stringify(
            lineItems.map((item: any) => {
              return {
                product:
                  typeof item.product === 'string'
                    ? item.product
                    : item.product._id,
                variant: item.variant,
                quantity: item.quantity,
              };
            })
          ),
        },
        discounts: coupon ? [{ coupon: coupon.id }] : [],
        line_items: stripeLineItems,
        mode: 'payment',
        success_url: `http://localhost:3000/account/orders/${order.orderCode}`,
      });

      res.status(200).json({
        status: 'success',
        session,
      });
    } catch (error) {
      console.error(error);
      return next(new AppError((error as Error).message, 400));
    }
  }
);

export const createZaloPayCheckoutSession = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { orderCode, lineItems } = req.body;
    const order = await Order.findOne({ orderCode });
    if (!order) {
      return next(new AppError('Order not found', 404));
    }

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

      if (order.discountAmount > 0) {
        zaloItems.push({
          itemid: 'discount',
          itemname: `Giảm giá`,
          itemprice: -order.discountAmount,
          itemquantity: 1,
        });
      }
      if (order.shippingFee > 0) {
        zaloItems.push({
          itemid: 'shipping',
          itemname: 'Phí vận chuyển',
          itemprice: order.shippingFee,
          itemquantity: 1,
        });
      }

      const totalAmount = zaloItems.reduce(
        (total, item) => total + item.itemprice * item.itemquantity,
        0
      );

      const embed_data = {
        redirecturl: `http://localhost:3000/account/orders/${order.orderCode}`,
        orderCode,
        userId: req.user.id,
      };

      const transId = Math.floor(Date.now() / 1000); // TODO: replace with your unique transaction ID

      const orderData = {
        app_id: zalopayConfig.app_id,
        app_trans_id: `${moment().format('YYMMDD')}_${transId}`,
        app_user: req.user.email,
        app_time: Date.now(),
        item: JSON.stringify(zaloItems),
        amount: totalAmount,
        description: 'Thanh toán đơn hàng từ cửa hàng Ryxel Store.',
        bank_code: '',
        embed_data: JSON.stringify(embed_data),
        mac: '',
        callback_url:
          'https://22d9-14-191-63-11.ngrok-free.app/api/v1/payments/zalopay/callback',
      };

      const data =
        zalopayConfig.app_id +
        '|' +
        orderData.app_trans_id +
        '|' +
        orderData.app_user +
        '|' +
        orderData.amount +
        '|' +
        orderData.app_time +
        '|' +
        orderData.embed_data +
        '|' +
        orderData.item;
      orderData.mac = CryptoJS.HmacSHA256(data, zalopayConfig.key1).toString();

      axios
        .post(zalopayConfig.endpoint, null, { params: orderData })
        .then((response) => {
          if (response.data.return_code !== 1) {
            return next(new AppError(response.data.return_message, 400));
          }

          res.status(200).json({
            status: 'success',
            data: response.data,
            orderCode: req.body.orderCode,
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
      const { orderCode, userId } = JSON.parse(data.embed_data);

      const order = await Order.findOne({ orderCode });
      if (!order) {
        return next(new AppError('Order not found', 404));
      }

      await addPaymentId((order._id as Types.ObjectId).toString(), {
        paymentId: data.zp_trans_id,
        checkoutId: data.app_trans_id,
        amount: data.amount,
      });

      await changeOrderStatus(
        (order._id as Types.ObjectId).toString(),
        'pending'
      );

      const cart = await Cart.findOne({ user: userId });

      if (cart?.lineItems && cart.lineItems.length > 0) {
        for (const item of order?.lineItems) {
          await cart.removeCartItem(item.product, item.variant);
        }
      }

      res.status(200).json({
        status: 'success',
        message: 'Payment successful',
      });
    }
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
    const order = await Order.findOne({
      orderCode: checkoutSession!.metadata!.order_id,
    });

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    await addPaymentId((order._id as Types.ObjectId).toString(), {
      paymentId: checkoutSession!.payment_intent as string,
      checkoutId: checkoutSession.id,
      amount: checkoutSession.amount_total!,
    });
    await changeOrderStatus(
      (order._id as Types.ObjectId).toString(),
      'pending'
    );
    const cart = await Cart.findOne({
      user: checkoutSession!.client_reference_id,
    });

    if (cart?.lineItems && cart.lineItems.length > 0) {
      for (const item of order?.lineItems) {
        await cart.removeCartItem(item.product, item.variant);
      }
    }
    // TODO: Record/save fulfillment status for this
    // Checkout Session
  }
};

export const refundStripePayment = async (
  paymentId: string,
  amount: number
) => {
  const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentId);

  if (paymentIntent.status === 'succeeded') {
    await stripeClient.refunds.create({
      payment_intent: paymentId,
      amount: amount,
    });
  } else {
    throw new AppError('Refund not successful', 400);
  }
};

export const refundZaloPayPayment = async (
  paymentId: string,
  amount: number
) => {
  const timestamp = Date.now();
  const uid = `${timestamp}${Math.floor(111 + Math.random() * 999)}`;

  let params = {
    app_id: zalopayConfig.app_id,
    m_refund_id: `${moment().format('YYMMDD')}_${zalopayConfig.app_id}_${uid}`,
    timestamp, // miliseconds
    zp_trans_id: paymentId,
    amount: amount,
    description: 'ZaloPay Refund',
    mac: '',
  };

  let data =
    params.app_id +
    '|' +
    params.zp_trans_id +
    '|' +
    params.amount +
    '|' +
    params.description +
    '|' +
    params.timestamp;
  params.mac = CryptoJS.HmacSHA256(data, zalopayConfig.key1).toString();

  axios
    .post(zalopayConfig.refund_url, null, { params })
    .then((res) => console.log(res.data))
    .catch((err) => {
      console.log(err);
      throw new AppError((err as Error).message, 400);
    });
};
