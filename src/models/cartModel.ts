import mongoose, { Schema, Document, Types } from 'mongoose';
import Product from './productModel'; // Adjust the import path as needed

interface ICartProduct {
  product: Types.ObjectId;
  variant: Types.ObjectId;
  quantity: number;
}

interface ICart extends Document {
  user: Types.ObjectId;
  lineItems: ICartProduct[];
  subtotal: number;
}

const cartSchema = new Schema<ICart>({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Cart must belong to a user!'],
  },
  lineItems: [
    {
      product: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
      },
      variant: {
        type: Schema.Types.ObjectId,
        ref: 'Product.variants',
      },
      quantity: {
        type: Number,
        required: [true, 'Quantity is required!'],
      },
    },
  ],
  subtotal: {
    type: Number,
    default: 0,
  },
});

cartSchema.pre<ICart>('save', async function (next) {
  await this.populate('lineItems.product'); // Populate the variant field

  const subtotal = await Promise.all(
    this.lineItems.map(async (item) => {
      const product = await Product.findById(item.product).exec();
      if (product) {
        const variant = product.variants.find(
          (v) => v._id.toString() === item.variant.toString()
        );
        if (variant) {
          return variant.price * item.quantity;
        }
      }
      return 0;
    })
  ).then((prices) => prices.reduce((acc, price) => acc + price, 0));

  this.subtotal = subtotal;

  next();
});

const Cart = mongoose.model<ICart>('Cart', cartSchema);

export default Cart;
