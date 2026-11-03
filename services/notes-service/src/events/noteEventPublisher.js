const amqp = require("amqplib");

const exchangeName = "taskflow.events";
const routingKeys = {
  NotePublished: "note.published",
  NoteUpdated: "note.updated",
  NoteRestricted: "note.restricted",
  NoteRestored: "note.restored",
  NoteDeleted: "note.deleted",
  NoteVisibilityChanged: "note.visibility_changed",
  NoteLiked: "note.liked",
  NoteUnliked: "note.unliked",
  NoteRated: "note.rated",
  NoteRatingUpdated: "note.rating_updated",
};

function createNoteEventPublisher({ connect = amqp.connect, logger = console } = {}) {
  let connection;
  let channel;
  let channelPromise;

  async function getChannel() {
    if (channel) return channel;

    if (!channelPromise) {
      channelPromise = (async () => {
        const connectionOptions = process.env.RABBITMQ_URL || {
          protocol: "amqp",
          hostname: process.env.RABBITMQ_HOST || "rabbitmq",
          port: Number(process.env.RABBITMQ_PORT || 5672),
          username: process.env.RABBITMQ_USER,
          password: process.env.RABBITMQ_PASSWORD,
          heartbeat: 30,
        };

        connection = await connect(connectionOptions);
        connection.on("close", () => {
          connection = null;
          channel = null;
          channelPromise = null;
        });
        channel = await connection.createConfirmChannel();
        await channel.assertExchange(exchangeName, "topic", { durable: true });
        return channel;
      })().catch((error) => {
        channelPromise = null;
        throw error;
      });
    }

    return channelPromise;
  }

  return {
    async publish(event) {
      const routingKey = routingKeys[event.eventType];
      if (!routingKey) throw new Error(`Unsupported note event: ${event.eventType}`);

      const activeChannel = await getChannel();
      activeChannel.publish(
        exchangeName,
        routingKey,
        Buffer.from(JSON.stringify({
          eventId: event.id,
          type: event.eventType,
          occurredAt: event.createdAt,
          payload: event.payload,
        })),
        { persistent: true, contentType: "application/json" }
      );
      await activeChannel.waitForConfirms();
    },

    async close() {
      const activeChannel = channel;
      const activeConnection = connection;
      channel = null;
      connection = null;
      channelPromise = null;

      try {
        await activeChannel?.close();
      } catch (error) {
        logger.warn("Error closing Notes RabbitMQ channel:", error.message);
      }
      try {
        await activeConnection?.close();
      } catch (error) {
        logger.warn("Error closing Notes RabbitMQ connection:", error.message);
      }
    },
  };
}

module.exports = {
  createNoteEventPublisher,
  noteEventPublisher: createNoteEventPublisher(),
};