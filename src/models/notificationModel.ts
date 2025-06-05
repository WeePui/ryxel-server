import mongoose, { Document, Schema, Types } from "mongoose";

export interface INotification extends Document {
  userId: Types.ObjectId;
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string;
  type:
    | "order_created"
    | "order_status_updated"
    | "order_shipped"
    | "order_delivered"
    | "order_cancelled"
    | "promotion"
    | "general";
  orderId?: Types.ObjectId;
  orderCode?: string;
  isRead: boolean;
  sentAt: Date;
  readAt?: Date;
  fcmMessageId?: string;
  markAsRead(): Promise<INotification>;
}

export interface INotificationModel extends mongoose.Model<INotification> {
  markMultipleAsRead(
    notificationIds: string[],
    userId: string
  ): Promise<mongoose.UpdateWriteOpResult>;
  getUnreadCount(userId: string): Promise<number>;
  getUserNotifications(
    userId: string,
    page?: number,
    limit?: number,
    type?: string
  ): Promise<INotification[]>;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Notification title is required"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    body: {
      type: String,
      required: [true, "Notification body is required"],
      trim: true,
      maxlength: [500, "Body cannot exceed 500 characters"],
    },
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    imageUrl: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: [
        "order_created",
        "order_status_updated",
        "order_shipped",
        "order_delivered",
        "order_cancelled",
        "promotion",
        "general",
      ],
      required: [true, "Notification type is required"],
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
    },
    orderCode: {
      type: String,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    readAt: {
      type: Date,
    },
    fcmMessageId: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
notificationSchema.index({ userId: 1, sentAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1, sentAt: -1 });
notificationSchema.index({ type: 1, sentAt: -1 });

// Virtual for order details
notificationSchema.virtual("order", {
  ref: "Order",
  localField: "orderId",
  foreignField: "_id",
  justOne: true,
});

// Mark notification as read
notificationSchema.methods.markAsRead = function () {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

// Static method to mark multiple notifications as read
notificationSchema.statics.markMultipleAsRead = function (
  notificationIds: string[],
  userId: string
) {
  return this.updateMany(
    {
      _id: { $in: notificationIds },
      userId: userId,
      isRead: false,
    },
    {
      isRead: true,
      readAt: new Date(),
    }
  );
};

// Static method to get unread count for user
notificationSchema.statics.getUnreadCount = function (userId: string) {
  return this.countDocuments({ userId: userId, isRead: false });
};

// Static method to get user notifications with pagination
notificationSchema.statics.getUserNotifications = function (
  userId: string,
  page: number = 1,
  limit: number = 20,
  type?: string
) {
  const query: any = { userId };
  if (type) query.type = type;

  const skip = (page - 1) * limit;

  return this.find(query)
    .sort({ sentAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("order", "orderCode status totalAmount")
    .lean();
};

// Auto-delete old notifications (older than 3 months)
notificationSchema.index(
  { sentAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 90 }
);

const Notification = mongoose.model<INotification, INotificationModel>(
  "Notification",
  notificationSchema
);

export default Notification;
