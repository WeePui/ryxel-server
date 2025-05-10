import { Request, Response, NextFunction } from 'express';
import AppError from '../utils/AppError';

const sendErrorDev = (error: AppError, req: Request, res: Response) => {
  res.status(error.statusCode).json({
    status: error.status,
    error: error,
    message: error.message,
    stack: error.stack,
  });
};

const sendErrorProd = (error: AppError, req: Request, res: Response) => {
  if (error.isOperational) {
    res.status(error.statusCode).json({
      status: error.status,
      message: error.message,
    });
  } else {
    console.error('ERROR 💥', error);

    res.status(500).json({
      status: 'error',
      message: 'Something went very wrong!',
    });
  }
};

const handleCastErrorDB = (error: any) => {
  const message = `Invalid ${error.path}: ${error.value}.`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (error: any) => {
  const field = Object.keys(error.keyValue)[0];
  const value = error.keyValue[field];
  const message = `Duplicate [${field}] value: "${value}". Please use another value!`;
  return new AppError(message, 400);
};

const handleValidationErrorDB = (error: any) => {
  const errors = Object.values(error.errors).map((el: any) => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

const handleJWTError = () =>
  new AppError('Invalid token. Please log in again!', 401);

const handleJWTExpiredError = () =>
  new AppError('Your token has expired! Please log in again.', 401);

export default (
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.log('Error: ', error);

  error.statusCode = error.statusCode || 500;
  error.status = error.status || 'error';

  if (process.env.NODE_ENV === 'development') sendErrorDev(error, req, res);
  else if (process.env.NODE_ENV === 'production') {
    let err = { ...error };

    if (error.name === 'CastError') error = handleCastErrorDB(err);
    if ((error as any).code === 11000) error = handleDuplicateFieldsDB(err);
    if (error.name === 'ValidationError') error = handleValidationErrorDB(err);
    if (error.name === 'JsonWebTokenError') handleJWTError();
    if (error.name === 'TokenExpiredError') handleJWTExpiredError();

    sendErrorProd(error, req, res);
  }
};
