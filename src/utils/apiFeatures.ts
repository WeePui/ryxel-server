import { Model, Query } from "mongoose";
import Product from "../models/productModel";
import Order from "../models/orderModel";

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
  needsPriceAggregation: boolean = false;
  priceSortDirection: string | null = null;

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
                index: "products",
                compound: {
                  should: [
                    {
                      autocomplete: {
                        query: this.queryString.search,
                        path: "name",
                        fuzzy: {
                          maxEdits: 1, // Cho phép sửa tối đa 1 ký tự
                          prefixLength: 2, // Không cho phép sửa ký tự đầu tiên
                          maxExpansions: 50, // Giới hạn số lượng kết quả mở rộng
                        },
                        score: { boost: { value: 10 } },
                      },
                    },
                    {
                      text: {
                        query: this.queryString.search,
                        path: "description",
                        score: { boost: { value: 2 } },
                      },
                    },
                    {
                      text: {
                        query: this.queryString.search,
                        path: "brand",
                        fuzzy: {
                          maxEdits: 1, // Cho phép sửa tối đa 1 ký tự
                          prefixLength: 2, // Không cho phép sửa ký tự đầu tiên
                          maxExpansions: 50, // Giới hạn số lượng kết quả mở rộng
                        },
                        score: { boost: { value: 8 } },
                      },
                    },
                    {
                      text: {
                        query: this.queryString.search,
                        path: "_categoryName",
                        fuzzy: {
                          maxEdits: 1, // Cho phép sửa tối đa 1 ký tự
                          prefixLength: 2, // Không cho phép sửa ký tự đầu tiên
                          maxExpansions: 50, // Giới hạn số lượng kết quả mở rộng
                        },
                        score: { boost: { value: 6 } },
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
                                  path: "variants.name",
                                  fuzzy: {
                                    maxEdits: 1, // Cho phép sửa tối đa 1 ký tự
                                    prefixLength: 2, // Không cho phép sửa ký tự đầu tiên
                                    maxExpansions: 50, // Giới hạn số lượng kết quả mở rộng
                                  },
                                  score: { boost: { value: 4 } },
                                },
                              },
                              {
                                text: {
                                  query: this.queryString.search,
                                  path: "variants.specifications",
                                  score: { boost: { value: 2 } },
                                },
                              },
                            ],
                          },
                        },
                        path: "variants",
                      },
                    },
                  ],
                },
              },
            },
            { $addFields: { score: { $meta: "searchScore" } } },
            { $sort: { score: -1 } },
          ]);
        } else if (this.query.model === Order) {
          results = await this.query.model.aggregate([
            {
              $search: {
                index: "order",
                compound: {
                  should: [
                    {
                      autocomplete: {
                        query: this.queryString.search,
                        path: "orderCode",
                      },
                    },
                    {
                      text: {
                        query: this.queryString.search,
                        path: "status",
                      },
                    },
                    {
                      autocomplete: {
                        query: this.queryString.search,
                        path: "lineItems._itemName",
                      },
                    },
                  ],
                },
              },
            },
            { $addFields: { score: { $meta: "searchScore" } } },
            { $sort: { score: -1 } },
          ]);
        }
        this.query = this.query.find({
          _id: { $in: results.map((result) => result._id) },
        });
      } else {
        this.query = this.query.find({
          $or: [
            { name: { $regex: this.queryString.search, $options: "i" } },
            { description: { $regex: this.queryString.search, $options: "i" } },
          ],
        });
      }
    }
    return this;
  }
  filter() {
    const queryObj = { ...this.queryString };
    const excludedFields = ["page", "sort", "limit", "fields", "search"];
    excludedFields.forEach((el) => delete queryObj[el]);

    // Filtering by price - use a more flexible approach
    if (queryObj.price) {
      // For price filtering, we need to check both finalPrice and price fields
      // This will be handled differently in aggregation vs regular queries
      queryObj["variants.price"] = { ...queryObj.price };
      delete queryObj.price;
    }

    if (queryObj.category) {
      queryObj._categoryName = queryObj.category;
      delete queryObj.category;
    }

    // Filtering by specifications
    if (queryObj.specs) {
      const specFilters = JSON.parse(queryObj.specs); // Chuyển từ string thành object
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

    // Handle onSale filtering separately to avoid Date serialization issues
    let onSaleQuery = null;
    if (queryObj.onSale === "true") {
      const currentDate = new Date();
      onSaleQuery = {
        "variants.saleOff.percentage": { $gt: 0 },
        "variants.saleOff.startDate": { $lte: currentDate },
        "variants.saleOff.endDate": { $gte: currentDate },
      };
      delete queryObj.onSale;
    }

    const queryStr = JSON.stringify(queryObj).replace(
      /\b(gte|gt|lte|lt)\b/g,
      (match) => `$${match}`
    );

    const parsedQuery = JSON.parse(queryStr);

    // Add onSale query conditions after JSON parsing to preserve Date objects
    if (onSaleQuery) {
      if (parsedQuery.$and) {
        parsedQuery.$and.push(onSaleQuery);
      } else {
        parsedQuery.$and = [onSaleQuery];
      }
    }

    this.query = this.query.find(parsedQuery);
    return this;
  }

  async filterWithAggregation() {
    const pipeline: any[] = [];

    // Thêm lowestPrice từ variants
    pipeline.push({
      $addFields: {
        lowestPrice: {
          $min: {
            $map: {
              input: "$variants",
              as: "variant",
              in: "$$variant.finalPrice",
            },
          },
        },
      },
    });

    const matchStage: any = {};

    // Lọc theo price (thành lowestPrice)
    if (this.queryString.price) {
      const priceFilter = JSON.parse(
        JSON.stringify(this.queryString.price).replace(
          /\b(gte|gt|lte|lt)\b/g,
          (match) => `$${match}`
        )
      );
      matchStage.lowestPrice = priceFilter;
    } // Lọc theo category
    if (this.queryString.category) {
      matchStage._categoryName = this.queryString.category;
    }

    // Lọc theo specs
    if (this.queryString.specs) {
      const specFilters = JSON.parse(this.queryString.specs);
      const specConditions = Object.entries(specFilters).map(([key, value]) => {
        const condition = Array.isArray(value) ? { $in: value } : value;
        return { [`variants.specifications.${key}`]: condition };
      });
      if (specConditions.length > 0) {
        matchStage.$and = specConditions;
      }
    } // Handle onSale filtering for aggregation - avoid Date serialization issues
    if (this.queryString.onSale === "true") {
      const currentDate = new Date();
      matchStage.$and = matchStage.$and || [];
      matchStage.$and.push({
        "variants.saleOff": { $exists: true },
        "variants.saleOff.percentage": { $gt: 0 },
        "variants.saleOff.startDate": { $lte: currentDate },
        "variants.saleOff.endDate": { $gte: currentDate },
      });
    }

    pipeline.push({ $match: matchStage });

    // Optional: add sorting, pagination, field limiting vào pipeline nếu cần

    const results = await this.query.model.aggregate(pipeline);
    this.query = this.query.model.find({
      _id: { $in: results.map((r) => r._id) },
    });

    return this;
  }
  sort() {
    // Sorting
    if (this.queryString.sort) {
      const sortFields = this.queryString.sort.split(",");
      const hasPriceSorting = sortFields.some(
        (field) => field === "price" || field === "-price"
      );
      // If price sorting is requested, we need to use aggregation
      if (hasPriceSorting) {
        // Mark that we need aggregation for price sorting
        this.needsPriceAggregation = true;
        this.priceSortDirection =
          sortFields.find((field) => field === "price" || field === "-price") ||
          null;
        return this;
      }

      // For non-price sorting, use regular sort
      const sortBy = sortFields.join(" ") + " _id";
      this.query = this.query.sort(sortBy);
    } else this.query = this.query.sort("-createdAt _id totalStock");

    return this;
  }

  limitFields() {
    // Field limiting
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(",").join(" ");
      this.query = this.query.select(fields);
    } else this.query = this.query.select("-__v -createdAt");

    return this;
  }
  paginate() {
    // Pagination
    const page = Number(this.queryString.page) || 1;
    const limit =
      Number(this.queryString.limit) ||
      Number(process.env.DEFAULT_LIMIT_PER_PAGE) ||
      10; // Default fallback
    const skip = (page - 1) * limit;

    this.query = this.query.skip(skip).limit(limit);
    return this;
  }
  async executePriceSortedQuery() {
    if (!this.needsPriceAggregation) {
      return this.query;
    }

    // Build aggregation pipeline for price sorting
    const pipeline: any[] = [];

    // First, calculate lowestPrice for each product
    pipeline.push({
      $addFields: {
        lowestPrice: {
          $min: {
            $map: {
              input: "$variants",
              as: "variant",
              in: {
                $cond: {
                  if: { $ifNull: ["$$variant.finalPrice", false] },
                  then: "$$variant.finalPrice",
                  else: "$$variant.price",
                },
              },
            },
          },
        },
      },
    }); // Build match stage with all filters
    const matchStage: any = {};

    // Get the original filter conditions but exclude price filters
    const filterConditions = this.query.getFilter();
    Object.keys(filterConditions).forEach((key) => {
      if (!key.includes("variants.price")) {
        matchStage[key] = filterConditions[key];
      }
    });

    // Handle price filtering using the calculated lowestPrice
    if (this.queryString.price) {
      const priceFilter = JSON.parse(
        JSON.stringify(this.queryString.price).replace(
          /\b(gte|gt|lte|lt)\b/g,
          (match) => `$${match}`
        )
      );
      matchStage.lowestPrice = priceFilter;
    } // Handle onSale filtering for aggregation - preserve Date objects
    if (this.queryString.onSale === "true") {
      const currentDate = new Date();
      matchStage.$and = matchStage.$and || [];
      matchStage.$and.push({
        "variants.saleOff": { $exists: true },
        "variants.saleOff.percentage": { $gt: 0 },
        "variants.saleOff.startDate": { $lte: currentDate },
        "variants.saleOff.endDate": { $gte: currentDate },
      });
    }

    // Add match stage if there are conditions
    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    // Add sorting
    const sortDirection = this.priceSortDirection === "price" ? 1 : -1;
    const sortStage: any = { lowestPrice: sortDirection, _id: 1 };

    // Handle multiple sort fields
    if (this.queryString.sort) {
      const sortFields = this.queryString.sort.split(",");
      const otherSortFields = sortFields.filter(
        (field) => field !== "price" && field !== "-price"
      );

      // Add other sort fields
      otherSortFields.forEach((field) => {
        if (field.startsWith("-")) {
          sortStage[field.substring(1)] = -1;
        } else {
          sortStage[field] = 1;
        }
      });
    }
    pipeline.push({ $sort: sortStage });

    // Add pagination if needed
    if (this.queryString.page || this.queryString.limit) {
      const page = Number(this.queryString.page) || 1;
      const limit =
        Number(this.queryString.limit) ||
        Number(process.env.DEFAULT_LIMIT_PER_PAGE) ||
        10;
      const skip = (page - 1) * limit;

      pipeline.push({ $skip: skip });
      pipeline.push({ $limit: limit });
    }

    // Execute aggregation
    const results = await Product.aggregate(pipeline);

    return results;
  }

  async count() {
    const countQuery = this.query.model.find(this.query.getFilter());
    const count = await countQuery.countDocuments();
    return count;
  }
}

export default APIFeatures;
