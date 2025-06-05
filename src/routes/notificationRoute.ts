import express from "express";
import {
  registerToken,
  unregisterToken,
  sendToUser,
  sendToTokens,
  sendToAllUsers,
  getAllTokens,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
  getNotificationStats,
  sendPromotionalNotificationController,
  getNotificationHistory,
} from "../controllers/notificationController";
import { protect, restrictTo } from "../controllers/authController";

const router = express.Router();

// Routes for authenticated users
router.use(protect);

// FCM Token management
router.route("/tokens").post(registerToken).delete(unregisterToken);

// User notification management
router.route("/user").get(getUserNotifications).delete(deleteAllNotifications);

router.route("/user/mark-read/:notificationId").patch(markAsRead);

router.route("/user/mark-all-read").patch(markAllAsRead);

router.route("/user/:notificationId").delete(deleteNotification);

// Routes for admin only
router.use(restrictTo("admin"));

// Admin notification management
router.route("/stats").get(getNotificationStats);

router.route("/history").get(getNotificationHistory);

router.route("/promotional").post(sendPromotionalNotificationController);

// Direct messaging (admin only)
router.route("/send").post(sendToUser);

router.route("/send-multiple").post(sendToTokens);

router.route("/send-all").post(sendToAllUsers);

// Token management (admin only)
router.route("/all-tokens").get(getAllTokens);

export default router;
