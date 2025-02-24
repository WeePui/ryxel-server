import mongoose, { Document, Schema, Types } from 'mongoose';

interface IDiscount extends Document {
  code: string;
  name: string;
  startDate: Date;
  endDate: Date;
  maxUse: number;
  minOrderValue: number;
  discountPercentage: number;
  discountMaxValue: number;
  maxUsePerUser: number;
  usedUser: Types.ObjectId[];
  isActive: boolean;
}

const discountSchema = new Schema<IDiscount>(
  {
    code: {
      type: String,
      required: [true, 'Discount code is required'], // IS UPPERCASE
    },
    name: {
      type: String,
      required: [true, 'Discount name is required'],
      trim: true,
    },
    startDate: {
      type: Date,
      required: [true, 'Discount start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'Discount end date is required'],
    },
    maxUse: {
      type: Number,
      required: [true, 'Discount max uses is required'],
      default: 1,
    }, // number of times this discount code can be used
    minOrderValue: {
      type: Number,
      required: [true, 'Minimum order value is required'],
      default: 0,
    }, // minimum order value
    discountPercentage: {
      type: Number,
      required: [true, 'Discount percentage is required'],
      min: [1, 'Discount percentage must be above 0'],
      max: [100, 'Discount percentage must be below 100'],
    }, // percentage of discount
    discountMaxValue: {
      type: Number,
      required: [true, 'Discount max value is required'],
    }, // max value of discount
    maxUsePerUser: {
      type: Number,
      required: [true, 'Discount max use per user is required'],
      default: 1,
    }, // number of times this discount code can be used by one user
    usedUser: [{
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: [],
    }], // A collection contains all user id who used this discount
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const Discount = mongoose.model<IDiscount>('Discount', discountSchema);
export  { IDiscount };  
export default Discount;
