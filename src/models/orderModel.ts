import mongoose, { Document, Schema, Types } from 'mongoose';
import Product from './productModel';
import Review from './reviewModel';

/*interface ICheckout extends Document {
  total: number;
  shippingFee: number;
  discount: number;
}*/

interface IOrderProduct extends Document {
  product: Types.ObjectId;
  variant: Types.ObjectId;
  _itemName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  review?: Types.ObjectId;
}

interface IOrder extends Document {
  user: Types.ObjectId;
  //checkout: ICheckout;
  paymentMethod: string;
  shippingAddress: Types.ObjectId;
  status:
    | 'unpaid'
    | 'pending'
    | 'processing'
    | 'shipped'
    | 'delivered'
    | 'cancelled';
  lineItems: IOrderProduct[];
  subtotal: number;
  total: number;
  shippingFee: number;
  discount: Types.ObjectId;
  discountAmount: number;
  checkout?: {
    paymentId: string;
    checkoutId: string;
    amount: number;
  };
  orderCode: string;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/*const checkoutSchema = new Schema<ICheckout>({
  total: { type: Number },
  shippingFee: { type: Number },
  discount: { type: Number },
});*/

const orderProductSchema = new Schema<IOrderProduct>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  variant: {
    type: Schema.Types.ObjectId,
    ref: 'Product.variants',
    required: true,
  },
  quantity: { type: Number, required: true },
  unitPrice: { type: Number },
  subtotal: { type: Number },
  _itemName: { type: String },
  review: { type: Schema.Types.ObjectId, ref: 'Review' },
});

const orderSchema = new Schema<IOrder>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Order must belong to a user!'],
    },
    paymentMethod: {
      type: String,
      enum: ['zalopay', 'cod', 'stripe'],
      required: [true, 'Order must have a payment!'],
    },
    shippingAddress: {
      type: Schema.Types.ObjectId,
      ref: 'ShippingAddress',
      required: [true, 'Order must have a shipping address!'],
    },
    status: {
      type: String,
      enum: [
        'unpaid',
        'pending',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
      ],
      default: 'pending',
    },
    lineItems: {
      type: [orderProductSchema],
      required: [true, 'Order must have products!'],
    },
    total: {
      type: Number,
      required: [true, 'Order must have a subtotal!'],
      default: 0,
    },
    subtotal: {
      type: Number,
      required: [true, 'Order must have a subtotal!'],
      default: 0,
    },
    shippingFee: {
      type: Number,
      required: [true, 'Order must have a shipping fee!'],
      default: 0,
    },
    discount: {
      type: Schema.Types.ObjectId,
      ref: 'Discount',
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    checkout: {
      paymentId: { type: String },
      checkoutId: { type: String },
      amount: { type: Number },
    },
    orderCode: {
      type: String,
      unique: true,
    },
    reviewCount: {
      type: Number,
      default: 0,
      max: 2,
    },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: 1 });
orderSchema.index({ updatedAt: 1 });
orderSchema.index({ orderCode: 1 });

orderSchema.pre<IOrder>('find', async function (next) {
  this.populate({
    path: 'lineItems.review',
    select: 'rating review images video',
  });

  next();
});

orderSchema.pre<IOrder>('save', async function (next) {
  // Generate an order code
  if (!this.orderCode) {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const userSuffix = this.user.toString().slice(-4).toUpperCase();
    const randomNumber = Math.floor(10 + Math.random() * 90);

    this.orderCode = `ORD-${today}-${userSuffix}-${randomNumber}`;
  }
  next();
});

orderSchema.pre<IOrder>('save', async function (next) {
  // Initialize the total and shippingFee
  this.subtotal = 0;

  // Loop through the lineItems to calculate the subtotal for each variant
  for (const item of this.lineItems) {
    const product = await Product.findById(item.product);

    if (!product) {
      throw new Error('Product ' + item.product.toString() + ' not found');
    }

    item._itemName = product.name;

    // Compare the string representations of the ObjectIds
    const variant = product.variants.find(
      (v) => v._id.toString() === item.variant.toString()
    );
    if (variant) {
      item.unitPrice = variant.price;
      item.subtotal = item.unitPrice * item.quantity;
      this.subtotal += item.subtotal;
    } else {
      throw new Error('Variant ' + item.variant.toString() + ' not found');
    }
  }

  this.total = this.subtotal + this.shippingFee - (this.discountAmount || 0);

  next();
});

const Order = mongoose.model<IOrder>('Order', orderSchema);

export default Order;
