import { Notification } from "../models/index.js";

/**
 * GET /notifications
 * Recent notifications for the current user, newest first.
 */
export async function listNotifications(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));

    const [items, total] = await Promise.all([
      Notification.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Notification.countDocuments({ userId: req.user._id }),
    ]);

    res.json({ items, total, page, pageSize });
  } catch (err) {
    res.status(500).json({ message: "Failed to load notifications" });
  }
}

/**
 * GET /notifications/unread-count
 */
export async function getUnreadCount(req, res) {
  try {
    const count = await Notification.countDocuments({ userId: req.user._id, read: false });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: "Failed to load unread count" });
  }
}

/**
 * PATCH /notifications/:id/read
 */
export async function markRead(req, res) {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { read: true },
      { new: true }
    );
    if (!notif) {
      return res.status(404).json({ message: "Notification not found" });
    }
    res.json(notif);
  } catch (err) {
    res.status(500).json({ message: "Failed to mark notification as read" });
  }
}

/**
 * PATCH /notifications/read-all
 */
export async function markAllRead(req, res) {
  try {
    await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Failed to mark notifications as read" });
  }
}
