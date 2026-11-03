require("dotenv").config();

const prisma = require("./config/prisma");
const { createApp } = require("./app");
const { createNoteEventConsumer } = require("./events/noteEventConsumer");
const { createSocialOutboxWorker } = require("./events/socialOutboxWorker");
const { socialEventPublisher } = require("./events/socialEventPublisher");

const app = createApp();
const port = process.env.PORT || 3005;
const server = app.listen(port, () => console.log(`Social Service running on port ${port}`));
const rabbitConfigured = Boolean(
  process.env.RABBITMQ_URL ||
  (process.env.RABBITMQ_USER && process.env.RABBITMQ_PASSWORD)
);
const noteConsumer = rabbitConfigured ? createNoteEventConsumer({ prisma }) : null;
const outboxWorker = rabbitConfigured
  ? createSocialOutboxWorker({ prisma, publisher: socialEventPublisher })
  : null;

if (noteConsumer) {
  void noteConsumer.start();
  outboxWorker.start();
} else {
  console.warn("RabbitMQ is not configured; note eligibility events will not be consumed");
}

async function shutdown() {
  server.close(async () => {
    try {
      await noteConsumer?.stop();
      await outboxWorker?.stop();
      await socialEventPublisher.close();
      await prisma.$disconnect();
      process.exit(0);
    } catch (error) {
      console.error("Social Service shutdown failed:", error.message);
      process.exit(1);
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);