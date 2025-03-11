import mongoose, { Document, Schema, Query, Types } from 'mongoose';
import validator from 'validator';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import './shippingAddressModel';
import './wishlistModel';

interface IUser extends Document {
  name: string;
  email: string;
  photo: {
    publicId?: string;
    url?: string;
  };
  gender?: 'male' | 'female' | 'other';
  dob?: Date;
  emailVerified?: boolean;
  role?: 'user' | 'admin';
  password: string;
  passwordConfirm: string | undefined;
  passwordChangedAt?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  otp?: string;
  otpExpires?: Date;
  active?: boolean;
  otpRequests?: number;
  otpLastRequest?: Date;
  wishlistId?: Types.ObjectId;
  correctPassword(
    candidatePassword: string,
    userPassword: string
  ): Promise<boolean>;
  changedPasswordAfter(JWTTimestamp: number): boolean;
  createPasswordResetToken(): string;
  createOTP(): string;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Please tell us your name!'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please provide your email!'],
      unique: true,
      validate: [validator.isEmail, 'Please provide a valid email!'],
    },
    photo: {
      publicId: {
        type: String,
        default: 'avatars/test-public-id',
      },
      url: {
        type: String,
        default: '/dev-users/default.png',
      },
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
    },
    dob: Date,
    emailVerified: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    password: {
      type: String,
      required: [true, 'Please provide a password!'],
      minlength: 8,
      select: false,
    },
    passwordConfirm: {
      type: String,
      required: [true, 'Please confirm your password!'],
      validate: {
        validator: function (el) {
          return el === this.password;
        },
        message: 'Passwords are not the same!',
      },
    },
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    otp: {
      type: String,
      select: false,
    },
    otpExpires: Date,
    active: {
      type: Boolean,
      default: true,
      select: false,
    },
    otpRequests: {
      type: Number,
      default: 0,
    },
    otpLastRequest: {
      type: Date,
    },
    wishlistId: {
      type: Schema.Types.ObjectId,
      ref: 'Wishlist',
    },
  },
  { timestamps: true }
);

userSchema.pre<IUser>('find', function (next) {
  this.populate({
    path: 'wishlistId',
    select: 'products shared shareCode',
  });

  next();
});

userSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, 12);
  this.passwordConfirm = undefined;

  next();
});

userSchema.pre('save', function (next) {
  if (!this.isModified('password') || this.isNew) return next();

  this.passwordChangedAt = new Date(Date.now() - 1000);
  next();
});

userSchema.pre<Query<IUser, IUser>>(/^find/, function (next) {
  this.find({ active: { $ne: false } });
  next();
});

userSchema.methods.correctPassword = async function (
  candidatePassword: string,
  userPassword: string
): Promise<boolean> {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = function (
  JWTTimestamp: number
): boolean {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      (this.passwordChangedAt.getTime() / 1000).toString(),
      10
    );

    return JWTTimestamp < changedTimestamp;
  }

  return false;
};

userSchema.methods.createPasswordResetToken = function (): string {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

userSchema.methods.createOTP = function (): string {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  this.otp = crypto.createHash('sha256').update(otp).digest('hex');

  this.otpExpires = new Date(Date.now() + 10 * 60 * 1000);

  return otp;
};

const User = mongoose.model<IUser>('User', userSchema);

export default User;
