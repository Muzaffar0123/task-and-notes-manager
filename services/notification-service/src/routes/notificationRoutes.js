const express = require("express");

const {
  createNotification,
  getNotifications,
  getNotificationById,
  markAsRead,
} = require("../controllers/notificationController");

const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authenticateToken);

router.post("/", createNotification);
router.get("/", getNotifications);
router.get("/:id", getNotificationById);
router.patch("/:id/read", markAsRead);

module.exports = router;
