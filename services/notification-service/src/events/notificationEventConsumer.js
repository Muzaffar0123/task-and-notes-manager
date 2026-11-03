const amqp = require("amqplib");
const { createEventProcessor } = require("../services/eventProcessor");
const prisma = require("../config/prisma");

const eventsExchange = "taskflow.events";
const retryExchange = "taskflow.notifications.retry";
const deadExchange = "taskflow.notifications.dlx";
const mainQueue = "taskflow.notifications.events";
const retryQueue = "taskflow.notifications.retry.queue";
const deadQueue = "taskflow.notifications.dead";
const routingKeys = [
  "user.registered",
  "user.user_registered",
  "follow.created",
  "social.follow.created",
  "task.created",
  "task.updated",
  "task.completed",
  "task.deadline_reminder",
  "note.published",
  "social.note.liked",
  "note.liked",
  "note.restricted",
  "note.restored",
  "social.comment.created",
  "social.comment.deleted",
  "social.note.rated",
  "note.rated",
  "social.bookmark.created",
  "admin.announcement.published",
  "announcement.published",
  "notification.retry",
];

function retryCount(message) {
  const deaths = message.properties.headers?.["x-death"] || [];
  return deaths
    .filter((death) => death.queue === retryQueue)
    .reduce((total, death) => total + Number(death.count || 0), 0);
}

function createNotificationEventConsumer({
  processor = createEventProcessor(),
  database = prisma,
  connect = amqp.connect,
  logger = console,
  maxRetries = Number(process.env.NOTIFICATION_MAX_RETRIES || 5),
  retryDelayMs = Number(process.env.NOTIFICATION_RETRY_DELAY_MS || 5000),
} = {}) {
  let connection;
  let channel;
  let reconnectTimer;
  let stopping = false;
  let ready = false;

  async function setup() {
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
      ready = false;
      scheduleReconnect();
    });
    channel = await connection.createConfirmChannel();

    await channel.assertExchange(eventsExchange, "topic", { durable: true });
    await channel.assertExchange(retryExchange, "direct", { durable: true });
    await channel.assertExchange(deadExchange, "direct", { durable: true });
    await channel.assertQueue(mainQueue, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": retryExchange,
        "x-dead-letter-routing-key": "notification.retry",
      },
    });
    await channel.assertQueue(retryQueue, {
      durable: true,
      arguments: {
        "x-message-ttl": retryDelayMs,
        "x-dead-letter-exchange": eventsExchange,
        "x-dead-letter-routing-key": "notification.retry",
      },
    });
    await channel.assertQueue(deadQueue, { durable: true });
    await channel.bindQueue(retryQueue, retryExchange, "notification.retry");
    await channel.bindQueue(deadQueue, deadExchange, "notification.dead");
    for (const routingKey of routingKeys) {
      await channel.bindQueue(mainQueue, eventsExchange, routingKey);
    }
    await channel.prefetch(10);
    await channel.consume(mainQueue, handleMessage);
    ready = true;
  }

  async function handleMessage(message) {
    if (!message || !channel) return;
    let event;
    try {
      event = JSON.parse(message.content.toString());
      await processor.processEvent(event);
      channel.ack(message);
    } catch (error) {
      logger.error("Notification event failed:", error.message);
      const attempts = retryCount(message);
      if (error.permanent || error instanceof SyntaxError || attempts >= maxRetries) {
        try {
        channel.publish(
          deadExchange,
          "notification.dead",
          message.content,
          {
            persistent: true,
            contentType: message.properties.contentType || "application/json",
            headers: { ...(message.properties.headers || {}), "x-taskflow-error": String(error.message).slice(0, 500) },
          }
          );
          await channel.waitForConfirms();
          if (event?.eventId) {
            await database.processedEvent.updateMany({
              where: { eventId: event.eventId, status: { not: "PROCESSED" } },
              data: { status: "DEAD_LETTERED", processingUntil: null, lastError: error.message.slice(0, 1000) },
            });
          }
          channel.ack(message);
        } catch (deadLetterError) {
          logger.error("Notification dead-letter publish failed:", deadLetterError.message);
          channel.nack(message, false, true);
        }
      } else {
        channel.nack(message, false, false);
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
      await setup();
    } catch (error) {
      logger.error("Notification RabbitMQ consumer unavailable:", error.message);
      await connection?.close().catch(() => {});
      connection = null;
      channel = null;
      ready = false;
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
    ready = false;
  }

  return { start, stop, handleMessage, isReady: () => ready };
}

module.exports = { createNotificationEventConsumer, retryCount };
