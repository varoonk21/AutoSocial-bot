import mongoose, { Document } from "mongoose";

export interface IMedia extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  originalName?: string;
  type: "image" | "video";
  source: "user" | "ai";
  fileSize: number;
  key: string;
  thumbnail?: string;
  alt?: string;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const MediaSchema = new mongoose.Schema<IMedia>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    originalName: { type: String },
    type: { type: String, default: "image", enum: ["image", "video"] },
    source: { type: String, default: "user", enum: ["user", "ai"] },
    fileSize: { type: Number, default: 0 },
    key: { type: String, required: true },
    thumbnail: { type: String },
    alt: { type: String },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

MediaSchema.index({ userId: 1 });

const Media = mongoose.model<IMedia>("Media", MediaSchema);

export default Media;
