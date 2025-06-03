import User from "../models/userModel";
import { Types } from "mongoose";

/**
 * Check if a user has any valid notification tokens (FCM or Expo)
 * @param userId - The user ID to check
 * @returns Object with token availability information
 */
export const checkUserNotificationTokens = async (
  userId: string | Types.ObjectId
): Promise<{
  hasTokens: boolean;
  hasFcmTokens: boolean;
  hasExpoTokens: boolean;
  totalTokens: number;
}> => {
  try {
    const user = await User.findById(userId).select("fcmTokens expoPushTokens");

    if (!user) {
      return {
        hasTokens: false,
        hasFcmTokens: false,
        hasExpoTokens: false,
        totalTokens: 0,
      };
    }

    const hasFcmTokens = user.fcmTokens && user.fcmTokens.length > 0;
    const hasExpoTokens = user.expoPushTokens && user.expoPushTokens.length > 0;
    const totalTokens =
      (user.fcmTokens?.length || 0) + (user.expoPushTokens?.length || 0);

    return {
      hasTokens: hasFcmTokens || hasExpoTokens,
      hasFcmTokens,
      hasExpoTokens,
      totalTokens,
    };
  } catch (error) {
    console.error("Error checking user notification tokens:", error);
    return {
      hasTokens: false,
      hasFcmTokens: false,
      hasExpoTokens: false,
      totalTokens: 0,
    };
  }
};

/**
 * Get count of users who can receive notifications
 * @returns Statistics about notification-capable users
 */
export const getNotificationCapableUsersStats = async (): Promise<{
  totalActiveUsers: number;
  usersWithFcmTokens: number;
  usersWithExpoTokens: number;
  usersWithAnyTokens: number;
  usersWithoutTokens: number;
}> => {
  try {
    const [
      totalActiveUsers,
      usersWithFcmTokens,
      usersWithExpoTokens,
      usersWithAnyTokens,
    ] = await Promise.all([
      User.countDocuments({ active: true }),
      User.countDocuments({
        active: true,
        fcmTokens: { $exists: true, $ne: [] },
      }),
      User.countDocuments({
        active: true,
        expoPushTokens: { $exists: true, $ne: [] },
      }),
      User.countDocuments({
        active: true,
        $or: [
          { fcmTokens: { $exists: true, $ne: [] } },
          { expoPushTokens: { $exists: true, $ne: [] } },
        ],
      }),
    ]);

    return {
      totalActiveUsers,
      usersWithFcmTokens,
      usersWithExpoTokens,
      usersWithAnyTokens,
      usersWithoutTokens: totalActiveUsers - usersWithAnyTokens,
    };
  } catch (error) {
    console.error("Error getting notification stats:", error);
    return {
      totalActiveUsers: 0,
      usersWithFcmTokens: 0,
      usersWithExpoTokens: 0,
      usersWithAnyTokens: 0,
      usersWithoutTokens: 0,
    };
  }
};

/**
 * Get all users who can receive notifications (have at least one token)
 * @returns Array of user IDs who can receive notifications
 */
export const getNotificationCapableUsers = async (): Promise<string[]> => {
  try {
    const users = await User.find({
      active: true,
      $or: [
        { fcmTokens: { $exists: true, $ne: [] } },
        { expoPushTokens: { $exists: true, $ne: [] } },
      ],
    }).select("_id");

    return users.map((user) => user._id.toString());
  } catch (error) {
    console.error("Error getting notification capable users:", error);
    return [];
  }
};

/**
 * Find user ID by email address
 */
export const getUserIdByEmail = async (
  email: string
): Promise<string | null> => {
  try {
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    }).select("_id");
    return user ? user._id.toString() : null;
  } catch (error) {
    console.error("Error finding user by email:", error);
    return null;
  }
};

/**
 * Find multiple user IDs by email addresses
 */
export const getUserIdsByEmails = async (
  emails: string[]
): Promise<{ email: string; userId: string | null }[]> => {
  try {
    const normalizedEmails = emails.map((email) => email.toLowerCase().trim());
    const users = await User.find({
      email: { $in: normalizedEmails },
    }).select("_id email");

    const userMap = new Map(
      users.map((user) => [user.email, user._id.toString()])
    );

    return normalizedEmails.map((email) => ({
      email,
      userId: userMap.get(email) || null,
    }));
  } catch (error) {
    console.error("Error finding users by emails:", error);
    return emails.map((email) => ({ email, userId: null }));
  }
};

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};
