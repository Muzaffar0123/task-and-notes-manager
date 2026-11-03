const crypto = require("node:crypto");
const express = require("express");
const prisma = require("./config/prisma");
const notificationRoutes = require("./routes/notificationRoutes");
const errorHandler = require("./middleware/errorHandler");

function createApp({ database = prisma, eventConsumer } = {}) {
  const app = express();
  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    next();
  });
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", async (req, res) => {
    try {
      await database.$queryRaw`SELECT 1`;
      const brokerRequired = Boolean(
        process.env.RABBITMQ_URL ||
        (process.env.RABBITMQ_USER && process.env.RABBITMQ_PASSWORD)
      );
      const eventsReady = !brokerRequired || Boolean(eventConsumer?.isReady());
      return res.status(eventsReady ? 200 : 503).json({
        success: eventsReady,
        service: "notification-service",
        database: "connected",
        events: eventsReady ? "ready" : "connecting",
      });
    } catch (error) {
      console.error("Notification Service health check failed:", error.message);
      return res.status(503).json({ success: false, service: "notification-service", database: "disconnected" });
    }
  });

  app.use("/api/notifications", notificationRoutes);
  app.use((req, res) => res.status(404).json({ success: false, message: "Route not found" }));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };