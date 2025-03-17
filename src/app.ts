import express, { Application, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import xss from 'xss-clean';
import hpp from 'hpp';
import bodyParser from 'body-parser';
import mongoSanitize from 'express-mongo-sanitize';
import compression from 'compression';
import productRouter from './routes/productRoute';
import userRouter from './routes/userRoute';
import categoryRouter from './routes/categoryRoute';
import addressRouter from './routes/addressRoute';
import discountRouter from './routes/discountRoute';
import reviewRouter from './routes/reviewRoute';
import cartRouter from './routes/cartRoute';
import orderRouter from './routes/orderRoute';
import paymentRouter from './routes/paymentRoute';
import wishlistRouter from './routes/wishlistRoute';
import { fulfillCheckout } from './controllers/paymentController';
import errorController from './controllers/errorController';
import stripe from 'stripe';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app: Application = express();

app.use(helmet());
app.use(compression());

app.use(
  cors({
    origin: 'http://localhost:3000',
    methods: 'GET,POST,PUT,DELETE',
    allowedHeaders: 'Content-Type,Authorization',
  })
);

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
}

const limiter = rateLimit({
  max: process.env.NODE_ENV === 'development' ? 99999999 : 100,
  windowMs: 60 * 60 * 1000,
  message: 'Too many requests from this IP, please try again in an hour!',
});

app.use('/api', limiter);

app.post(
  '/webhook',
  bodyParser.raw({ type: 'application/json' }),
  async (request: Request, response: Response): Promise<void> => {
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
      response.status(400).send(`Webhook Error: ${err.message}`);
      return;
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

app.use(express.json({ limit: '10kb' }));
app.use(
  express.urlencoded({
    extended: true,
  })
);
app.use(mongoSanitize());
app.use(xss());
app.use(hpp({ whitelist: [] }));

app.use('/api/v1/products', productRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/categories', categoryRouter);
app.use('/api/v1/addresses', addressRouter);
app.use('/api/v1/discounts', discountRouter);
app.use('/api/v1/reviews', reviewRouter);
app.use('/api/v1/cart', cartRouter);
app.use('/api/v1/orders', orderRouter);
app.use('/api/v1/payments', paymentRouter);
app.use('/api/v1/wishlist', wishlistRouter);

app.use(errorController);

export default app;
