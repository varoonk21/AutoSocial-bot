import * as settingsService from './settings.service.js';
import { sendSuccess } from '../../utils/response.util.js';

async function getSettings(req, res) {
  const settings = await settingsService.getUserSettings(req.user);
  sendSuccess(res, settings);
}

async function updateSettings(req, res) {
  const settings = await settingsService.updateUserSettings(req.user._id, req.body);
  sendSuccess(res, settings);
}

export {
  getSettings,
  updateSettings,
};
