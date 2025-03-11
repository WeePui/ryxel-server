import mongoose, { Query } from 'mongoose';
import User from './userModel';
import Product from './productModel';

interface IWishlist {
  user: mongoose.Types.ObjectId;
  products: mongoose.Types.ObjectId[];
  shareCode?: string;
}

const wishlistSchema = new mongoose.Schema<IWishlist>({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  products: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    },
  ],
  shareCode: {
    type: String,
  },
});

// Calculate the shareCode after create wishlist
wishlistSchema.post('save', async function (doc) {
  if (!doc.shareCode) {
    const shareCode = Math.random().toString(36).substring(7);
    await this.updateOne({ shareCode });
  }
});

wishlistSchema.pre<Query<any, IWishlist>>('find', function (next) {
  this.populate('products');

  next();
});

export default mongoose.model('Wishlist', wishlistSchema);
