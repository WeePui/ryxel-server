const ShippingAddress = require('../models/shippingAddressModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const mongoose = require('mongoose');

exports.getUserShippingAddress = catchAsync(async (req, res, next) => {
  const addresses = await ShippingAddress.find({ user: req.user.id });

  res.status(200).json({
    status: 'success',
    results: addresses.length,
    data: {
      addresses,
    },
  });
});

exports.addShippingAddress = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      fullname,
      phoneNumber,
      country,
      ward,
      city,
      district,
      address,
      addressInfo,
      isDefault,
    } = req.body;

    // Check if isDefault is true and update existing default address
    if (isDefault) {
      await ShippingAddress.updateMany(
        { user: req.user.id, isDefault: true },
        { isDefault: false },
        { session }
      );
    }

    const newShippingAddress = await ShippingAddress.create(
      [
        {
          user: req.user.id,
          fullname,
          phoneNumber,
          country,
          ward,
          city,
          district,
          address,
          addressInfo,
          isDefault,
        },
      ],
      { session }
    );

    if (!newShippingAddress) {
      throw new AppError('Failed to add shipping address', 500);
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      status: 'success',
      data: {
        address: newShippingAddress,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return next(new AppError(error.messagge, 500));
  }
});

exports.updateShippingAddress = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      fullname,
      phoneNumber,
      country,
      ward,
      city,
      district,
      address,
      addressInfo,
      isDefault,
    } = req.body;

    // Check if isDefault is true and update existing default address
    if (isDefault) {
      await ShippingAddress.updateMany(
        { user: req.user.id, isDefault: true },
        { isDefault: false },
        { session }
      );
    }

    const updatedShippingAddress = await ShippingAddress.findByIdAndUpdate(
      req.params.id,
      {
        fullname,
        phoneNumber,
        country,
        ward,
        city,
        district,
        address,
        addressInfo,
        isDefault,
      },
      { new: true, runValidators: true, session }
    );

    if (!updatedShippingAddress) {
      throw new AppError('Shipping address not found', 404);
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      status: 'success',
      data: {
        address: updatedShippingAddress,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return next(new AppError(error.messagge, 500));
  }
});

exports.deleteShippingAddress = catchAsync(async (req, res, next) => {
  const shippingAddress = await ShippingAddress.findByIdAndDelete(
    req.params.id
  );

  if (!shippingAddress) {
    return next(new AppError('Shipping address not found', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.setDefaultShippingAddress = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    // Update existing default address to false
    await ShippingAddress.updateMany(
      { user: req.user.id, isDefault: true },
      { isDefault: false },
      { session }
    );

    // Set the selected address as default
    const updatedAddress = await ShippingAddress.findByIdAndUpdate(
      id,
      { isDefault: true },
      { new: true, runValidators: true, session }
    );

    if (!updatedAddress) {
      throw new AppError('Shipping address not found', 404);
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      status: 'success',
      data: {
        address: updatedAddress,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.log(error);

    return next(new AppError(error.messagge, 500));
  }
});
