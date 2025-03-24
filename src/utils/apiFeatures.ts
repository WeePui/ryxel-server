import { Query } from 'mongoose';
import Category from '../models/categoryModel';
import Product from '../models/productModel';

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

  async search() {
    if (this.queryString.search) {
      const results = await Product.aggregate([
        {
          $search: {
            index: 'products',
            compound: {
              should: [
                {
                  autocomplete: {
                    query: this.queryString.search,
                    path: 'name',
                  },
                },
                {
                  autocomplete: {
                    query: this.queryString.search,
                    path: 'description',
                  },
                },
                {
                  autocomplete: {
                    query: this.queryString.search,
                    path: 'brand',
                  },
                },
                {
                  embeddedDocument: {
                    operator: {
                      compound: {
                        should: [
                          {
                            autocomplete: {
                              query: this.queryString.search,
                              path: 'variants.name',
                            },
                          },
                          {
                            autocomplete: {
                              query: this.queryString.search,
                              path: 'variants.specifications',
                            },
                          },
                        ],
                      },
                    },
                    path: 'variants',
                  },
                },
              ],
            },
          },
        },
        { $addFields: { score: { $meta: 'searchScore' } } },
        { $sort: { score: -1 } },
      ]);

      this.query = Product.find({
        _id: { $in: results.map((result) => result._id) },
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
      const sortBy = this.queryString.sort.split(',').join(' ') + ' _id';
      this.query = this.query.sort(sortBy);
    } else this.query = this.query.sort('-createdAt _id');

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
    const page = Number(this.queryString.page) || 1;
    const limit = Number(this.queryString.limit) || 10;
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
