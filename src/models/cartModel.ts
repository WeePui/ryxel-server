import mongoose, { Schema, Document, Types } from "mongoose";
import Product from "./productModel"; // Adjust the import path as needed
import { calculateFinalPrice } from "../utils/saleValidation";

interface ICartProduct {
  product: Types.ObjectId;
  variant: Types.ObjectId;
  quantity: number;
}

interface ICart extends Document {
  user: Types.ObjectId;
  lineItems: ICartProduct[];
  subtotal: number;
  removeCartItems: (
    items: { product: Types.ObjectId; variant: Types.ObjectId }[]
  ) => Promise<void>;
}

const cartSchema = new Schema<ICart>({
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: [true, "Cart must belong to a user!"],
  },
  lineItems: [
    {
      product: {
        type: Schema.Types.ObjectId,
        ref: "Product",
      },
      variant: {
        type: Schema.Types.ObjectId,
        ref: "Product.variants",
      },
      quantity: {
        type: Number,
        required: [true, "Quantity is required!"],
      },
    },
  ],
  subtotal: {
    type: Number,
    default: 0,
  },
});

cartSchema.methods.removeCartItems = async function (
  items: { product: Types.ObjectId; variant: Types.ObjectId }[]
) {
  for (const { product, variant } of items) {
    const index = this.lineItems.findIndex(
      (item: ICartProduct) =>
        item.product.toString() === product.toString() &&
        item.variant.toString() === variant.toString()
    );
    if (index > -1) {
      this.lineItems.splice(index, 1);
    }
  }

  await this.save();
};


cartSchema.pre<ICart>("save", async function (next) {
  await this.populate("lineItems.product"); // Populate the variant field

  const subtotal = await Promise.all(
    this.lineItems.map(async (item) => {
      const product = await Product.findById(item.product).exec();
      if (product) {
        const variant = product.variants.find(
          (v) => v._id.toString() === item.variant.toString()
        );
        if (variant) {
          // Use calculateFinalPrice to get the correct price including time-validated discounts
          const price = calculateFinalPrice(variant.price, variant.saleOff);
          return price * item.quantity;
        }
      }
      return 0;
    })
  ).then((prices) => prices.reduce((acc, price) => acc + price, 0));

  this.subtotal = subtotal;

  next();
});

const Cart = mongoose.model<ICart>("Cart", cartSchema);

export default Cart;
