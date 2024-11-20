const Category = require('../models/categoryModel');
const AppError = require('../utils/appError');

exports.getAllCategories = async (req, res, next) => {
  const categories = await Category.find();

  res.status(200).json({
    status: 'success',
    results: categories.length,
    data: {
      categories,
    },
  });
};

exports.createCategory = async (req, res, next) => {
  const category = await Category.create(req.body);

  res.status(201).json({
    status: 'success',
    data: {
      category,
    },
  });
};

exports.updateCategory = async (req, res, next) => {
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

exports.deleteCategory = async (req, res, next) => {
  const { id } = req.params;
  const category = await Category.findByIdAndDelete(id);

  if (!category)
    return next(new AppError('No category found with that ID', 404));

  res.status(204).json({
    status: 'success',
    data: null,
  });
};
