import mongoose, { Document, Schema } from 'mongoose';
import Product from './productModel';

interface ICategory extends Document {
  name: string;
  description: string;
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
  },
  { timestamps: true }
);

categorySchema.post('save', async function (doc) {
  await Product.updateMany({ category: doc._id }, { _categoryName: doc.name });
});

const Category = mongoose.model<ICategory>('Category', categorySchema);

export default Category;
