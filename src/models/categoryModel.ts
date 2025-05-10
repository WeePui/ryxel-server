import mongoose, { Document, Schema } from 'mongoose';
import Product from './productModel';
import slugify from 'slugify';

interface ICategory extends Document {
  name: string;
  description: string;
  slug?: string;
  image?: string;
}

interface ICategoryModel extends mongoose.Model<ICategory> {
  getCategoriesWithSales(): Promise<
    Array<{
      _id: any;
      name: string;
      description: string;
      totalProducts: number;
      sales: number;
    }>
  >;
}

const categorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      required: [true, 'Category description is required'],
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
    },
    image: {
      type: String,
    },
  },
  { timestamps: true }
);

categorySchema.pre('save', function (next) {
  if (!this.slug || this.slug.trim() === '') {
    this.slug = slugify(this.name, {
      lower: true,
      strict: true,
    });
  }

  next();
});

categorySchema.post('save', async function (doc) {
  await Product.updateMany({ category: doc._id }, { _categoryName: doc.name });
});

categorySchema.statics.getCategoriesWithSales = async function () {
  const categories = await this.aggregate([
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: 'category',
        as: 'products',
      },
    },
    {
      $addFields: {
        totalProducts: { $size: '$products' },
      },
    },
    {
      $project: {
        products: 0,
        __v: 0,
      },
    },
  ]);

  const salesData = await mongoose.model('Order').aggregate([
    {
      $match: {
        status: { $nin: ['unpaid', 'canceled'] },
      },
    },
    { $unwind: '$lineItems' },
    {
      $lookup: {
        from: 'products',
        localField: 'lineItems.product',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: '$product' },
    {
      $group: {
        _id: '$product.category',
        totalSales: { $sum: '$lineItems.subtotal' },
      },
    },
  ]);

  const salesMap = new Map<string, number>();
  salesData.forEach((sale) => {
    salesMap.set(String(sale._id), sale.totalSales);
  });

  return categories.map((category) => ({
    ...category,
    sales: salesMap.get(String(category._id)) || 0,
  }));
};

const Category = mongoose.model<ICategory, ICategoryModel>(
  'Category',
  categorySchema
);

export default Category;
