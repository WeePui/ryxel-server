import validator from 'validator';
import mongoose, { Document, Schema } from 'mongoose';

interface IShippingAddress extends Document {
  _id: mongoose.Schema.Types.ObjectId;
  user: mongoose.Schema.Types.ObjectId;
  fullname: string;
  phoneNumber: string;
  country?: string;
  city: {
    name: string;
    code: number;
  };
  district: {
    name: string;
    code: number;
  };
  ward: {
    name: string;
    code: string;
  };
  address: string;
  addressInfo?: string;
  isDefault?: boolean;
}

const shippingAddressSchema = new Schema<IShippingAddress>({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  fullname: {
    type: String,
    required: [true, 'Please provide your full name!'],
    trim: true,
  },
  phoneNumber: {
    type: String,
    required: [true, 'Please provide your phone number!'],
    validate: {
      validator: (value: string) => validator.isMobilePhone(value, 'vi-VN'),
      message: 'Please provide a valid phone number!',
    },
  },
  country: {
    type: String,
    default: 'Vietnam',
    trim: true,
  },
  city: {
    name: {
      type: String,
      required: [true, 'Please provide your city (or province)!'],
      trim: true,
    },
    code: {
      type: Number,
      required: [true, 'Please provide your city code!'],
      trim: true,
    },
  },
  district: {
    name: {
      type: String,
      required: [true, 'Please provide your city (or province)!'],
      trim: true,
    },
    code: {
      type: Number,
      required: [true, 'Please provide your city code!'],
      trim: true,
    },
  },
  ward: {
    name: {
      type: String,
      required: [true, 'Please provide your city (or province)!'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Please provide your city code!'],
      trim: true,
    },
  },
  address: {
    type: String,
    required: [true, 'Please provide your address!'],
    trim: true,
  },
  addressInfo: {
    type: String,
    trim: true,
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
});

const ShippingAddress = mongoose.model<IShippingAddress>(
  'ShippingAddress',
  shippingAddressSchema
);

export default ShippingAddress;
