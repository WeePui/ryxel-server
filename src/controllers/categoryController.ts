import { Request, Response, NextFunction } from 'express';
import Category from '../models/categoryModel';
import AppError from '../utils/AppError';
import catchAsync from '../utils/catchAsync';
import {
  deleteImage,
  extractPublicId,
  uploadImage,
} from '../utils/cloudinaryService';
import { getCategorySaleData, getTime } from './adminController';
import Product from '../models/productModel';
import slugify from 'slugify';

export const getAllCategories = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const categories = await Category.getCategoriesWithSales();

    res.status(200).json({
      status: 'success',
      results: categories.length,
      data: {
        categories,
      },
    });
  }
);

export const getClientCategories = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const categories = await Category.find().select('name slug image').lean();

    res.status(200).json({
      status: 'success',
      data: { categories },
    });
  }
);

export const createCategory = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { name, description, slug } = req.body;

    // Kiểm tra thiếu field
    if (!name || !description || !req.file) {
      return res.status(400).json({
        status: 'fail',
        message: 'Missing required fields: name, description, or image',
      });
    }

    const category = await Category.create({ name, description, slug });

    if (req.file) {
      const [uploadResult] = await Promise.all([
        uploadImage('categories', req.file.buffer),
      ]);

      if (!uploadResult)
        return next(new AppError('Error uploading image', 500));

      category.image = uploadResult.secure_url;
    }

    await category.save();

    return res.status(201).json({
      status: 'success',
      data: {
        category,
      },
    });
  }
);

export const updateCategory = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { name, description, slug } = req.body;

    // Kiểm tra xem ít nhất một trong các trường tồn tại
    if (!name && !description && !req.file) {
      return next(
        new AppError(
          'At least one field (name, description, or image) must be provided',
          400
        )
      );
    }

    // Tìm category theo ID
    const category = await Category.findById(req.params.id);
    if (!category) {
      return next(new AppError('Category not found', 404));
    }

    // Cập nhật các trường nếu có
    if (name) category.name = name;
    if (description) category.description = description;
    if (slug !== undefined) {
      if (slug.trim() === '') {
        category.slug = slugify(category.name, {
          lower: true,
          strict: true,
        });
      } else {
        category.slug = slug;
      }
    }

    // Logic cập nhật ảnh
    if (req.file && req.file.size > 0) {
      if (category.image) {
        const categoryPublicId = extractPublicId(category.image);
        console.log('categoryPublicId', categoryPublicId);
        const deleteResult = await deleteImage(categoryPublicId!);
        if (!deleteResult || deleteResult.result !== 'ok') {
          return next(new AppError('Error deleting image', 500));
        }
      }

      const [uploadResult] = await Promise.all([
        uploadImage('categories', req.file.buffer),
        Promise.resolve({ result: 'ok' }),
      ]);

      if (!uploadResult)
        return next(new AppError('Error uploading image', 500));

      category.image = uploadResult.secure_url;
    }

    await category.save();

    res.status(200).json({
      status: 'success',
      data: {
        category,
      },
    });
  }
);

export const deleteCategory = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const category = await Category.findById(id);

    if (!category)
      return next(new AppError('No category found with that ID', 404));

    if (category.image) {
      const categoryPublibId = extractPublicId(category.image);

      const deleteResult = await deleteImage(categoryPublibId!);
      if (!deleteResult || deleteResult.result !== 'ok') {
        return next(new AppError('Error deleting image', 500));
      }
    }
    await Category.findByIdAndDelete(id);

    res.status(204).json({
      status: 'success',
    });
  }
);

export const getCategoryBySlug = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { slug } = req.params;

  const category = await Category.findOne({ slug });

  if (!category)
    return next(new AppError('No category found with that slug', 404));

  res.status(200).json({
    status: 'success',
    data: {
      category,
    },
  });
};

export const getCategorySummary = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { slug } = req.params;
    const range = req.query.range as string;
    const year = parseInt(req.query.year as string);
    const month = req.query.month
      ? parseInt(req.query.month as string)
      : undefined;

    // Validate query
    if (
      !['day', 'month', 'year'].includes(range) ||
      (range !== 'day' && isNaN(year)) ||
      (range === 'month' && (!month || isNaN(month) || month < 1 || month > 12))
    ) {
      return res.status(400).json({
        status: 'fail',
        message:
          'Invalid query parameters. Provide valid "range", "year", and "month" if needed.',
      });
    }

    const { startDate, endDate, timeSlots } = getTime(range, year, month);

    // Get category
    const category = await Category.findOne({ slug });
    if (!category) return next(new AppError('Category not found', 404));

    // Set groupBy field
    let groupBy: any;
    if (range === 'day') groupBy = { $hour: '$createdAt' };
    else if (range === 'month') groupBy = { $dayOfMonth: '$createdAt' };
    else groupBy = { $month: '$createdAt' };

    // Get sales
    const sales = await getCategorySaleData(
      category,
      startDate,
      endDate,
      groupBy
    );

    // Normalize sales
    const salesMap = new Map(sales.map((s) => [s.name, s.value]));
    const normalizedSales = timeSlots.map((slot) => ({
      name: slot,
      value: salesMap.get(slot) || 0,
    }));

    const totalSales = normalizedSales.reduce((sum, s) => sum + s.value, 0);

    // Previous period for changeAmount
    const { startDate: prevStart, endDate: prevEnd } = (() => {
      if (range === 'day') {
        const prevDay = new Date(startDate);
        prevDay.setUTCDate(prevDay.getUTCDate() - 1);
        return getTime(
          'day',
          prevDay.getUTCFullYear(),
          prevDay.getUTCMonth() + 1
        );
      } else if (range === 'month') {
        const prevMonth = new Date(startDate);
        prevMonth.setUTCMonth(prevMonth.getUTCMonth() - 1);
        return getTime(
          'month',
          prevMonth.getUTCFullYear(),
          prevMonth.getUTCMonth() + 1
        );
      } else {
        return getTime('year', year - 1);
      }
    })();

    const prevSales = await getCategorySaleData(
      category,
      prevStart,
      prevEnd,
      groupBy
    );

    const previousTotal = prevSales.length > 0 ? prevSales[0].value : 0;
    const changeAmount = totalSales - previousTotal;

    // Count total products
    const totalProducts = await Product.countDocuments({
      category: category._id,
    });

    res.status(200).json({
      status: 'success',
      data: {
        sales: normalizedSales,
        totalSales,
        changeAmount,
        totalProducts,
      },
    });
  }
);
