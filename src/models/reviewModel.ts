import mongoose, { Document, Query, Schema } from 'mongoose';
import Product from './productModel';

interface IReview extends Document {
  review: string;
  rating: number;
  product: mongoose.Schema.Types.ObjectId;
  user: mongoose.Schema.Types.ObjectId;
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
      required: [true, 'Review cannot be empty!'],
      trim: true,
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
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'Review must belong to a user!'],
    },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
  }
);

reviewSchema.index({ product: 1, user: 1 }, { unique: true });

reviewSchema.pre<Query<IReview, IReview>>(/^find/, function (next) {
  this.populate({
    path: 'user',
    select: 'name photo',
  });

  next();
});

reviewSchema.statics.calcAverageRatings = async function (
  productId: mongoose.Types.ObjectId
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
    await Product.findByIdAndUpdate(productId, {
      ratingsQuantity: 0,
      rating: 0,
    });
  }
};

reviewSchema.post('save', function (doc) {
  (doc.constructor as IReviewModel).calcAverageRatings(this.product);
});

reviewSchema.pre<IReviewQuery>(/^findOneAnd/, async function (next) {
  this.r = await this.findOne().clone();
  next();
});

reviewSchema.post(/^findOneAnd/, async function (doc) {
  if (!doc) return;

  await doc.constructor.calcAverageRatings(doc.product);
});

const Review = mongoose.model('Review', reviewSchema);

export default Review;
