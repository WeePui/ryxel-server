const Review = require('../models/reviewModel');
const Product = require('../models/productModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

exports.getAllReviews = catchAsync(async (req, res) => {
  let filter = {};
  if (req.params.productId) filter = { product: req.params.productId };

  const reviews = await Review.find(filter);

  res.status(200).json({
    status: 'success',
    results: reviews.length,
    data: {
      reviews,
    },
  });
});

exports.createReview = catchAsync(async (req, res, next) => {
  const { productId } = req.params;

  const product = await Product.findById({ _id: productId });
  if (!product) return next(new AppError('No product found with that ID', 404));

  const review = {
    user: req.user.id,
    product: productId,
    rating: req.body.rating,
    review: req.body.review,
  };

  await Review.create(review);

  res.status(201).json({
    status: 'success',
    data: {
      review,
    },
  });
});

exports.getReviewById = catchAsync(async (req, res, next) => {
  const review = await Review.findById(req.params.id);

  if (!review) return next(new AppError('No review found with that ID', 404));

  res.status(200).json({
    status: 'success',
    data: {
      review,
    },
  });
});

exports.updateReview = catchAsync(async (req, res) => {
  const review = await Review.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!review) return next(new AppError('No review found with that ID', 404));

  res.status(200).json({
    status: 'success',
    data: {
      review,
    },
  });
});

exports.deleteReview = catchAsync(async (req, res) => {
  const review = await Review.findByIdAndDelete(req.params.id);

  if (!review) return next(new AppError('No review found with that ID', 404));

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
