const mongoose = require('mongoose');
const Category = require('./categoryModel');

const variantsSchema = new mongoose.Schema(
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
          return v.length >= 4;
        },
        message: 'Each variant must have at least 4 images',
      },
    },
    sold: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

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
      set: (value) => Math.round(value * 10) / 10,
    },
    ratingsQuantity: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

productSchema.index({ lowestPrice: 1 });
productSchema.index({ lowestPrice: 1, rating: -1 });
productSchema.index({ sold: -1 });
productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ category: 1, lowestPrice: 1 });

// Pre-save middleware to calculate the lowest price
productSchema.pre('save', function (next) {
  if (this.variants && this.variants.length > 0) {
    this.lowestPrice = Math.min(
      ...this.variants.map((variant) => variant.price)
    );
    this.sold = this.variants.reduce((acc, variant) => acc + variant.sold, 0);
  }
  next();
});

productSchema.virtual('reviews', {
  ref: 'Review',
  foreignField: 'product',
  localField: '_id',
});

productSchema.pre(/^find/, function (next) {
  this.populate({ path: 'category', select: 'name' });
  next();
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
