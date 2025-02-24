import mongoose, { Document, Schema, Types } from 'mongoose';

interface ICheckout extends Document {
  total: number;
  shippingFee: number;
  discount: number;
}

interface IPayment extends Document {
  method: string;
  transactionId: string;
}

interface IOrderProduct extends Document {
  product: Types.ObjectId;
  variant: Types.ObjectId;
  quantity: number;
}

interface IOrder extends Document {
  user: Types.ObjectId;
  checkout: ICheckout;
  payment: IPayment;
  shippingAddress: Types.ObjectId;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  products: IOrderProduct[];
  createdAt: Date;
  updatedAt: Date;
}

const checkoutSchema = new Schema<ICheckout>({
  total: { type: Number },
  shippingFee: { type: Number },
  discount: { type: Number },
});

const paymentSchema = new Schema<IPayment>({
  method: { type: String },
  transactionId: { type: String },
});

const orderProductSchema = new Schema<IOrderProduct>({
  product: { type: Schema.Types.ObjectId, ref: 'Product' },
  variant: { type: Schema.Types.ObjectId, ref: 'Product.variants' },
  quantity: { type: Number },
});

const orderSchema = new Schema<IOrder>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Order must belong to a user!'],
    },
    checkout: {
      type: checkoutSchema,
      required: [true, 'Order must have a checkout!'],
    },
    payment: {
      // TO BE CHANGED WHEN PAYMENT IS ADDED
      type: paymentSchema,
      required: [true, 'Order must have a payment!'],
    },
    shippingAddress: {
      type: Schema.Types.ObjectId,
      ref: 'ShippingAddress',
      required: [true, 'Order must have a shipping address!'],
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
    },
    products: {
      type: [orderProductSchema],
      required: [true, 'Order must have products!'],
    },
  },
  { timestamps: true }
);

const Order = mongoose.model<IOrder>('Order', orderSchema);

export default Order;
