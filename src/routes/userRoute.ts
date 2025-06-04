import express from "express";
import multer from "multer";
import * as authController from "../controllers/authController";
import * as userController from "../controllers/userController";

const upload = multer({ dest: "uploads/" });
const router = express.Router();

// router.route("/notifications").post(userController.sendPushNotificationHandler);

router.route("/signup").post(authController.signup);
router.route("/login").post(authController.login);
router.route("/logout").get(authController.logout);
router.route("/forgotPassword").post(authController.forgotPassword);
router.route("/resetPassword/:token").patch(authController.resetPassword);
router.route("/verifyToken").post(authController.verifyUserToken);
router.route("/checkEmailExists").post(authController.checkEmailExists);

router.use(authController.protect);

router.route("/sendOTP").post(authController.sendOTP);
router.route("/verifyOTP").post(authController.verifyOTP);
router.route("/updatePassword").patch(authController.updatePassword);
router.route("/profile").get(userController.getProfile);
router.route("/reauthenticate").post(authController.reauthenticate);
router
  .route("/updateProfile")
  .patch(upload.single("photo"), userController.updateProfile);
router.route("/deleteProfile").delete(userController.deleteProfile);

router
  .route("/expo-push-token")
  .patch(userController.saveExpoPushToken)
  .delete(userController.deleteExpoPushToken);

router
  .route("/fcm-token")
  .post(userController.saveFcmToken)
  .delete(userController.deleteFcmToken)
  .get(userController.getFcmTokens);

router.use(authController.restrictTo("admin"));

router.route("/").get(userController.getAllUsers);
router
  .route("/:id")
  .get(userController.getUserById)
  .patch(userController.updateUser)
  .delete(userController.deleteUser);

router.route("/:id/analytics").get(userController.getUserAnalytics);
router.route("/:id/orders").get(userController.getUserOrderHistory);
router.route("/:id/status").patch(userController.updateUserStatus);

export default router;
