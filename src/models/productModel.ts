import mongoose, { Document, Query, Schema } from "mongoose";
import "./categoryModel";
import slugify from "slugify";
import Category from "./categoryModel";
import {
  isSaleOfferActive,
  calculateSaleDiscount,
  calculateFinalPrice,
} from "../utils/saleValidation";

export interface ISaleOff extends Document {
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
  dimension: {
    length: number;
    width: number;
    height: number;
  };
}

const variantsSchema = new Schema<IVariant>(
  {
    name: {
      type: String,
      required: [true, "Variant name is required"],
      trim: true,
    },
    sku: {
      type: String,
      required: [true, "Variant sku is required"],
      unique: true,
    },
    specifications: {
      type: Map,
      of: String,
      required: [true, "Variant specifications is required"],
    },
    saleOff: {
      type: saleOffSchema,
    },
    cost: {
      type: Number,
      required: [true, "Variant cost is required"],
    },
    price: {
      type: Number,
      required: [true, "Variant price is required"],
    },
    stock: {
      type: Number,
      required: [true, "Variant stock is required"],
    },
    images: {
      type: [String],
      required: [true, "Variant images is required"],
      validate: {
        validator: function (v) {
          return v.length > 0;
        },
        message: "Each variant must have at least 1 image",
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
    dimension: {
      length: Number,
      width: Number,
      height: Number,
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
  percentageSaleOff: number;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Product description is required"],
      trim: true,
    },
    brand: {
      type: String,
      required: [true, "Product brand is required"],
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Product category is required"],
    },
    sold: {
      type: Number,
      default: 0,
    },
    imageCover: {
      type: String,
      required: [true, "Product imageCover is required"],
    },
    variants: [variantsSchema],
    lowestPrice: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 0,
      min: [0, "Rating must be above 0"],
      max: [5, "Rating must be below 5"],
      set: (value: number) => Math.round(value * 10) / 10,
    },
    ratingsQuantity: {
      type: Number,
      default: 0,
    },
    percentageSaleOff: {
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
productSchema.index({ name: "text", brand: "text", description: "text" });
productSchema.index({ slug: 1 });

productSchema.statics.getPriceRange = async function (categoryId) {
  return this.aggregate([
    { $match: { category: categoryId } },
    {
      $group: {
        _id: null,
        minPrice: { $min: "$lowestPrice" },
        maxPrice: { $max: "$lowestPrice" },
      },
    },
  ]);
};

// Pre-save middleware to create a slug
productSchema.pre<IProduct>("save", async function (next) {
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
productSchema.pre<IProduct>("save", async function (next) {
  // Nên kiểm tra nếu name thay đổi thì mới tạo slug mới
  if (this.isModified("name")) {
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
productSchema.pre<IProduct>("save", async function (next) {
  if (this.isModified("category") || this.isNew) {
    // Update tất cả Product liên quan khi Category thay đổi
    try {
      const category = await Category.findById(this.category);
      if (!category) {
        return next(new Error("Category not found " + this.category));
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

productSchema.pre<IProduct>("save", function (next) {
  if (this.variants && this.variants.length > 0) {
    // Tìm variant có giá thấp nhất và lấy percentage của nó trong một lần duyệt
    const { lowestPrice, percentageSaleOff } = this.variants.reduce(
      (acc, variant) => {
        const finalPrice = variant.finalPrice || 0;
        if (
          finalPrice < acc.lowestPrice &&
          finalPrice == variant.price &&
          variant.saleOff.endDate > new Date()
        ) {
          return {
            lowestPrice: finalPrice,
            percentageSaleOff: variant.saleOff?.percentage || 0,
          };
        }
        return acc;
      },
      { lowestPrice: Infinity, percentageSaleOff: 0 }
    );

    this.lowestPrice = lowestPrice;
    this.percentageSaleOff = percentageSaleOff;
    this.sold = this.variants.reduce((acc, variant) => acc + variant.sold!, 0);
  }

  next();
});

productSchema.virtual("reviews", {
  ref: "Review",
  foreignField: "product",
  localField: "_id",
});

productSchema.virtual("totalStock").get(function (this: IProduct) {
  if (!this.variants || !Array.isArray(this.variants)) {
    return 0;
  }
  return this.variants.reduce(
    (total, variant) => total + (variant.stock || 0),
    0
  );
});

variantsSchema.virtual("saleOffPrice").get(function (this: IVariant) {
  return calculateSaleDiscount(this.price, this.saleOff);
});

variantsSchema.virtual("finalPrice").get(function (this: IVariant) {
  return calculateFinalPrice(this.price, this.saleOff);
});

productSchema.pre<Query<IProduct, IProduct>>(/^find/, function (next) {
  const filter = this.getFilter();

  if (!filter.categoryName) {
    this.populate({
      path: "category",
      select: "name slug",
    });
  }

  next();
});

export function updateProductPricing(product: IProduct): IProduct {
  let lowestPrice = Infinity;
  let percentageSaleOff = 0;
  let totalSold = 0;

  // Check if variants exist and is an array
  if (!product.variants || !Array.isArray(product.variants)) {
    return product;
  }

  for (const variant of product.variants) {
    const finalPrice = calculateFinalPrice(variant.price, variant.saleOff);
    const isOnSale = isSaleOfferActive(variant.saleOff);

    // Assign finalPrice manually if not using virtual
    (variant as any).finalPrice = finalPrice;
    if (finalPrice < lowestPrice) {
      lowestPrice = finalPrice;
      percentageSaleOff =
        isOnSale && variant.saleOff ? variant.saleOff.percentage : 0;
    }

    totalSold += variant.sold ?? 0;
  }

  product.lowestPrice = lowestPrice;
  product.percentageSaleOff = percentageSaleOff;
  product.sold = totalSold;

  return product;
}

const Product = mongoose.model<IProduct>("Product", productSchema);

export default Product;
