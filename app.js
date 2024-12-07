const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');
const xss = require('xss-clean');
const hpp = require('hpp');
const bodyParser = require('body-parser');
const mongoSanitize = require('express-mongo-sanitize');
const productRouter = require('./routes/productRoute');
const userRouter = require('./routes/userRoute');
const reviewRouter = require('./routes/reviewRoute');
const categoryRouter = require('./routes/categoryRoute');
const addressRouter = require('./routes/addressRoute');
const discountRouter = require('./routes/discountRoute');
const cartRouter = require('./routes/cartRoute');
const orderRouter = require('./routes/orderRoute');
const paymentRouter = require('./routes/paymentRoute');
const paymentController = require('./controllers/paymentController');
const errorController = require('./controllers/errorController');
const compression = require('compression');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

app.use(helmet());
app.use(compression());

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
  async (request, response) => {
    const payload = request.body;
    const sig = request.headers['stripe-signature'];

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        payload,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log(err);

      return response.status(400).send(`Webhook Error: ${err.message}`);
    }
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      paymentController.fulfillCheckout(event.data.object.id);
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
app.use('/api/v1/reviews', reviewRouter);
app.use('/api/v1/categories', categoryRouter);
app.use('/api/v1/addresses', addressRouter);
app.use('/api/v1/discounts', discountRouter);
app.use('/api/v1/cart', cartRouter);
app.use('/api/v1/orders', orderRouter);
app.use('/api/v1/payments', paymentRouter);

app.use(errorController);

module.exports = app;
