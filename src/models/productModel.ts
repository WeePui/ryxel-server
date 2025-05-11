import mongoose, { Document, Query, Schema } from 'mongoose';
import './categoryModel';
import slugify from 'slugify';
import Category from './categoryModel';

interface ISaleOff extends Document {
  percentage: number;
  startDate: Date;
  endDate: Date;
}

const saleOffSchema = new Schema<ISaleOff>({
  percentage: {
    type: Number,
    default: 0,
  },
  startDate: {
    type: Date,
  },
  endDate: {
    type: Date,
  },
});

interface IVariant extends Document {
  _id: mongoose.Schema.Types.ObjectId;
  name: string;
  sku: string;
  specifications: Map<string, string>;
  saleOff: ISaleOff;
  price: number;
  cost: number;
  stock: number;
  images: string[];
  sold?: number;
  weight?: number;
  saleOffPrice: number;
  finalPrice: number;
}

const variantsSchema = new Schema<IVariant>(
  {
    name: {
      type: String,
      required: [true, 'Variant name is required'],
      trim: true,
    },
    sku: {
      type: String,
      required: [true, 'Variant sku is required'],
      unique: true,
    },
    specifications: {
      type: Map,
      of: String,
      required: [true, 'Variant specifications is required'],
    },
    saleOff: {
      type: saleOffSchema,
      required: [false, 'Variant sale off is not required'],
    },
    cost: {
      type: Number,
      required: [true, 'Variant cost is required'],
    },
    price: {
      type: Number,
      required: [true, 'Variant price is required'],
    },
    stock: {
      type: Number,
      required: [true, 'Variant stock is required'],
    },
    images: {
      type: [String],
      required: [true, 'Variant images is required'],
      validate: {
        validator: function (v) {
          return v.length > 0;
        },
        message: 'Each variant must have at least 1 image',
      },
    },
    sold: {
      type: Number,
      default: 0,
    },
    weight: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

interface IProduct extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description: string;
  brand: string;
  category: mongoose.Types.ObjectId;
  sold?: number;
  imageCover: string;
  variants: IVariant[];
  lowestPrice?: number;
  rating?: number;
  ratingsQuantity?: number;
  slug: string;
  _categoryName: string;
  totalStock: number;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
      trim: true,
    },
    brand: {
      type: String,
      required: [true, 'Product brand is required'],
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Product category is required'],
    },
    sold: {
      type: Number,
      default: 0,
    },
    imageCover: {
      type: String,
      required: [true, 'Product imageCover is required'],
    },
    variants: [variantsSchema],
    lowestPrice: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 0,
      min: [0, 'Rating must be above 0'],
      max: [5, 'Rating must be below 5'],
      set: (value: number) => Math.round(value * 10) / 10,
    },
    ratingsQuantity: {
      type: Number,
      default: 0,
    },
    slug: {
      type: String,
      unique: true,
    },
    _categoryName: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

productSchema.index({ lowestPrice: 1 });
productSchema.index({ lowestPrice: 1, rating: -1 });
productSchema.index({ sold: -1 });
productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ category: 1, lowestPrice: 1 });
productSchema.index({ name: 'text', brand: 'text', description: 'text' });
productSchema.index({ slug: 1 });

productSchema.statics.getPriceRange = async function (categoryId) {
  return this.aggregate([
    { $match: { category: categoryId } },
    {
      $group: {
        _id: null,
        minPrice: { $min: '$lowestPrice' },
        maxPrice: { $max: '$lowestPrice' },
      },
    },
  ]);
};

// Pre-save middleware to create a slug
productSchema.pre<IProduct>('save', async function (next) {
  let slug = slugify(this.name, { lower: true, strict: true });
  let count = 1;

  const originalSlug = slug;
  while (await Product.findOne({ slug })) {
    slug = `${originalSlug}-${count++}`;
  }
  this.slug = slug;

  next();
});

// Hiện tại slug chỉ được tạo khi tạo mới, không update khi name thay đổi
productSchema.pre<IProduct>('save', async function (next) {
  // Nên kiểm tra nếu name thay đổi thì mới tạo slug mới
  if (this.isModified('name')) {
    let slug = slugify(this.name, { lower: true, strict: true });
    let count = 1;

    const originalSlug = slug;
    while (await Product.findOne({ slug })) {
      slug = `${originalSlug}-${count++}`;
    }
    this.slug = slug;
  }

  next();
});

// Pre-save middleware to update category name in all products
// when the category is modified or a new product is created
productSchema.pre<IProduct>('save', async function (next) {
  if (this.isModified('category') || this.isNew) {
    // Update tất cả Product liên quan khi Category thay đổi
    try {
      const category = await Category.findById(this.category);
      if (!category) {
        return next(new Error('Category not found ' + this.category));
      }

      this._categoryName = category.name;

      await Product.updateMany(
        { category: this.category },
        { _categoryName: this._categoryName }
      );
    } catch (err) {
      return next(err as mongoose.CallbackError);
    }
  }
  next();
});

// Pre-save middleware to calculate the lowest price
productSchema.pre<IProduct>('save', function (next) {
  if (this.variants && this.variants.length > 0) {
    this.lowestPrice = Math.min(
      ...this.variants.map((variant) => variant.finalPrice)
    );
    this.sold = this.variants.reduce((acc, variant) => acc + variant.sold!, 0);
  }

  next();
});

productSchema.pre<IProduct>('save', async function (next) {
  if (this.isModified('category') || this.isNew) {
    try {
      const category = await Category.findById(this.category);
      if (!category) {
        return next(new Error('Category not found ' + this.category)); // Handle missing category gracefully
      }

      this._categoryName = category.name; // Assign category name
    } catch (err) {
      return next(err as mongoose.CallbackError);
    }
  }
  next();
});

productSchema.virtual('reviews', {
  ref: 'Review',
  foreignField: 'product',
  localField: '_id',
});

productSchema.virtual('totalStock').get(function (this: IProduct) {
  return this.variants.reduce(
    (total, variant) => total + (variant.stock || 0),
    0
  );
});

variantsSchema.virtual('saleOffPrice').get(function (this: IVariant) {
  const now = new Date();
  const saleOff = this.saleOff as ISaleOff; // `saleOff` giả định chứa thông tin giảm giá
  console.log(saleOff, now);
  // Kiểm tra nếu đang trong khoảng thời gian sale off
  if (saleOff && saleOff.startDate <= now && now <= saleOff.endDate) {
    const price = (this.price * saleOff.percentage) / 100;
    return Math.round(price / 100) * 100; // Giá sau giảm
  }
  return null; // Không có giảm giá
});

variantsSchema.virtual('finalPrice').get(function (this: IVariant) {
  const saleOffPrice = this.saleOffPrice; // Lấy giá giảm từ virtual field
  if (saleOffPrice) {
    return this.price - saleOffPrice; // Nếu có giảm giá, dùng giá đã giảm
  }
  return this.price; // Nếu không, dùng giá gốc
});

productSchema.pre<Query<IProduct, IProduct>>(/^find/, function (next) {
  const filter = this.getFilter();

  if (!filter.categoryName) {
    this.populate({
      path: 'category',
      select: 'name slug',
    });
  }

  next();
});

const Product = mongoose.model<IProduct>('Product', productSchema);

export default Product;
