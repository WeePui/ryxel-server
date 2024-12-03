const User = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { uploadImage, deleteImage } = require('../utils/cloudinaryService');

const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach((el) => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

exports.getAllUsers = catchAsync(async (req, res) => {
  const users = await User.find();

  res.status(200).json({
    status: 'success',
    results: users.length,
    data: {
      users,
    },
  });
});

exports.getUserById = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      user,
    },
  });
});

// For image upload. Request header must be 'Content-Type: multipart/form-data'
exports.updateUser = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      user,
    },
  });
});

exports.deleteUser = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndDelete(req.params.id);

  if (!user) return next(new AppError('No user found with that ID', 404));

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.updateProfile = catchAsync(async (req, res, next) => {
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError(
        'This route is not for password updates. Please use /updatePassword.',
        400
      )
    );
  }

  // Filtered out unwanted fields names that are not allowed to be updated
  const filteredBody = filterObj(req.body, 'name', 'gender');

  const user = await User.findById(req.user.id);

  if (req.file) {
    console.log('here');

    const DEFAULT_PUBLIC_ID = 'avatars/test-public-id';
    const [uploadResult, deleteResult] = await Promise.all([
      uploadImage(req.file.path),
      user.photo.publicId !== DEFAULT_PUBLIC_ID
        ? deleteImage(user.photo.publicId)
        : Promise.resolve('ok'),
    ]);

    if (!uploadResult) return next(new AppError('Error uploading image', 500));

    if (deleteResult.result !== 'ok')
      return next(new AppError('Error deleting image', 500));

    filteredBody.photo = {
      publicId: uploadResult.public_id,
      url: uploadResult.secure_url,
    };
  }

  const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    status: 'success',
    data: {
      user: updatedUser,
    },
  });
});

exports.getProfile = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      user,
    },
  });
});

exports.deleteProfile = catchAsync(async (req, res, next) => {
  await User.findByIdAndUpdate(req.user.id, { active: false });

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
