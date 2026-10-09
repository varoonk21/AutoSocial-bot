import mongoose, { Document } from "mongoose";

export interface IIntegration extends Document {
  userId: mongoose.Types.ObjectId;
  internalId: string;
  name: string;
  picture?: string;
  providerIdentifier: "facebook" | "instagram" | "x" | "linkedin";
  type: string;
  token: string;
  refreshToken?: string;
  tokenExpiration?: Date;
  profile?: string;
  disabled: boolean;
  refreshNeeded: boolean;
  inBetweenSteps: boolean;
  additionalSettings: string;
  postingTimes: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const IntegrationSchema = new mongoose.Schema<IIntegration>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    internalId: { type: String, required: true },
    name: { type: String, required: true },
    picture: { type: String },
    providerIdentifier: {
      type: String,
      required: true,
      enum: ["facebook", "instagram", "x", "linkedin"],
    },
    type: { type: String, default: "personal" },
    token: { type: String, required: true },
    refreshToken: { type: String },
    tokenExpiration: { type: Date },
    profile: { type: String },
    disabled: { type: Boolean, default: false },
    refreshNeeded: { type: Boolean, default: false },
    inBetweenSteps: { type: Boolean, default: false },
    additionalSettings: { type: String, default: "[]" },
    postingTimes: {
      type: String,
      default: '[{"time":120},{"time":400},{"time":700}]',
    },
  },
  { timestamps: true },
);

IntegrationSchema.index({ userId: 1 });
IntegrationSchema.index({ providerIdentifier: 1 });
IntegrationSchema.index({ userId: 1, internalId: 1 }, { unique: true });

// Defense in depth: OAuth tokens must never leave the server in an API
// response. Stripping them at serialization covers every current and future
// endpoint, even if a controller forgets `.select('-token -refreshToken')`.
IntegrationSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const record = ret as unknown as Record<string, unknown>;
    delete record.token;
    delete record.refreshToken;
    return ret;
  },
});

const Integration = mongoose.model<IIntegration>("Integration", IntegrationSchema);

export default Integration;
