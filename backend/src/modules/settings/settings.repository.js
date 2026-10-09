import { User } from '../../models/index.js';

async function findUserById(userId) {
  return await User.findById(userId);
}

async function updateUserSettings(user, data) {
  if (data.name !== undefined) {
    user.name = data.name;
  }

  if (data.notifications) {
    if (!user.notifications) {
      user.notifications = {};
    }
    if (data.notifications.postPublished !== undefined) {
      user.notifications.postPublished = data.notifications.postPublished;
    }
    if (data.notifications.postFailed !== undefined) {
      user.notifications.postFailed = data.notifications.postFailed;
    }
    if (data.notifications.tokenExpiring !== undefined) {
      user.notifications.tokenExpiring = data.notifications.tokenExpiring;
    }
  }

  await user.save();
  return user;
}

export { findUserById, updateUserSettings };
