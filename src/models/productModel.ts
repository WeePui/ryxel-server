import mongoose, { Document, Schema, Types } from 'mongoose';
import Product from './productModel';
import Review from './reviewModel';
import AppError from '../utils/AppError';

interface IOrderProduct extends Document {
  product: Types.ObjectId;
  variant: Types.ObjectId;
  _itemName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  review?: Types.ObjectId;
}

interface IShippingTracking {
  ghnOrderCode: string;
  trackingStatus: string;
  statusHistory: {
    status: string;
    description: string;
    timestamp: Date;
  }[];
  expectedDeliveryDate?: Date;
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
    | 'cancelled'
    | 'refunded';
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
  shippingTracking?: IShippingTracking;
  orderCode: string;
  reviewCount: number;
  adminNotes: string;
  createdAt: Date;
  updatedAt: Date;
}

interface IOrderModel extends mongoose.Model<IOrder> {
  calculateTotalSales(): Promise<number>;
  getTopProvinces(
    startDate: Date,
    endDate: Date,
    limit: number
  ): Promise<{ name: string; value: number }[]>;
  getOrderStatusCounts(
    startDate: Date,
    endDate: Date
  ): Promise<{ name: string; value: number }[]>;

  getTopProvincesByPurchasingUsers(
    startDate: Date,
    endDate: Date,
    limit: number
  ): Promise<{ name: string; value: number }[]>;
}

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
        'refunded',
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
    shippingTracking: {
      ghnOrderCode: { type: String },
      trackingStatus: { type: String },
      statusHistory: [
        {
          status: { type: String },
          description: { type: String },
          timestamp: { type: Date },
        },
      ],
      expectedDeliveryDate: { type: Date },
    },
    adminNotes: {
      type: String,
      default: '',
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
    const timestamp = Date.now().toString().slice(-5);

    this.orderCode = `ORD-${today}-${userSuffix}-${timestamp}`;
  }
  next();
});

orderSchema.pre<IOrder>('save', async function (next) {
  // Nếu là đơn mới thì không cần ghi log
  if (!this.isModified('status') || (this as any).skipLog) return next();

  const statusMessages: Record<IOrder['status'], string> = {
    unpaid: 'Chưa thanh toán',
    pending: 'Đơn hàng đã được xác nhận',
    processing: 'Đơn hàng đang được xử lý',
    shipped: 'Đã giao cho đơn vị vận chuyển',
    delivered: 'Giao hàng thành công',
    cancelled: 'Đơn hàng đã bị hủy',
    refunded: 'Đơn hàng đã hoàn tiền',
  };

  const logEntry = {
    status: this.status,
    description: statusMessages[this.status],
    timestamp: new Date(),
  };

  if (!this.shippingTracking) {
    this.shippingTracking = {
      ghnOrderCode: '',
      trackingStatus: this.status,
      statusHistory: [logEntry],
      expectedDeliveryDate: undefined,
    };
  } else {
    this.shippingTracking.trackingStatus = this.status;
    this.shippingTracking.statusHistory.push(logEntry);
  }

  next();
});

orderSchema.statics.calculateTotalSales = async function () {
  const result = await this.aggregate([
    {
      $match: {
        status: { $nin: ['unpaid', 'cancelled'] }, // Lọc bỏ đơn hàng unpaid và cancelled
      },
    },
    {
      $group: {
        _id: null, // Không nhóm theo trường nào
        totalSales: { $sum: '$subtotal' }, // Tính tổng trường `total`
      },
    },
  ]);

  return result.length > 0 ? result[0].totalSales : 0; // Nếu không có đơn hàng hợp lệ, trả về 0
};

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
      item.unitPrice = variant.finalPrice;
      item.subtotal = item.unitPrice * item.quantity;
      this.subtotal += item.subtotal;
    } else {
      throw new Error('Variant ' + item.variant.toString() + ' not found');
    }
  }

  this.total = this.subtotal + this.shippingFee - (this.discountAmount || 0);

  next();
});

orderSchema.statics.getTopProvinces = async function (
  startDate: Date,
  endDate: Date,
  limit: number = 5
) {
  return this.aggregate([
    {
      $match: {
        status: { $nin: ['unpaid', 'cancelled'] },
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $lookup: {
        from: 'shippingaddresses',
        localField: 'shippingAddress',
        foreignField: '_id',
        as: 'address',
      },
    },
    { $unwind: '$address' },
    {
      $match: {
        'address.city.name': { $ne: null, $exists: true },
      },
    },
    {
      $group: {
        _id: '$address.city.name',
        value: { $sum: '$subtotal' },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        name: { $ifNull: ['$_id', 'Không xác định'] },
        value: 1,
        count: 1,
      },
    },
    { $sort: { value: -1 } },
    { $limit: limit },
  ]);
};

orderSchema.statics.getTopProvincesByPurchasingUsers = async function (
  startDate: Date,
  endDate: Date,
  limit: number = 6
): Promise<{ name: string; value: number }[]> {
  return this.aggregate([
    {
      $match: {
        status: 'delivered',
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $lookup: {
        from: 'shippingaddresses',
        localField: 'shippingAddress',
        foreignField: '_id',
        as: 'address',
      },
    },
    { $unwind: '$address' },
    {
      $match: {
        'address.city.name': { $ne: null, $exists: true },
      },
    },
    {
      $group: {
        _id: {
          province: '$address.city.name',
          userId: '$user',
        },
      },
    },
    {
      $group: {
        _id: '$_id.province',
        value: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        name: '$_id',
        value: 1,
      },
    },
    {
      $sort: { value: -1 },
    },
    {
      $limit: limit,
    },
  ]);
};

orderSchema.statics.getOrderStatusCounts = async function (
  startDate: Date,
  endDate: Date
) {
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$status',
        value: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        name: '$_id',
        value: 1,
      },
    },
    { $sort: { value: -1 } },
  ]);
};

const Order = mongoose.model<IOrder, IOrderModel>('Order', orderSchema);

export default Order;
