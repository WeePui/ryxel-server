import { Request, Response, NextFunction } from 'express';
import User from '../models/userModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/AppError';
import { uploadImage, deleteImage } from '../utils/cloudinaryService';

const filterObj = (obj: any, ...allowedFields: string[]) => {
  const newObj: any = {};
  Object.keys(obj).forEach((el) => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

export const getAllUsers = catchAsync(async (req: Request, res: Response) => {
  const users = await User.find();

  res.status(200).json({
    status: 'success',
    results: users.length,
    data: {
      users,
    },
  });
});

export const getUserById = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
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
  }
);

// For image upload. Request header must be 'Content-Type: multipart/form-data'
export const updateUser = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
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
  }
);

export const deleteUser = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) return next(new AppError('No user found with that ID', 404));

    res.status(204).json({
      status: 'success',
      data: null,
    });
  }
);

export const updateProfile = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
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

    if (!user) {
      return next(new AppError('No user found with that ID', 404));
    }

    if (req.file) {
      const DEFAULT_PUBLIC_ID = 'avatars/test-public-id';
      console.log(user.photo.publicId === DEFAULT_PUBLIC_ID);
      const [uploadResult, deleteResult] = await Promise.all([
        uploadImage('avatars', req.file.path),
        user.photo.publicId !== DEFAULT_PUBLIC_ID
          ? deleteImage(user.photo.publicId!)
          : Promise.resolve({ result: 'ok' }),
      ]);

      if (!uploadResult)
        return next(new AppError('Error uploading image', 500));

      if (deleteResult.result && deleteResult.result !== 'ok')
        return next(new AppError('Error deleting image', 500));

      filteredBody.photo = {
        publicId: uploadResult.public_id,
        url: uploadResult.secure_url,
      };
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      filteredBody,
      {
        new: true,
        runValidators: true,
      }
    );

    res.status(200).json({
      status: 'success',
      data: {
        user: updatedUser,
      },
    });
  }
);

export const getProfile = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
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
  }
);

export const deleteProfile = catchAsync(async (req: Request, res: Response) => {
  await User.findByIdAndUpdate(req.user.id, { active: false });

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
