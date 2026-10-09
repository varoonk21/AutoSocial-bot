import mongoose, { Document } from "mongoose";

export type NotificationType =
  | "post_published"
  | "post_failed"
  | "token_expiring"
  | "info";

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  postId?: mongoose.Types.ObjectId;
  integrationId?: mongoose.Types.ObjectId;
  read: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const NotificationSchema = new mongoose.Schema<INotification>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["post_published", "post_failed", "token_expiring", "info"],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post" },
    integrationId: { type: mongoose.Schema.Types.ObjectId, ref: "Integration" },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);

NotificationSchema.index({ userId: 1, createdAt: -1 });

const Notification = mongoose.model<INotification>("Notification", NotificationSchema);

export default Notification;
