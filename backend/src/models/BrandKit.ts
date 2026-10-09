import mongoose, { Document } from "mongoose";

export interface IBrandKit extends Document {
  userId: mongoose.Types.ObjectId;
  primaryLogo?: mongoose.Types.ObjectId | null;
  watermarkLogo?: mongoose.Types.ObjectId | null;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fonts?: string[];
  tones?: string[];
  styleNotes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const BrandKitSchema = new mongoose.Schema<IBrandKit>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    primaryLogo: { type: mongoose.Schema.Types.ObjectId, ref: "Media", default: null },
    watermarkLogo: { type: mongoose.Schema.Types.ObjectId, ref: "Media", default: null },
    primaryColor: { type: String, default: "#2563EB" },
    secondaryColor: { type: String, default: "#FFFFFF" },
    accentColor: { type: String, default: "#F59E0B" },
    fonts: { type: [String], default: ["Inter", "Roboto"] },
    tones: { type: [String], default: ["Professional", "Bold"] },
    styleNotes: { type: String, default: "" },
  },
  { timestamps: true }
);

const BrandKit = mongoose.model<IBrandKit>("BrandKit", BrandKitSchema);

export default BrandKit;
