import * as brandKitRepository from "./brandkit.repository.js";
import { getS3Url } from "../../lib/s3.js";

async function resolveMediaUrl(media) {
  if (!media || !media.key) return null;
  return getS3Url(media.key);
}

async function getBrandKit(userId) {
  let brandKit = await brandKitRepository.findByUserId(userId);
  
  if (!brandKit) {
    brandKit = await brandKitRepository.createBrandKit(userId);
  }

  const obj = brandKit.toObject();
  obj.primaryLogoUrl = await resolveMediaUrl(obj.primaryLogo);
  obj.watermarkLogoUrl = await resolveMediaUrl(obj.watermarkLogo);

  return obj;
}

async function upsertBrandKit(userId, data) {
  const brandKit = await brandKitRepository.upsertBrandKit(userId, data);

  const obj = brandKit.toObject();
  obj.primaryLogoUrl = await resolveMediaUrl(obj.primaryLogo);
  obj.watermarkLogoUrl = await resolveMediaUrl(obj.watermarkLogo);

  return obj;
}

async function deleteBrandKit(userId) {
  await brandKitRepository.deleteBrandKitByUserId(userId);
}

export {
  getBrandKit,
  upsertBrandKit,
  deleteBrandKit,
};
