import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/AppError';
import User from '../models/userModel';
import signToken from '../utils/signToken';
import sendEmail from '../utils/email';
import verifyToken from '../utils/verifyToken';

const createSendToken = (user: any, statusCode: number, res: Response) => {
  // Sign new token for the user
  const token = signToken(user._id);
  const cookieOptions = {
    expires: new Date(
      Date.now() +
        parseInt(process.env.JWT_COOKIE_EXPIRES_IN!) * 24 * 60 * 60 * 1000
    ), // Expires in 90 days
    httpOnly: true, // Cookie cannot be accessed or modified in any way by the browser
    // Temporarily disabled:
    // secure: process.env.NODE_ENV === 'production', // Cookie will only be sent on an encrypted connection
  };

  res.cookie('jwt', token, cookieOptions); // Send the token in a cookie

  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};

export const protect = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    let token;

    // 1. Getting token and check if it's there
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    )
      token = req.headers.authorization.split(' ')[1];
    else if (req.cookies && req.cookies.jwt) token = req.cookies.jwt;
    else if (req.body.token) token = req.body.token;

    if (!token) {
      return next(
        new AppError('You are not logged in! Please log in to get access.', 401)
      );
    }

    // 2. Verification token
    const { valid, expired, decoded } = await verifyToken(token);

    if (!valid) {
      return next(
        new AppError(
          expired
            ? 'Your session has expired. Please log in again.'
            : 'Invalid token. Please log in again.',
          401
        )
      );
    }
    // 3. Check if user still exists
    const user = await User.findById(decoded.id);
    if (!user)
      return next(
        new AppError(
          'The user belonging to this token does no longer exist.',
          401
        )
      );

    // 4. Check if user changed password after the token was issued
    if (user.changedPasswordAfter(decoded.iat)) {
      return next(
        new AppError(
          'User recently changed password! Please log in again.',
          401
        )
      );
    }

    req.user = user;
    next();
  }
);

export const restrictTo = (...roles: string[]) => {
  // roles is an array ['admin', 'user']
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action.', 403)
      );
    }

    next();
  };
};

export const checkEmailExists = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return next(new AppError('Email is already in use.', 400));
    }

    res.status(200).json({ status: 'success', message: 'Email is available.' });
  }
);

export const verifyUserToken = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { token } = req.body;

    if (!token) {
      return next(new AppError('Token is required', 400));
    }

    const { valid, expired, decoded } = await verifyToken(token);

    const user = await User.findById(decoded.id);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    res.status(200).json({ valid, expired, isAdmin: user.role === 'admin' });
  }
);

export const logout = (req: Request, res: Response) => {
  // Send a new cookie with the same name and an expired date
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.status(200).json({ status: 'success' });
};

export const signup = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const newUser = await User.create({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      passwordConfirm: req.body.passwordConfirm,
      gender: req.body.gender,
      dob: req.body.dob,
    });

    createSendToken(newUser, 201, res);
  }
);

export const sendOTP = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = await User.findById(req.user.id);

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const now = Date.now();
    if (user.otpLastRequest) {
      // Only 3 OTPs can be sent in 1 hour
      const otpLastRequestTime = new Date(user.otpLastRequest).getTime();

      if (now - otpLastRequestTime < 60 * 60 * 1000) {
        if (user.otpRequests! >= 3) {
          return next(
            new AppError(
              'You have reached the maximum number of OTP requests. Please try again later.',
              429 // Too Many Requests
            )
          );
        }
      }
    } else {
      // If 1 hour has passed since the last request, reset the counter
      user.otpRequests = 0;
    }

    const otp = user.createOTP();
    user.otpRequests! += 1;
    user.otpLastRequest = new Date(now); // Update the last request time
    await user.save({ validateBeforeSave: false });

    const message = `Your OTP for email verification is: ${otp}. It is valid for 10 minutes.`;

    try {
      await sendEmail({
        to: user.email,
        subject: 'Email Verification OTP',
        message,
      });

      res.status(200).json({
        status: 'success',
        message: 'OTP sent to your email!',
      });
    } catch (err) {
      // If there is an error sending the email, reset the OTP and the expiry time
      user.otp = undefined;
      user.otpExpires = undefined;
      await user.save({ validateBeforeSave: false });

      return next(
        new AppError(
          'There was an error sending the OTP. Please try again later.',
          500
        )
      );
    }
  }
);

export const verifyOTP = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // Hash the OTP sent by the user
    const { otp } = req.body;
    const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');

    const user = await User.findById(req.user.id).select('+otp +otpExpires');

    if (!user) return next(new AppError('User not found', 404));

    // Check if the OTP is valid and has not expired
    if (
      !user.otp ||
      !user.otpExpires ||
      user.otpExpires.getTime() < Date.now()
    ) {
      return next(new AppError('OTP is invalid or has expired.', 400));
    }

    if (user.otp !== hashedOTP) {
      return next(new AppError('Incorrect OTP. Please try again.', 400));
    }

    // If the OTP is correct, set emailVerified to true and remove the OTP
    user.emailVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;

    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      status: 'success',
      message: 'Email verified successfully!',
    });
  }
);

export const login = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    // 1. Check if email and password exist
    if (!email || !password) {
      return next(new AppError('Please provide email and password!', 400));
    }

    // 2. Check if user exists && password is correct
    const user = await User.findOne({ email }).select('+password');
    if (!user) return next(new AppError('Incorrect email or password', 401));

    const correct = await user.correctPassword(password, user.password);

    if (!correct) return next(new AppError('Incorrect email or password', 401));

    createSendToken(user, 200, res);
  }
);

export const forgotPassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return next(new AppError('There is no user with email address.', 404));
    }

    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });
    const clientHost = process.env.CLIENT_HOST || 'http://localhost:3000';

    const resetURL = `${req.protocol}://${clientHost}/resetPassword/${resetToken}`;

    const message = `Forgot your password? Submit a PATCH request with your new password and passwordConfirm to: ${resetURL}.\nIf you didn't forget your password, please ignore this email!`;

    try {
      await sendEmail({
        to: user.email,
        subject: 'Your password reset token (valid for 10 min)',
        message,
      });

      res.status(200).json({
        status: 'success',
        message: 'Reset token is sent to email!',
      });
    } catch (error) {
      // If there is an error sending the email, reset the token and the expiry time
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });

      return next(
        new AppError(
          'There was an error sending the email. Try again later!',
          500
        )
      );
    }
  }
);

export const resetPassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // 1. Get user based on the token
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return next(new AppError('Token is invalid or has expired', 400));
    }

    // 2. If token has not expired, and there is user, set the new password
    user.password = req.body.password;
    user.passwordConfirm = req.body.passwordConfirm;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await user.save();

    createSendToken(user, 200, res);
  }
);

export const updatePassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { password, passwordConfirm, passwordCurrent } = req.body;
    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const correct = await user.correctPassword(passwordCurrent, user.password);

    if (!correct) {
      return next(new AppError('Your current password is wrong.', 401));
    }

    user.password = password;
    user.passwordConfirm = passwordConfirm;

    await user.save();

    createSendToken(user, 200, res);
  }
);

export const reauthenticate = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { password } = req.body;
    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const correct = await user.correctPassword(password, user.password);

    if (!correct) {
      return next(new AppError('Incorrect password. Please try again.', 401));
    }

    res.status(200).json({
      status: 'success',
    });
  }
);
