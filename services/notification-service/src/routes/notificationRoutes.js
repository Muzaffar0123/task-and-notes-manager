const express = require("express");

const controller = require("../controllers/notificationApiController");

const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authenticateToken);

router.post("/", controller.createNotification);
router.get("/", controller.getNotifications);
router.get("/unread-count", controller.getUnreadCount);
router.get("/preferences", controller.getPreferences);
router.put("/preferences", controller.updatePreferences);
router.patch("/read-all", controller.markAllAsRead);
router.get("/announcements", controller.listAnnouncements);
router.get("/:id", controller.getNotificationById);
router.patch("/:id/read", controller.markAsRead);
router.delete("/:id", controller.deleteNotification);

module.exports = router;
