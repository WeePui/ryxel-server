import { Request, Response, NextFunction } from 'express';
import Order from '../models/orderModel';
import AppError from '../utils/AppError';
import catchAsync from '../utils/catchAsync';
import { fulfillCheckout } from './paymentController';
import { ghnStatusDescriptions } from '../utils/ghnService';
import stripe from 'stripe';
import axios from 'axios';

export const ghnWebhook = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const eventData = req.body;
    const { OrderCode, Status, Time } = eventData;

    if (!OrderCode || !Status || !Time) {
      return next(new AppError('Invalid payload', 400));
    }

    const order = await Order.findOne({
      'shippingTracking.ghnOrderCode': OrderCode,
    });

    if (!order) {
      return next(
        new AppError('Order not found for the provided GHN order code', 404)
      );
    }

    // Chỉ xử lý nếu là trạng thái quan trọng
    const description = ghnStatusDescriptions[Status];

    if (!description) {
      console.log('⚠️ Bỏ qua trạng thái không cần thiết:', Status);
      return res.status(200).json({
        status: 'skipped',
        message: `Status "${Status}" ignored`,
      });
    }

    if (Status === 'picked') {
      order.status = 'shipped';
      // @ts-ignore: dùng tạm skipLog để bỏ qua ghi log
      order.skipLog = true;
    }

    if (Status === 'delivered') {
      order.status = 'delivered';
    }

    const statusEntry = {
      status: Status,
      description,
      timestamp: new Date(Time),
    };

    order.shippingTracking!.trackingStatus = Status;
    order.shippingTracking!.statusHistory.push(statusEntry);
    await order.save();

    res.status(200).json({
      status: 'success',
      message: 'GHN webhook processed',
    });
  }
);

export const stripeWebhook = catchAsync(
  async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    const payload = request.body;
    const sig = request.headers['stripe-signature'];

    if (!sig) {
      response.status(400).send('Webhook Error: Missing stripe-signature');
      return;
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        payload,
        sig!,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      console.error('❌ Webhook Signature Error:', err.message);
      return next(new AppError(`Webhook Error: ${err.message}`, 400));
    }

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      fulfillCheckout(event.data.object.id);
    }

    response.status(200).end();
  }
);

export const testGHNWebhook = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { status, orderCode, time, shippingOrderCode } = req.body;

    if (!status || !shippingOrderCode) {
      return res.status(400).json({
        message: 'Missing required fields: status, time',
      });
    }

    // Payload giả lập giống GHN
    const fakePayload = {
      CODAmount: 3000000,
      CODTransferDate: null,
      ClientOrderCode: orderCode || '',
      ConvertedWeight: 200,
      Description: 'Tạo đơn hàng',
      Fee: {
        CODFailedFee: 0,
        CODFee: 0,
        Coupon: 0,
        DeliverRemoteAreasFee: 0,
        DocumentReturn: 0,
        DoubleCheck: 0,
        Insurance: 17500,
        MainService: 53900,
        PickRemoteAreasFee: 53900,
        R2S: 0,
        Return: 0,
        StationDO: 0,
        StationPU: 0,
        Total: 0,
      },
      Height: 10,
      IsPartialReturn: false,
      Length: 10,
      OrderCode: shippingOrderCode,
      PartialReturnCode: '',
      PaymentType: 1,
      Reason: '',
      ReasonCode: '',
      ShopID: Number(process.env.GHN_SHOP_ID),
      Status: status,
      Time: time || new Date().toISOString(),
      TotalFee: 71400,
      Type: 'create',
      Warehouse: 'Bưu Cục 229 Quan Nhân-Q.Thanh Xuân-HN',
      Weight: 10,
      Width: 10,
    };

    try {
      const response = await axios.post(
        'http://localhost:8000/api/v1/webhooks/ghn',
        fakePayload
      );
      return res.status(200).json({
        message: 'Fake GHN webhook sent successfully',
        response: response.data,
      });
    } catch (err: any) {
      return res.status(500).json({
        message: 'Error sending fake GHN webhook',
        error: err.message,
      });
    }
  }
);
