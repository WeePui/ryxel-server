import { Request, Response, NextFunction } from 'express';
import NotificationService from '../utils/notificationService';
import AppError from '../utils/AppError';
import UserToken from '../models/userTokenModel';

const notificationService = NotificationService.getInstance();

export const registerToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, platform, deviceInfo } = req.body;
    const userId = req.user.id;
    if (!userId || !token || !platform) {
      throw new AppError('Missing required fields', 400);
    }
    await notificationService.registerToken(userId, token, platform, deviceInfo);
    res.status(200).json({ message: 'Token registered successfully' });
  } catch (err) {
    next(err);
  }
};

export const unregisterToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;
    if (!token) throw new AppError('Token is required', 400);
    await notificationService.unregisterToken(token);
    res.status(200).json({ message: 'Token unregistered successfully' });
  } catch (err) {
    next(err);
  }
};

export const sendToUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, payload } = req.body;
    if (!userId || !payload?.title || !payload?.body) {
      throw new AppError('Invalid payload', 400);
    }
    const result = await notificationService.sendToUser({ userId, payload });
    res.status(200).json({ message: 'Notification sent', result });
  } catch (err) {
    next(err);
  }
};

export const sendToTokens = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tokens, payload } = req.body;
    if (!Array.isArray(tokens) || tokens.length === 0 || !payload?.title || !payload?.body) {
      throw new AppError('Invalid payload', 400);
    }
    const result = await notificationService.sendToTokens({ tokens, payload });
    res.status(200).json({ message: 'Notification sent', result });
  } catch (err) {
    next(err);
  }
};

export const sendToAllUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, body, data, imageUrl } = req.body;
    if (!title || !body) {
      throw new AppError('Title and body are required', 400);
    }
    const result = await notificationService.sendToAllUsers({ title, body, data, imageUrl });
    res.status(200).json({ message: 'Notification sent to all users', result });
  } catch (err) {
    next(err);
  }
};

export const getAllTokens = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tokens = await UserToken.find({ isActive: true }).select('fcmToken user').populate('user', 'name email');
    res.status(200).json({ message: 'All tokens', tokens });
  } catch (err) {
    next(err);
  }
};