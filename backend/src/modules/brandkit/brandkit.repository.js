import { BrandKit } from "../../models/index.js";

async function findByUserId(userId) {
  return await BrandKit.findOne({ userId })
    .populate("primaryLogo")
    .populate("watermarkLogo");
}

async function createBrandKit(userId) {
  return await BrandKit.create({ userId });
}

async function upsertBrandKit(userId, data) {
  return await BrandKit.findOneAndUpdate(
    { userId },
    { ...data },
    { new: true, upsert: true, runValidators: true }
  )
    .populate("primaryLogo")
    .populate("watermarkLogo");
}

async function deleteBrandKitByUserId(userId) {
  return await BrandKit.findOneAndDelete({ userId });
}

export {
  findByUserId,
  createBrandKit,
  upsertBrandKit,
  deleteBrandKitByUserId,
};
