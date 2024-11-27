const Category = require('../models/categoryModel');

class APIFeatures {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = queryString;
  }

  async filter() {
    const queryObj = { ...this.queryString };
    const excludedFields = ['page', 'sort', 'limit', 'fields'];
    excludedFields.forEach((el) => delete queryObj[el]);

    // Filtering
    if (queryObj.price) {
      queryObj.lowestPrice = { ...queryObj.price };
      delete queryObj.price;
    }

    if (queryObj.category) {
      const categoryName = queryObj.category;
      const category = await Category.findOne({ name: categoryName });
      if (category) {
        queryObj.category = category._id;
      } else {
        delete queryObj.category;
      }
    }

    const queryStr = JSON.stringify(queryObj).replace(
      /\b(gte|gt|lte|lt)\b/g,
      (match) => `$${match}`
    );

    this.query = this.query.find(JSON.parse(queryStr));
    return this;
  }

  sort() {
    // Sorting
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(',').join(' ');
      this.query = this.query.sort(sortBy);
    } else this.query = this.query.sort('-createdAt');

    return this;
  }

  limitFields() {
    // Field limiting
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(',').join(' ');
      this.query = this.query.select(fields);
    } else this.query = this.query.select('-__v -createdAt');

    return this;
  }

  pagination() {
    // Pagination
    const page = this.queryString.page * 1 || 1;
    const limit = this.queryString.limit * 1 || 10;
    const skip = page * limit - limit;

    this.query = this.query.skip(skip).limit(limit);

    return this;
  }

  async count() {
    const countQuery = this.query.model.find(this.query.getFilter());
    const count = await countQuery.countDocuments();
    return count;
  }
}

module.exports = APIFeatures;
