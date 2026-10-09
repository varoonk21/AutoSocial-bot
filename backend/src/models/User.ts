import mongoose, { Document } from "mongoose";

export interface INotifications {
  postPublished: boolean;
  postFailed: boolean;
  tokenExpiring: boolean;
}

export interface IUser extends Document {
  email: string;
  name?: string;
  picture?: string;
  activated: boolean;
  isSuperAdmin: boolean;
  notifications: INotifications;
  createdAt?: Date;
  updatedAt?: Date;
}

const UserSchema = new mongoose.Schema<IUser>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String },
    picture: { type: String },
    activated: { type: Boolean, default: true },
    isSuperAdmin: { type: Boolean, default: false },
    notifications: {
      postPublished: { type: Boolean, default: true },
      postFailed: { type: Boolean, default: true },
      tokenExpiring: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

UserSchema.index({ email: 1 }, { unique: true });

const User = mongoose.model<IUser>("User", UserSchema);

export default User;
