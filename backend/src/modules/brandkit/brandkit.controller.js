import * as brandKitService from "./brandkit.service.js";
import { sendSuccess } from "../../utils/response.util.js";

async function getBrandKit(req, res) {
  const brandKit = await brandKitService.getBrandKit(req.user._id);
  sendSuccess(res, { brandKit });
}

async function upsertBrandKit(req, res) {
  const brandKit = await brandKitService.upsertBrandKit(req.user._id, req.body);
  sendSuccess(res, { brandKit });
}

async function deleteBrandKit(req, res) {
  await brandKitService.deleteBrandKit(req.user._id);
  sendSuccess(res, { success: true });
}

export { getBrandKit, upsertBrandKit, deleteBrandKit };
