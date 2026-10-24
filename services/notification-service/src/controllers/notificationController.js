const prisma = require("../config/prisma");

// CREATE NOTIFICATION
async function createNotification(req, res) {
  try {
    const { userId, taskId, title, message } = req.body;

    if (
      !userId ||
      typeof userId !== "string" ||
      !title ||
      typeof title !== "string" ||
      !title.trim() ||
      !message ||
      typeof message !== "string" ||
      !message.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "userId, title, and message are required",
      });
    }

    const notification = await prisma.notification.create({
      data: {
        userId,
        taskId: taskId || null,
        title: title.trim(),
        message: message.trim(),
      },
    });

    return res.status(201).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    console.error("Create notification error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not create notification",
    });
  }
}

// GET NOTIFICATIONS FOR THE AUTHENTICATED USER
async function getNotifications(req, res) {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      count: notifications.length,
      data: notifications,
    });
  } catch (error) {
    console.error("Get notifications error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve notifications",
    });
  }
}

// GET ONE NOTIFICATION
async function getNotificationById(req, res) {
  try {
    const notification = await prisma.notification.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    console.error("Get notification error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve notification",
    });
  }
}

// MARK NOTIFICATION AS READ
async function markAsRead(req, res) {
  try {
    const result = await prisma.notification.updateMany({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
      data: { isRead: true },
    });

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    const notification = await prisma.notification.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    return res.status(200).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    console.error("Mark notification as read error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not update notification",
    });
  }
}

module.exports = {
  createNotification,
  getNotifications,
  getNotificationById,
  markAsRead,
};
