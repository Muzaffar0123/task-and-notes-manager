const prisma = require("../config/prisma");
const AppError = require("../utils/appError");

const categories = [
  "TASK",
  "FOLLOW",
  "NOTE",
  "LIKE",
  "COMMENT",
  "RATING",
  "ANNOUNCEMENT",
  "SYSTEM",
];

function parsePage(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 50 : Number(query.pageSize);
  if (
    !Number.isInteger(page) || page < 1 || page > 1000000 ||
    !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100
  ) {
    throw new AppError(400, "Page must be positive and pageSize must be between 1 and 100");
  }
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

async function createNotification(req, res) {
  const { userId, taskId, title, message, category } = req.body;
  if (userId !== undefined && (typeof userId !== "string" || userId !== req.user.id)) {
    throw new AppError(403, "You can create notifications only for yourself");
  }
  if (typeof title !== "string" || !title.trim() || title.trim().length > 200) {
    throw new AppError(400, "Title is required and must be at most 200 characters");
  }
  if (typeof message !== "string" || !message.trim() || message.trim().length > 2000) {
    throw new AppError(400, "Message is required and must be at most 2000 characters");
  }
  const safeMessage = message.trim().replace(/https?:\/\/\S+/gi, "").trim();
  const safeTitle = title.trim().replace(/https?:\/\/\S+/gi, "").trim();
  if (!safeTitle) throw new AppError(400, "Title must contain text other than a URL");
  if (!safeMessage) throw new AppError(400, "Message must contain text other than a URL");
  const notificationCategory = category || (taskId ? "TASK" : "SYSTEM");
  if (!categories.includes(notificationCategory)) throw new AppError(400, "Invalid notification category");

  const notification = await prisma.notification.create({
    data: {
      userId: req.user.id,
      taskId: typeof taskId === "string" ? taskId : null,
      title: safeTitle,
      message: safeMessage,
      category: notificationCategory,
    },
  });
  return res.status(201).json({ success: true, data: notification });
}

async function getNotifications(req, res) {
  const { page, pageSize, skip, take } = parsePage(req.query);
  const where = { userId: req.user.id };
  if (req.query.isRead !== undefined) {
    if (!["true", "false"].includes(req.query.isRead)) throw new AppError(400, "isRead must be true or false");
    where.isRead = req.query.isRead === "true";
  }
  if (req.query.category !== undefined) {
    if (!categories.includes(req.query.category)) throw new AppError(400, "Invalid notification category");
    where.category = req.query.category;
  }
  const [data, count] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.notification.count({ where }),
  ]);
  return res.status(200).json({
    success: true,
    count,
    data,
    pagination: { page, pageSize, total: count },
  });
}

async function getNotificationById(req, res) {
  const notification = await prisma.notification.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!notification) throw new AppError(404, "Notification not found");
  return res.status(200).json({ success: true, data: notification });
}

async function markAsRead(req, res) {
  const result = await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user.id },
    data: { isRead: true },
  });
  if (result.count === 0) throw new AppError(404, "Notification not found");
  const notification = await prisma.notification.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  return res.status(200).json({ success: true, data: notification });
}

async function markAllAsRead(req, res) {
  const result = await prisma.notification.updateMany({
    where: { userId: req.user.id, isRead: false },
    data: { isRead: true },
  });
  return res.status(200).json({ success: true, updatedCount: result.count });
}

async function deleteNotification(req, res) {
  const result = await prisma.notification.deleteMany({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (result.count === 0) throw new AppError(404, "Notification not found");
  return res.status(200).json({ success: true, message: "Notification deleted" });
}

async function getUnreadCount(req, res) {
  const count = await prisma.notification.count({ where: { userId: req.user.id, isRead: false } });
  return res.status(200).json({ success: true, count });
}

async function getPreferences(req, res) {
  const saved = await prisma.notificationPreference.findMany({
    where: { userId: req.user.id },
    select: { category: true, inAppEnabled: true, emailEnabled: true },
  });
  const byCategory = new Map(saved.map((preference) => [preference.category, preference]));
  const data = categories.map((category) => byCategory.get(category) || {
    category,
    inAppEnabled: true,
    emailEnabled: false,
  });
  return res.status(200).json({ success: true, data });
}

async function updatePreferences(req, res) {
  const preferences = req.body.preferences;
  if (!Array.isArray(preferences) || preferences.length < 1 || preferences.length > categories.length) {
    throw new AppError(400, "preferences must be a non-empty array of category settings");
  }

  const seen = new Set();
  for (const preference of preferences) {
    if (
      !preference || !categories.includes(preference.category) || seen.has(preference.category) ||
      typeof preference.inAppEnabled !== "boolean" || typeof preference.emailEnabled !== "boolean"
    ) {
      throw new AppError(400, "Each preference needs a unique category and boolean delivery settings");
    }
    seen.add(preference.category);
  }

  const result = await prisma.$transaction(async (transaction) => Promise.all(preferences.map((preference) =>
    transaction.notificationPreference.upsert({
      where: { userId_category: { userId: req.user.id, category: preference.category } },
      create: {
        userId: req.user.id,
        category: preference.category,
        inAppEnabled: preference.inAppEnabled,
        emailEnabled: preference.emailEnabled,
      },
      update: {
        inAppEnabled: preference.inAppEnabled,
        emailEnabled: preference.emailEnabled,
      },
      select: { category: true, inAppEnabled: true, emailEnabled: true },
    })
  )));
  return res.status(200).json({ success: true, data: result });
}

async function createAnnouncementFromEvent(transaction, event) {
  const payload = event.payload || {};
  if (typeof payload.title !== "string" || typeof payload.message !== "string") return null;
  return transaction.announcement.upsert({
    where: { sourceEventId: event.eventId },
    create: {
      sourceEventId: event.eventId,
      title: payload.title.slice(0, 200),
      message: payload.message.slice(0, 2000),
      publishedAt: event.occurredAt ? new Date(event.occurredAt) : new Date(),
    },
    update: {},
  });
}

function eventRecipients(event) {
  const payload = event.payload || {};
  if (event.type === "UserRegistered") return [payload.userId || payload.user?.id || payload.id].filter(Boolean);
  if (event.type === "FollowCreated") return [payload.followeeId || payload.followedUserId || payload.targetUserId].filter(Boolean);
  if (["TaskCreated", "TaskUpdated", "TaskCompleted", "TaskDeadlineReminder"].includes(event.type)) {
    return [payload.userId || payload.ownerId].filter(Boolean);
  }
  if (["NoteLiked", "CommentCreated", "NoteRated", "BookmarkCreated"].includes(event.type)) {
    return [payload.ownerId || payload.noteOwnerId].filter(Boolean);
  }
  if (event.type === "NotePublished" || event.type === "AnnouncementPublished") {
    return Array.isArray(payload.recipientIds) ? [...new Set(payload.recipientIds.filter((id) => typeof id === "string"))] : [];
  }
  return [];
}

async function listAnnouncements(req, res) {
  const { page, pageSize, skip, take } = parsePage(req.query);
  const [data, total] = await Promise.all([
    prisma.announcement.findMany({
      where: { publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
      skip,
      take,
      select: { id: true, title: true, message: true, publishedAt: true },
    }),
    prisma.announcement.count({ where: { publishedAt: { not: null } } }),
  ]);
  return res.status(200).json({ success: true, data, pagination: { page, pageSize, total } });
}

module.exports = {
  categories,
  createNotification,
  getNotifications,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount,
  getPreferences,
  updatePreferences,
  createAnnouncementFromEvent,
  eventRecipients,
  listAnnouncements,
};