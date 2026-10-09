import {
  getMedia,
  deleteMediaPermanently,
  getUploadUrl,
  saveMediaMetadata,
  renameMedia,
} from './media.service.js';
import { sendSuccess, sendPaginated } from '../../utils/response.util.js';
import { parseQueryPagination } from '../../utils/pagination.util.js';

async function getUploadUrlHandler(req, res) {
  const { fileName, contentType, fileSize } = req.body;
  const result = await getUploadUrl(req.user._id, { fileName, contentType, fileSize });
  sendSuccess(res, result);
}

async function saveMetadataHandler(req, res) {
  const { key, originalName, contentType, fileSize, source } = req.body;
  const media = await saveMediaMetadata(req.user._id, { key, originalName, contentType, fileSize, source });
  sendSuccess(res, { media }, 201);
}

const ALLOWED_SORT_FIELDS = ['createdAt', 'originalName'];

async function listMedia(req, res) {
  const query = parseQueryPagination(req.query, ALLOWED_SORT_FIELDS);
  const result = await getMedia(req.user._id, query);
  sendPaginated(res, result.media, result.total, query.page, query.pageSize);
}

async function deleteMediaHandler(req, res) {
  await deleteMediaPermanently(req.user._id, req.params.id);
  sendSuccess(res, { success: true });
}

async function renameMediaHandler(req, res) {
  const { originalName } = req.body;
  if (!originalName || !originalName.trim()) {
    return res.status(400).json({ error: 'originalName is required' });
  }
  const updated = await renameMedia(req.user._id, req.params.id, originalName.trim());
  sendSuccess(res, { media: updated });
}

export {
  listMedia,
  deleteMediaHandler,
  getUploadUrlHandler,
  saveMetadataHandler,
  renameMediaHandler,
};
