import mongoose, { Document, Schema, Types } from 'mongoose';

/*interface ICheckout extends Document {
  total: number;
  shippingFee: number;
  discount: number;
}*/

interface IOrderProduct extends Document {
  product: Types.ObjectId;
  variant: Types.ObjectId;
  quantity: number;
  unitPrice: number;
}

interface IOrder extends Document {
  user: Types.ObjectId;
  //checkout: ICheckout;
  paymentMethod: String;
  shippingAddress: Types.ObjectId;
  status:
    | 'unpaid'
    | 'pending'
    | 'processing'
    | 'shipped'
    | 'delivered'
    | 'cancelled';
  lineItems: IOrderProduct[];
  createdAt: Date;
  updatedAt: Date;
}

/*const checkoutSchema = new Schema<ICheckout>({
  total: { type: Number },
  shippingFee: { type: Number },
  discount: { type: Number },
});*/

const orderProductSchema = new Schema<IOrderProduct>({
  product: { type: Schema.Types.ObjectId, ref: 'Product' },
  variant: { type: Schema.Types.ObjectId, ref: 'Product.variants' },
  quantity: { type: Number },
  unitPrice: { type: Number },
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
  },
  { timestamps: true }
);

const Order = mongoose.model<IOrder>('Order', orderSchema);

export default Order;
