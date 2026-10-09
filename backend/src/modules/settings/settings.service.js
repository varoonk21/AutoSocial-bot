import * as settingsRepository from './settings.repository.js';

function formatSettingsResponse(user) {
  return {
    name: user.name || "",
    email: user.email,
    notifications: {
      postPublished: user.notifications?.postPublished ?? true,
      postFailed: user.notifications?.postFailed ?? true,
      tokenExpiring: user.notifications?.tokenExpiring ?? true,
    },
  };
}

async function getUserSettings(user) {
  return formatSettingsResponse(user);
}

async function updateUserSettings(userId, data) {
  const user = await settingsRepository.findUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  
  const updatedUser = await settingsRepository.updateUserSettings(user, data);
  return formatSettingsResponse(updatedUser);
}

export {
  getUserSettings,
  updateUserSettings,
};
