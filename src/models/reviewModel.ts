import mongoose, { Document, Query, Schema } from 'mongoose';
import Product from './productModel';
import Order from './orderModel';

interface IReview extends Document {
  review: string;
  rating: number;
  product: mongoose.Schema.Types.ObjectId;
  user: mongoose.Schema.Types.ObjectId;
  variant: mongoose.Schema.Types.ObjectId;
  order?: mongoose.Schema.Types.ObjectId;
  images?: string[];
  video?: string;
}

interface IReviewModel extends mongoose.Model<IReview> {
  calcAverageRatings(productId: mongoose.Schema.Types.ObjectId): Promise<void>;
}

interface IReviewQuery extends Query<IReview, IReview> {
  r?: IReview | null;
}

const reviewSchema = new Schema<IReview>(
  {
    review: {
      type: String,
      trim: true,
      default: '',
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: [true, 'Rating is required!'],
    },
    product: {
      type: mongoose.Schema.ObjectId,
      ref: 'Product',
      required: [true, 'Review must belong to a product!'],
    },
    variant: {
      type: mongoose.Schema.ObjectId,
      ref: 'Product.variants',
    },
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'Review must belong to a user!'],
    },
    order: {
      type: mongoose.Schema.ObjectId,
      ref: 'Order',
    },
    images: [String],
    video: String,
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
  }
);

reviewSchema.pre<Query<IReview, IReview>>(/^find/, function (next) {
  this.populate({
    path: 'user',
    select: 'name photo',
  });

  next();
});

reviewSchema.statics.calcAverageRatings = async function (
  productId: mongoose.Types.ObjectId,
  session?: mongoose.ClientSession
) {
  const stats = await this.aggregate([
    {
      $match: { product: productId },
    },
    {
      $group: {
        _id: '$product',
        nRating: { $sum: 1 },
        avgRating: { $avg: '$rating' },
      },
    },
  ]);

  if (stats.length > 0) {
    await Product.findByIdAndUpdate(productId, {
      ratingsQuantity: stats[0].nRating,
      rating: stats[0].avgRating,
    });
  } else {
    await Product.findByIdAndUpdate(
      productId,
      {
        ratingsQuantity: 0,
        rating: 0,
      },
      { session }
    );
  }
};

reviewSchema.post('save', async function (doc) {
  (doc.constructor as IReviewModel).calcAverageRatings(this.product);

  const order = await Order.findOne({
    user: this.user,
    _id: this.order,
  });

  if (order) {
    order.reviewCount += 1;

    order.lineItems.forEach((item) => {
      if (item.product.toString() === this.product.toString()) {
        item.review = doc._id as mongoose.Types.ObjectId;
      }
    });

    await order.save();
  }
});

reviewSchema.pre<IReviewQuery>(/^findOneAnd/, async function (next) {
  this.r = await this.findOne().clone();
  next();
});

reviewSchema.post(/^findOneAnd/, async function (doc) {
  if (!doc) return;

  await doc.constructor.calcAverageRatings(doc.product);

  const order = await Order.findOne({
    user: doc.user,
    _id: doc.order,
  });

  if (order) {
    order.reviewCount += 1;

    order.lineItems.forEach((item) => {
      if (item.product.toString() === doc.product.toString()) {
        item.review = doc._id as mongoose.Types.ObjectId;
      }
    });

    await order.save();
  }
});

const Review = mongoose.model<IReview, IReviewModel>('Review', reviewSchema);

export default Review;
