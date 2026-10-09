import express from "express";
import {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
} from "../controllers/notifications.controller.js";

const router = express.Router();

router.get("/", listNotifications);
router.get("/unread-count", getUnreadCount);
router.patch("/read-all", markAllRead);
router.patch("/:id/read", markRead);

export default router;
