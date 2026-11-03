require("dotenv").config();

const express = require("express");
const prisma = require("./config/prisma");
const { createApp } = require("./app");
const { createNotificationEventConsumer } = require("./events/notificationEventConsumer");
const rabbitConfigured = Boolean(
  process.env.RABBITMQ_URL ||
  (process.env.RABBITMQ_USER && process.env.RABBITMQ_PASSWORD)
);
const eventConsumer = rabbitConfigured ? createNotificationEventConsumer() : null;
const app = createApp({ eventConsumer });
const PORT = process.env.PORT || 3003;
const server = app.listen(PORT, () => {
  console.log(`Notification Service running on port ${PORT}`);
});

if (eventConsumer) {
  void eventConsumer.start();
} else {
  console.warn("RabbitMQ is not configured; notification events will not be consumed");
}

async function shutdown() {
  server.close(async () => {
    try {
      await eventConsumer?.stop();
      await prisma.$disconnect();
      process.exit(0);
    } catch (error) {
      console.error("Error disconnecting Prisma:", error);
      process.exit(1);
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
