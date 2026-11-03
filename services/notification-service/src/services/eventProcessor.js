const prisma = require("../config/prisma");
const api = require("../controllers/notificationApiController");
const emailProvider = require("./emailProvider");

const definitions = {
  UserRegistered: { category: "SYSTEM", title: "Welcome to TaskFlow", message: "Your TaskFlow account is ready.", account: true },
  FollowCreated: { category: "FOLLOW", title: "You have a new follower", message: "Someone started following you." },
  TaskCreated: { category: "TASK", title: "Task created", message: "A task in your workspace was created." },
  TaskUpdated: { category: "TASK", title: "Task updated", message: "A task in your workspace was updated." },
  TaskCompleted: { category: "TASK", title: "Task completed", message: "A task in your workspace was completed." },
  TaskDeadlineReminder: { category: "TASK", title: "Task deadline reminder", message: "A task deadline is approaching." },
  NotePublished: { category: "NOTE", title: "New note published", message: "Someone you follow published a note." },
  NoteRestricted: { category: "NOTE", title: "Note restricted", message: "One of your public notes was restricted by moderation." },
  NoteRestored: { category: "NOTE", title: "Note restored", message: "One of your public notes was restored by moderation." },
  NoteLiked: { category: "LIKE", title: "Your note was liked", message: "Someone liked your public note." },
  CommentCreated: { category: "COMMENT", title: "New comment", message: "Someone commented on your public note." },
  CommentDeleted: { category: "COMMENT", title: "Comment removed", message: "A comment on your public note was removed." },
  NoteRated: { category: "RATING", title: "Your note was rated", message: "Someone rated your public note." },
};

const knownEventTypes = new Set([
  ...Object.keys(definitions),
  "BookmarkCreated",
  "AnnouncementPublished",
]);

class InvalidNotificationEventError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidNotificationEventError";
    this.permanent = true;
  }
}

function validateNotificationEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new InvalidNotificationEventError("Event must be an object");
  }
  if (typeof event.eventId !== "string" || !event.eventId.trim() || event.eventId.length > 200) {
    throw new InvalidNotificationEventError("Event requires a valid eventId");
  }
  if (!knownEventTypes.has(event.type)) {
    throw new InvalidNotificationEventError("Unsupported notification event type");
  }
  const payload = event.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new InvalidNotificationEventError("Event payload must be an object");
  }

  const hasId = (...keys) => keys.some((key) => typeof payload[key] === "string" && payload[key].trim());
  if (event.type === "AnnouncementPublished") {
    if (typeof payload.title !== "string" || typeof payload.message !== "string" ||
      (payload.recipientIds !== undefined && (!Array.isArray(payload.recipientIds) || payload.recipientIds.some((id) => typeof id !== "string")))) {
      throw new InvalidNotificationEventError("Announcement payload is invalid");
    }
  } else if (event.type === "UserRegistered" && !hasId("userId", "id") && !(payload.user && typeof payload.user.id === "string" && payload.user.id.trim())) {
    throw new InvalidNotificationEventError("UserRegistered payload requires a user id");
  } else if (event.type === "FollowCreated" && !hasId("followeeId", "followedUserId", "targetUserId")) {
    throw new InvalidNotificationEventError("FollowCreated payload requires a recipient id");
  } else if (event.type.startsWith("Task") && (!hasId("userId", "ownerId") || !hasId("id", "taskId"))) {
    throw new InvalidNotificationEventError("Task event payload requires task and owner ids");
  } else if (event.type.startsWith("Note") || event.type.startsWith("Comment") || event.type === "BookmarkCreated") {
    if (!hasId("noteId") || (!hasId("ownerId", "noteOwnerId") && event.type !== "BookmarkCreated")) {
      throw new InvalidNotificationEventError("Social note event payload requires note and owner ids");
    }
    if (["NoteLiked", "NoteRated"].includes(event.type) &&
      (!hasId("actorId") || payload.actorId === (payload.ownerId || payload.noteOwnerId))) {
      throw new InvalidNotificationEventError("Engagement notification must identify a different actor");
    }
  }
  return payload;
}

function safeEventPayload(event) {
  const allowedByType = {
    UserRegistered: ["userId", "id", "email", "name"],
    FollowCreated: ["followerId", "followeeId", "followedUserId", "targetUserId"],
    AnnouncementPublished: ["announcementId", "title", "message", "recipientIds"],
  };
  const allowed = allowedByType[event.type] || (event.type.startsWith("Task")
    ? ["id", "taskId", "userId", "ownerId", "notifyOwner"]
    : ["noteId", "ownerId", "noteOwnerId", "recipientIds", "recipientId", "recipientEmail", "recipientEmails", "actorId", "value", "commentId"]);
  const safePayload = Object.fromEntries(allowed
    .filter((key) => Object.prototype.hasOwnProperty.call(event.payload, key))
    .map((key) => [key, event.payload[key]]));
  if (event.type === "UserRegistered" && event.payload.user && typeof event.payload.user === "object") {
    safePayload.user = Object.fromEntries(["id", "email", "name"]
      .filter((key) => Object.prototype.hasOwnProperty.call(event.payload.user, key))
      .map((key) => [key, event.payload.user[key]]));
  }
  return safePayload;
}

async function getFollowers(ownerId) {
  const serviceUrl = process.env.SOCIAL_SERVICE_URL;
  const serviceToken = process.env.INTERNAL_SERVICE_TOKEN;
  if (!serviceUrl || !serviceToken) throw new Error("Social Service internal API is not configured");

  const response = await fetch(
    `${serviceUrl}/internal/social/users/${encodeURIComponent(ownerId)}/followers`,
    {
      headers: { "x-internal-service-token": serviceToken },
      signal: AbortSignal.timeout(3000),
    }
  );
  if (!response.ok) throw new Error(`Social Service returned HTTP ${response.status}`);
  const result = await response.json();
  return Array.isArray(result.userIds) ? [...new Set(result.userIds)] : [];
}

async function recipientsFor(event, followerLookup = getFollowers) {
  const payload = event.payload || {};
  if (event.type === "AnnouncementPublished") {
    return Array.isArray(payload.recipientIds)
      ? [...new Set(payload.recipientIds.filter((id) => typeof id === "string" && id))]
      : [];
  }
  if (event.type === "UserRegistered") return [payload.userId || payload.user?.id || payload.id].filter(Boolean);
  if (event.type === "FollowCreated") return [payload.followeeId || payload.followedUserId || payload.targetUserId].filter(Boolean);
  if (event.type.startsWith("Task")) return [payload.userId || payload.ownerId].filter(Boolean);
  if (event.type === "NotePublished") {
    if (Array.isArray(payload.recipientIds)) {
      return [...new Set(payload.recipientIds.filter((id) => typeof id === "string" && id))];
    }
    const ownerId = payload.ownerId || payload.noteOwnerId;
    return ownerId ? followerLookup(ownerId) : [];
  }
  if (["NoteLiked", "CommentCreated", "NoteRated", "NoteRestricted", "NoteRestored"].includes(event.type)) {
    return [payload.ownerId || payload.noteOwnerId].filter(Boolean);
  }
  return [];
}

function safeMetadata(event) {
  const payload = event.payload || {};
  return {
    ...(payload.taskId || (event.type.startsWith("Task") && payload.id) ? { taskId: payload.taskId || payload.id } : {}),
    ...(payload.noteId ? { noteId: payload.noteId } : {}),
    ...(payload.announcementId ? { announcementId: payload.announcementId } : {}),
  };
}

async function claimEvent(event, database, leaseMs) {
  if (typeof event.eventId !== "string" || !event.eventId || typeof event.type !== "string") {
    throw new Error("Event requires eventId and type");
  }
  const now = new Date();
  const processingUntil = new Date(now.getTime() + leaseMs);
  const existing = await database.processedEvent.findUnique({ where: { eventId: event.eventId } });
  if (existing?.status === "PROCESSED" || existing?.status === "DEAD_LETTERED") return false;

  if (!existing) {
    try {
      await database.processedEvent.create({
        data: {
          eventId: event.eventId,
          eventType: event.type,
          payload: safeEventPayload(event),
          status: "PROCESSING",
          processingUntil,
        },
      });
      return true;
    } catch (error) {
      if (error.code !== "P2002") throw error;
      return claimEvent(event, database, leaseMs);
    }
  }

  if (existing.status === "PROCESSING" && existing.processingUntil > now) return false;
  const result = await database.processedEvent.updateMany({
    where: {
      eventId: event.eventId,
      OR: [
        { status: "RETRY" },
        { status: "PROCESSING", processingUntil: null },
        { status: "PROCESSING", processingUntil: { lte: now } },
      ],
    },
    data: {
      status: "PROCESSING",
      processingUntil,
      attempts: { increment: 1 },
      lastError: null,
      payload: safeEventPayload(event),
    },
  });
  return result.count === 1;
}

function createEventProcessor({
  database = prisma,
  email = emailProvider,
  followerLookup = getFollowers,
  logger = console,
  leaseMs = 30000,
} = {}) {
  async function processEvent(event) {
    validateNotificationEvent(event);
    if (!await claimEvent(event, database, leaseMs)) return { duplicate: true };

    try {
      const recipients = await recipientsFor(event, followerLookup);
      let definition = definitions[event.type];
      if (event.type === "AnnouncementPublished") {
        definition = {
          category: "ANNOUNCEMENT",
          title: String(event.payload?.title || "TaskFlow announcement")
            .replace(/https?:\/\/\S+/gi, "").slice(0, 200),
          message: String(event.payload?.message || "A new platform announcement is available.")
            .replace(/https?:\/\/\S+/gi, "").slice(0, 2000),
        };
      }

      if (!definition || (event.type === "TaskUpdated" && event.payload?.notifyOwner === false)) {
        await database.processedEvent.update({
          where: { eventId: event.eventId },
          data: { status: "PROCESSED", processedAt: new Date(), processingUntil: null },
        });
        return { ignored: true };
      }

      await database.$transaction(async (transaction) => {
        if (event.type === "AnnouncementPublished" && typeof event.payload?.title === "string" && typeof event.payload?.message === "string") {
          await transaction.announcement.upsert({
            where: { sourceEventId: event.eventId },
            create: {
              sourceEventId: event.eventId,
              title: definition.title,
              message: definition.message,
              publishedAt: event.occurredAt ? new Date(event.occurredAt) : new Date(),
            },
            update: {},
          });
        }

        const preferences = recipients.length
          ? await transaction.notificationPreference.findMany({ where: { userId: { in: recipients } } })
          : [];
        const byUser = new Map(preferences.map((item) => [`${item.userId}:${item.category}`, item]));
        for (const userId of recipients) {
          const preference = byUser.get(`${userId}:${definition.category}`);
          if (!definition.account && preference?.inAppEnabled === false) continue;
          const payload = event.payload || {};
          await transaction.notification.upsert({
            where: { userId_sourceEventId: { userId, sourceEventId: event.eventId } },
            create: {
              userId,
              taskId: payload.taskId || (event.type.startsWith("Task") ? payload.id : null) || null,
              title: definition.title,
              message: definition.message,
              category: definition.category,
              sourceEventId: event.eventId,
              metadata: safeMetadata(event),
            },
            update: {},
          });
        }
      });

      for (const userId of recipients) {
        const payload = event.payload || {};
        const address = event.type === "UserRegistered"
          ? payload.email || payload.user?.email
          : payload.recipientId === userId ? payload.recipientEmail : payload.recipientEmails?.[userId];
        if (!address) continue;
        const preference = await database.notificationPreference.findUnique({
          where: { userId_category: { userId, category: definition.category } },
        });
        if (!definition.account && preference?.emailEnabled !== true) continue;
        await email.sendEmail({
          to: address,
          subject: definition.account ? definition.title : "TaskFlow activity update",
          text: definition.account
            ? `Hello ${payload.name || payload.user?.name || "there"}, your TaskFlow account is ready.`
            : definition.message,
          idempotencyKey: `${event.eventId}:${userId}`,
        });
      }

      await database.processedEvent.update({
        where: { eventId: event.eventId },
        data: { status: "PROCESSED", processedAt: new Date(), processingUntil: null, lastError: null },
      });
      return { processed: true };
    } catch (error) {
      await database.processedEvent.update({
        where: { eventId: event.eventId },
        data: { status: "RETRY", processingUntil: null, lastError: error.message.slice(0, 1000) },
      }).catch((updateError) => logger.error("Could not record event failure:", updateError.message));
      throw error;
    }
  }

  return { processEvent };
}

module.exports = { createEventProcessor, definitions, recipientsFor, safeMetadata, safeEventPayload, claimEvent, getFollowers, validateNotificationEvent, InvalidNotificationEventError };
