import { Request, Response, NextFunction } from 'express';
import Category from '../models/categoryModel';
import AppError from '../utils/AppError';

export const getAllCategories = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const categories = await Category.find();

  res.status(200).json({
    status: 'success',
    results: categories.length,
    data: {
      categories,
    },
  });
};

export const createCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const category = await Category.create(req.body);

  res.status(201).json({
    status: 'success',
    data: {
      category,
    },
  });
};

export const updateCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;

  const category = await Category.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!category)
    return next(new AppError('No category found with that ID', 404));

  res.status(200).json({
    status: 'success',
    data: {
      category,
    },
  });
};

export const deleteCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;
  const category = await Category.findByIdAndDelete(id);

  if (!category)
    return next(new AppError('No category found with that ID', 404));

  res.status(204).json({
    status: 'success',
    data: null,
  });
};
