import { Model, Query } from 'mongoose';
import Category from '../models/categoryModel';
import Product from '../models/productModel';
import Order from '../models/orderModel';

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
      if (this.query.model === Product || this.query.model === Order) {
        let results = [];

        if (this.query.model === Product) {
          results = await this.query.model.aggregate([
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
                      autocomplete: {
                        query: this.queryString.search,
                        path: '_categoryName',
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
        } else if (this.query.model === Order) {
          results = await this.query.model.aggregate([
            {
              $search: {
                index: 'order',
                compound: {
                  should: [
                    {
                      text: {
                        query: this.queryString.search,
                        path: 'orderCode',
                      },
                    },
                    {
                      text: {
                        query: this.queryString.search,
                        path: 'status',
                      },
                    },
                    {
                      autocomplete: {
                        query: this.queryString.search,
                        path: 'lineItems._itemName',
                      },
                    },
                  ],
                },
              },
            },
            { $addFields: { score: { $meta: 'searchScore' } } },
            { $sort: { score: -1 } },
          ]);
        }
        this.query = this.query.find({
          _id: { $in: results.map((result) => result._id) },
        });
      } else {
        this.query = this.query.find({
          $or: [
            { name: { $regex: this.queryString.search, $options: 'i' } },
            { description: { $regex: this.queryString.search, $options: 'i' } },
          ],
        });
      }
    }
    return this;
  }

  filter() {
    const queryObj = { ...this.queryString };
    const excludedFields = ['page', 'sort', 'limit', 'fields', 'search'];
    excludedFields.forEach((el) => delete queryObj[el]);

    // Filtering
    if (queryObj.price) {
      queryObj.lowestPrice = { ...queryObj.price };
      delete queryObj.price;
    }

    if (queryObj.category) {
      queryObj._categoryName = queryObj.category;
      delete queryObj.category;
    }

    // Filtering by specifications
    if (queryObj.specs) {
      const specFilters = JSON.parse(queryObj.specs); // Chuyển từ string thành object
      console.log(specFilters);
      const specQuery = Object.entries(specFilters).map(([key, value]) => {
        if (Array.isArray(value)) {
          return { [`variants.specifications.${key}`]: { $in: value } }; // Nếu có nhiều giá trị, dùng $in
        }
        return { [`variants.specifications.${key}`]: value }; // Nếu chỉ có một giá trị, lọc như cũ
      });

      if (specQuery.length > 0) {
        queryObj.$and = specQuery;
      }
      delete queryObj.specs;
    }

    const queryStr = JSON.stringify(queryObj).replace(
      /\b(gte|gt|lte|lt)\b/g,
      (match) => `$${match}`
    );

    this.query = this.query.find(JSON.parse(queryStr));
    console.log(queryStr);
    return this;
  }

  sort() {
    // Sorting
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(',').join(' ') + ' _id';
      this.query = this.query.sort(sortBy);
    } else this.query = this.query.sort('-createdAt _id totalStock');

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

  paginate() {
    // Pagination
    const page = Number(this.queryString.page) || 1;
    const limit = Number(this.queryString.limit) || 16;
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
