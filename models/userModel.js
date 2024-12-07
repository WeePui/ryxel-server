const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const ShippingAddress = require('./shippingAddressModel');

const userSchema = new mongoose.Schema(
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
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, 12);
  this.passwordConfirm = undefined;

  next();
});

userSchema.pre('save', function (next) {
  if (!this.isModified('password') || this.isNew) return next();

  this.passwordChangedAt = Date.now() - 1000;
  next();
});

userSchema.pre(/^find/, function (next) {
  this.find({ active: { $ne: false } });
  next();
});

userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );

    return JWTTimestamp < changedTimestamp;
  }

  return false;
};

userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

userSchema.methods.createOTP = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  this.otp = crypto.createHash('sha256').update(otp).digest('hex');

  this.otpExpires = Date.now() + 10 * 60 * 1000;

  return otp;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
