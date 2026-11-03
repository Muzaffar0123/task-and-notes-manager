require("dotenv").config();

const prisma = require("./config/prisma");
const { createApp } = require("./app");
const { noteEventPublisher } = require("./events/noteEventPublisher");
const { createNoteEventWorker } = require("./events/noteEventWorker");

const app = createApp();
const port = process.env.PORT || 3004;
const server = app.listen(port, () => {
  console.log(`Notes Service running on port ${port}`);
});
const rabbitConfigured = Boolean(
  process.env.RABBITMQ_URL ||
  (process.env.RABBITMQ_USER && process.env.RABBITMQ_PASSWORD)
);
const eventWorker = rabbitConfigured
  ? createNoteEventWorker({ prisma, publisher: noteEventPublisher })
  : null;

if (eventWorker) {
  eventWorker.start();
} else {
  console.warn("RabbitMQ is not configured; Notes events will remain in the outbox");
}

async function shutdown() {
  server.close(async () => {
    try {
      await eventWorker?.stop();
      await noteEventPublisher.close();
      await prisma.$disconnect();
      process.exit(0);
    } catch (error) {
      console.error("Notes Service shutdown failed:", error.message);
      process.exit(1);
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);