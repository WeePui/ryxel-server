import { Query } from 'mongoose';
import Category from '../models/categoryModel';

interface QueryString {
  search?: string;
  page?: string;
  sort?: string;
  limit?: string;
  fields?: string;
  [key: string]: any;
}

class APIFeatures {
  query: Query<any[], any>;
  queryString: QueryString;

  constructor(query: Query<any[], any>, queryString: QueryString) {
    this.query = query;
    this.queryString = queryString;
  }

  search() {
    if (this.queryString.search) {
      this.query = this.query
        .find(
          {
            $text: { $search: this.queryString.search },
          },
          {
            score: { $meta: 'textScore' },
          }
        )
        .sort({
          score: { $meta: 'textScore' },
        });
    }
    return this;
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
    const page = this.queryString.page
      ? parseInt(this.queryString.page, 10)
      : 1;
    const limit = this.queryString.limit
      ? parseInt(this.queryString.limit, 10)
      : 10;
    const skip = (page - 1) * limit;

    this.query = this.query.skip(skip).limit(limit);

    return this;
  }

  async count() {
    const countQuery = this.query.model.find(this.query.getFilter());
    const count = await countQuery.countDocuments();
    return count;
  }
}

export default APIFeatures;
