import { Notification, User, type NotificationType } from "../models/index.js";
import { logger } from "../utils/logger.util.js";

interface NotifyParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  postId?: string;
  integrationId?: string;
}

/**
 * Creates an in-app notification for a user, honoring their notification
 * preferences in User.notifications. Toggle off = no notification created.
 * Never throws — notification failures must not break publishing.
 */
export async function notifyUser(params: NotifyParams): Promise<void> {
  try {
    const user = await User.findById(params.userId).select("notifications").lean();
    if (!user) return;

    const prefs = (user as any).notifications || {};
    const gate: Record<NotificationType, boolean> = {
      post_published: prefs.postPublished !== false,
      post_failed: prefs.postFailed !== false,
      token_expiring: prefs.tokenExpiring !== false,
      info: true,
    };

    if (!gate[params.type]) {
      return;
    }

    await Notification.create({
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      postId: params.postId || undefined,
      integrationId: params.integrationId || undefined,
    });
  } catch (err) {
    logger.error({ err, userId: params.userId, type: params.type }, "Failed to create notification");
  }
}
