const amqp = require("amqplib");
const { refreshEligibleNoteStats } = require("../services/engagementStats");
const exchangeName = "taskflow.events";
const retryExchange = "taskflow.social.notes.retry";
const deadExchange = "taskflow.social.notes.dlx";
const queueName = "taskflow.social.notes";
const retryQueueName = "taskflow.social.notes.retry.queue";
const deadQueueName = "taskflow.social.notes.dead";
const noteEventTypes = new Set([
  "NotePublished",
  "NoteUpdated",
  "NoteRestricted",
  "NoteRestored",
  "NoteDeleted",
  "NoteVisibilityChanged",
  "NoteLiked",
  "NoteUnliked",
  "NoteRated",
  "NoteRatingUpdated",
]);
const engagementEventTypes = new Set(["NoteLiked", "NoteUnliked", "NoteRated", "NoteRatingUpdated"]);

class InvalidNoteEventError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidNoteEventError";
    this.permanent = true;
  }
}

function validateNoteEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new InvalidNoteEventError("Event must be an object");
  }
  if (typeof event.eventId !== "string" || !event.eventId.trim() || event.eventId.length > 200) {
    throw new InvalidNoteEventError("Event requires a valid eventId");
  }
  if (!noteEventTypes.has(event.type)) {
    throw new InvalidNoteEventError("Unsupported Notes event type");
  }
  const payload = event.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof payload.noteId !== "string" || !payload.noteId.trim()) {
    throw new InvalidNoteEventError("Event payload requires a noteId");
  }
  if (event.type !== "NoteDeleted") {
    if (!payload.ownerId || !["PUBLIC", "PRIVATE"].includes(payload.visibility) || !["DRAFT", "PUBLISHED", "RESTRICTED"].includes(payload.status)) {
      throw new InvalidNoteEventError("Note state event has invalid visibility or status metadata");
    }
    if (payload.publishedAt !== null && payload.publishedAt !== undefined && Number.isNaN(new Date(payload.publishedAt).getTime())) {
      throw new InvalidNoteEventError("Note state event has an invalid publishedAt value");
    }
  }
  if (engagementEventTypes.has(event.type)) {
    if (
      typeof payload.actorId !== "string" ||
      payload.actorId === payload.ownerId ||
      !Number.isInteger(payload.likeCount) || payload.likeCount < 0 ||
      !Number.isInteger(payload.ratingCount) || payload.ratingCount < 0 ||
      !Number.isInteger(payload.ratingTotal) || payload.ratingTotal < 0 ||
      typeof payload.ratingAverage !== "number" || !Number.isFinite(payload.ratingAverage) ||
      payload.ratingAverage < 0 || payload.ratingAverage > 5 ||
      (["NoteRated", "NoteRatingUpdated"].includes(event.type) &&
        (!Number.isInteger(payload.value) || payload.value < 1 || payload.value > 5))
    ) {
      throw new InvalidNoteEventError("Engagement event contains invalid aggregate data");
    }
  }
  return payload;
}

function engagementFields(payload) {
  const ratingCount = payload.ratingCount;
  const ratingTotal = payload.ratingTotal;
  return {
    likeCount: payload.likeCount,
    ratingCount,
    ratingTotal,
    ratingAverage: ratingCount ? ratingTotal / ratingCount : 0,
    popularityScore: payload.likeCount + ratingTotal,
  };
}

function retryCount(message) {
  const explicitCount = Number(message.properties?.headers?.["x-taskflow-retry-count"] || 0);
  const deaths = message.properties?.headers?.["x-death"] || [];
  const brokerCount = deaths
    .filter((death) => death.queue === retryQueueName)
    .reduce((total, death) => total + Number(death.count || 0), 0);
  return Math.max(explicitCount, brokerCount);
}

function createNoteEventConsumer({
  prisma,
  connect = amqp.connect,
  logger = console,
  maxRetries = Number(process.env.SOCIAL_EVENT_MAX_RETRIES || 5),
  retryDelayMs = Number(process.env.SOCIAL_EVENT_RETRY_DELAY_MS || 5000),
} = {}) {
  let connection;
  let channel;
  let reconnectTimer;
  let stopping = false;

  async function applyEvent(event) {
    const payload = validateNoteEvent(event);
    try {
      return await prisma.$transaction(async (transaction) => {
        await transaction.socialProcessedEvent.create({
          data: { eventId: event.eventId, eventType: event.type },
        });

        if (engagementEventTypes.has(event.type)) {
          if (
            payload.visibility !== "PUBLIC" ||
            payload.status !== "PUBLISHED" ||
            !payload.publishedAt
          ) {
            throw new InvalidNoteEventError("Engagement events must reference a published public note");
          }
          const fields = engagementFields(payload);
          await transaction.eligibleNote.upsert({
            where: { noteId: payload.noteId },
            create: {
              noteId: payload.noteId,
              ownerId: payload.ownerId,
              publishedAt: new Date(payload.publishedAt),
              ...fields,
            },
            update: {
              ownerId: payload.ownerId,
              publishedAt: new Date(payload.publishedAt),
              ...fields,
            },
          });
          if (event.type === "NoteLiked") {
            await transaction.like.upsert({
              where: { userId_noteId: { userId: payload.actorId, noteId: payload.noteId } },
              create: { userId: payload.actorId, noteId: payload.noteId },
              update: {},
            });
          } else if (event.type === "NoteUnliked") {
            await transaction.like.deleteMany({
              where: { userId: payload.actorId, noteId: payload.noteId },
            });
          } else {
            await transaction.rating.upsert({
              where: { userId_noteId: { userId: payload.actorId, noteId: payload.noteId } },
              create: { userId: payload.actorId, noteId: payload.noteId, value: payload.value },
              update: { value: payload.value },
            });
          }
          return { duplicate: false };
        }

        if (
          ["NotePublished", "NoteUpdated", "NoteRestored", "NoteVisibilityChanged"].includes(event.type) &&
          payload.visibility === "PUBLIC" &&
          payload.status === "PUBLISHED" &&
          payload.ownerId &&
          payload.publishedAt
        ) {
          await transaction.eligibleNote.upsert({
            where: { noteId: payload.noteId },
            create: {
              noteId: payload.noteId,
              ownerId: payload.ownerId,
              publishedAt: new Date(payload.publishedAt),
              ...(Number.isInteger(payload.likeCount) ? {
                likeCount: payload.likeCount,
                ratingCount: payload.ratingCount,
                ratingAverage: payload.ratingAverage,
                ratingTotal: payload.ratingTotal,
                popularityScore: payload.likeCount + payload.ratingTotal,
              } : {}),
            },
            update: {
              ownerId: payload.ownerId,
              publishedAt: new Date(payload.publishedAt),
              ...(Number.isInteger(payload.likeCount) ? {
                likeCount: payload.likeCount,
                ratingCount: payload.ratingCount,
                ratingAverage: payload.ratingAverage,
                ratingTotal: payload.ratingTotal,
                popularityScore: payload.likeCount + payload.ratingTotal,
              } : {}),
            },
          });
          await refreshEligibleNoteStats(transaction, payload.noteId);
          return { duplicate: false };
        }

        if (["NotePublished", "NoteUpdated", "NoteRestricted", "NoteRestored", "NoteVisibilityChanged"].includes(event.type)) {
          await transaction.eligibleNote.deleteMany({ where: { noteId: payload.noteId } });
          await transaction.like.deleteMany({ where: { noteId: payload.noteId } });
          await transaction.rating.deleteMany({ where: { noteId: payload.noteId } });
        }

        if (event.type === "NoteDeleted") {
          await transaction.like.deleteMany({ where: { noteId: payload.noteId } });
          await transaction.comment.deleteMany({ where: { noteId: payload.noteId } });
          await transaction.rating.deleteMany({ where: { noteId: payload.noteId } });
          await transaction.bookmark.deleteMany({ where: { noteId: payload.noteId } });
          await transaction.eligibleNote.deleteMany({ where: { noteId: payload.noteId } });
        }
        return { duplicate: false };
      });
    } catch (error) {
      if (error.code === "P2002") return { duplicate: true };
      throw error;
    }
  }

  async function sendToDeadLetter(message, reason) {
    channel.publish(
      deadExchange,
      "social.notes.dead",
      message.content,
      {
        persistent: true,
        contentType: message.properties?.contentType || "application/json",
        headers: { ...(message.properties?.headers || {}), "x-taskflow-error": String(reason).slice(0, 500) },
      }
    );
    await channel.waitForConfirms();
    channel.ack(message);
  }

  async function handleMessage(message) {
    if (!message || !channel) return;
    let event;
    try {
      event = JSON.parse(message.content.toString());
      await applyEvent(event);
      channel.ack(message);
    } catch (error) {
      logger.error("Social Notes event processing failed:", error.message);
      if (error.permanent || error instanceof SyntaxError || retryCount(message) >= maxRetries) {
        try {
          await sendToDeadLetter(message, error.message);
        } catch (deadLetterError) {
          logger.error("Social Notes dead-letter publish failed:", deadLetterError.message);
          channel?.nack(message, false, true);
        }
        return;
      }

      try {
        channel.publish(
          retryExchange,
          "social.notes.retry",
          message.content,
          {
            persistent: true,
            contentType: message.properties?.contentType || "application/json",
            headers: {
              ...(message.properties?.headers || {}),
              "x-taskflow-retry-count": retryCount(message) + 1,
            },
          }
        );
        await channel.waitForConfirms();
        channel.ack(message);
      } catch (retryError) {
        logger.error("Social Notes retry publish failed:", retryError.message);
        channel?.nack(message, false, true);
      }
    }
  }

  function scheduleReconnect() {
    if (stopping || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void start();
    }, 5000);
    reconnectTimer.unref?.();
  }

  async function start() {
    if (stopping || channel) return;
    try {
      const options = process.env.RABBITMQ_URL || {
        protocol: "amqp",
        hostname: process.env.RABBITMQ_HOST || "rabbitmq",
        port: Number(process.env.RABBITMQ_PORT || 5672),
        username: process.env.RABBITMQ_USER,
        password: process.env.RABBITMQ_PASSWORD,
        heartbeat: 30,
      };
      connection = await connect(options);
      connection.on("close", () => {
        connection = null;
        channel = null;
        scheduleReconnect();
      });
      channel = await connection.createConfirmChannel();
      await channel.assertExchange(exchangeName, "topic", { durable: true });
      await channel.assertExchange(retryExchange, "direct", { durable: true });
      await channel.assertExchange(deadExchange, "direct", { durable: true });
      await channel.assertQueue(queueName, { durable: true });
      await channel.assertQueue(retryQueueName, {
        durable: true,
        arguments: {
          "x-message-ttl": retryDelayMs,
          "x-dead-letter-exchange": exchangeName,
          "x-dead-letter-routing-key": "note.retry",
        },
      });
      await channel.assertQueue(deadQueueName, { durable: true });
      await channel.bindQueue(retryQueueName, retryExchange, "social.notes.retry");
      await channel.bindQueue(deadQueueName, deadExchange, "social.notes.dead");
      for (const binding of [
        "note.published",
        "note.updated",
        "note.restricted",
        "note.restored",
        "note.deleted",
        "note.visibility_changed",
        "note.liked",
        "note.unliked",
        "note.rated",
        "note.rating_updated",
        "note.retry",
      ]) {
        await channel.bindQueue(queueName, exchangeName, binding);
      }
      await channel.prefetch(25);
      await channel.consume(queueName, handleMessage);
    } catch (error) {
      logger.error("Social Notes event consumer unavailable:", error.message);
      await connection?.close().catch(() => {});
      connection = null;
      channel = null;
      scheduleReconnect();
    }
  }

  async function stop() {
    stopping = true;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    try {
      await channel?.close();
    } catch {}
    try {
      await connection?.close();
    } catch {}
    channel = null;
    connection = null;
  }

  return { start, stop, applyEvent, handleMessage, retryCount };
}

module.exports = { createNoteEventConsumer, validateNoteEvent, retryCount, InvalidNoteEventError };
