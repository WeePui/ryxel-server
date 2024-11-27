const Product = require('../models/productModel');
const APIFeatures = require('../utils/apiFeatures');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Category = require('../models/categoryModel');

exports.aliasTopProducts = (req, res, next) => {
  req.query.limit = '5';
  req.query.sort = '-sold';
  next();
};

exports.getAllProducts = catchAsync(async (req, res, next) => {
  const { category } = req.query;

  if (category) {
    const categoryDoc = await Category.findOne({ name: category });

    if (!categoryDoc) {
      return next(new AppError('No category found with that name', 404));
    }
  }

  const apiFeatures = new APIFeatures(Product.find(), req.query);
  await apiFeatures.filter();

  const totalResults = await apiFeatures.count();

  apiFeatures.sort().limitFields().pagination();

  const products = await apiFeatures.query.lean();

  res.status(200).json({
    status: 'success',
    results: products.length,
    totalResults,
    data: {
      products,
    },
  });
});

exports.createProduct = catchAsync(async (req, res) => {
  const product = await Product.create(req.body);

  res.status(201).json({
    status: 'success',
    data: {
      product,
    },
  });
});

exports.getProductById = catchAsync(async ({ params: { id } }, res, next) => {
  const product = await Product.findById(id).populate('reviews').lean();

  if (!product) {
    return next(new AppError('No product found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      product,
    },
  });
});

exports.updateProduct = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const product = await Product.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!product) return next(new AppError('No product found with that ID', 404));

  res.status(200).json({
    status: 'success',
    data: {
      product,
    },
  });
});

exports.deleteProduct = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const product = await Product.findByIdAndDelete(id);

  if (!product) return next(new AppError('No product found with that ID', 404));

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
