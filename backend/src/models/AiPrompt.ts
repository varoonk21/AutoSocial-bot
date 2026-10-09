import mongoose, { Document } from "mongoose";

export interface IAiPrompt extends Document {
  userId: mongoose.Types.ObjectId;
  prompt: string;
  platform?: string;
  mode: "variations" | "enhance" | "image-content";
  createdAt?: Date;
}

const AiPromptSchema = new mongoose.Schema<IAiPrompt>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    prompt: { type: String, required: true, maxlength: 2000 },
    platform: { type: String },
    mode: {
      type: String,
      enum: ["variations", "enhance", "image-content"],
      default: "variations",
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AiPromptSchema.index({ userId: 1, createdAt: -1 });

const AiPrompt = mongoose.model<IAiPrompt>("AiPrompt", AiPromptSchema);

export default AiPrompt;
