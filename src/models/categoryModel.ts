import mongoose, { Document, Schema } from 'mongoose';
import Product from './productModel';
import slugify from 'slugify';

interface ICategory extends Document {
  name: string;
  description: string;
  slug?: string;
}

interface ICategoryModel extends mongoose.Model<ICategory> {
  getCategoriesWithProductCount(): Promise<
    Array<{ name: string; description: string; totalProducts: number }>
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
  },
  { timestamps: true }
);

categorySchema.pre('save', function (next) {
  if (this.isModified('name') || !this.slug) {
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

categorySchema.statics.getCategoriesWithProductCount = async function () {
  const categoriesWithProductCount = await this.aggregate([
    {
      $lookup: {
        from: 'products', // Collection name for Product
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
      },
    },
  ]);

  return categoriesWithProductCount;
};

const Category = mongoose.model<ICategory, ICategoryModel>(
  'Category',
  categorySchema
);

export default Category;
