const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');
const xss = require('xss-clean');
const hpp = require('hpp');
const cors = require('cors');
const mongoSanitize = require('express-mongo-sanitize');
const productRouter = require('./routes/productRoute');
const userRouter = require('./routes/userRoute');
const reviewRouter = require('./routes/reviewRoute');
const categoryRouter = require('./routes/categoryRoute');
const errorController = require('./controllers/errorController');
const compression = require('compression');

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

app.use(errorController);

module.exports = app;
