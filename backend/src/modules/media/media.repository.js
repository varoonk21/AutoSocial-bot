import { Media } from '../../models/index.js';

async function findMedia(query, skip, limit, sortParam = { createdAt: -1 }) {
  const [media, total] = await Promise.all([
    Media.find(query).sort(sortParam).skip(skip).limit(limit),
    Media.countDocuments(query),
  ]);
  return { media, total };
}

async function createMedia(data) {
  return await Media.create(data);
}

async function findMediaByIdAndUser(mediaId, userId) {
  return await Media.findOne({ _id: mediaId, userId });
}

async function deleteMediaById(mediaId) {
  return await Media.findByIdAndDelete(mediaId);
}

async function updateMediaById(mediaId, userId, updates) {
  return await Media.findOneAndUpdate({ _id: mediaId, userId }, updates, { new: true });
}

export {
  findMedia,
  createMedia,
  findMediaByIdAndUser,
  deleteMediaById,
  updateMediaById,
};
