import { Request, Response, NextFunction } from 'express';
import Product from '../models/productModel';
import APIFeatures from '../utils/apiFeatures';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/AppError';
import Category from '../models/categoryModel';

export const aliasTopProducts = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  req.query.limit = '5';
  req.query.sort = '-sold';
  next();
};

export const getAllProducts = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { category } = req.query;

    if (category) {
      const categoryDoc = await Category.findOne({ name: category });
      if (!categoryDoc) {
        return next(new AppError('No category found with that name', 404));
      }
    }

    const apiFeatures = new APIFeatures(Product.find(), req.query);
    await apiFeatures.filter();

    const searchResults = await apiFeatures.search();

    if (searchResults.query) {
      apiFeatures.query = searchResults.query;
    }

    const totalResults = await apiFeatures.count();

    apiFeatures.sort().limitFields().pagination();

    const products = await apiFeatures.query.lean().exec();

    res.status(200).json({
      status: 'success',
      results: products.length,
      totalResults,
      data: {
        products,
      },
    });
  }
);

export const createProduct = catchAsync(async (req: Request, res: Response) => {
  const product = await Product.create(req.body);

  res.status(201).json({
    status: 'success',
    data: {
      product,
    },
  });
});

export const getProductById = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const product = await Product.findById(req.params.id)
      .populate('reviews')
      .lean();

    if (!product) {
      return next(new AppError('No product found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        product,
      },
    });
  }
);

export const updateProduct = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const product = await Product.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!product)
      return next(new AppError('No product found with that ID', 404));

    res.status(200).json({
      status: 'success',
      data: {
        product,
      },
    });
  }
);

export const deleteProduct = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const product = await Product.findByIdAndDelete(id);

    if (!product)
      return next(new AppError('No product found with that ID', 404));

    res.status(204).json({
      status: 'success',
      data: null,
    });
  }
);
