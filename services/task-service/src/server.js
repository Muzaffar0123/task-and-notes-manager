require("dotenv").config();

const express = require("express");
const prisma = require("./config/prisma");
const taskRoutes = require("./routes/taskRoutes");
const { taskEventPublisher } = require("./events/taskEventPublisher");
const { createTaskEventWorker } = require("./events/taskEventWorker");

const app = express();

app.use(express.json());

app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return res.status(200).json({
      success: true,
      service: "task-service",
      database: "connected",
    });
  } catch (error) {
    console.error("Task Service health check failed:", error);

    return res.status(503).json({
      success: false,
      service: "task-service",
      database: "disconnected",
    });
  }
});

app.use("/api/tasks", taskRoutes);

const rabbitConfigured = Boolean(
  process.env.RABBITMQ_URL ||
  (process.env.RABBITMQ_USER && process.env.RABBITMQ_PASSWORD)
);
const taskEventWorker = rabbitConfigured
  ? createTaskEventWorker({ prisma, publisher: taskEventPublisher })
  : null;

if (taskEventWorker) {
  taskEventWorker.start();
} else {
  console.warn("RabbitMQ is not configured; task events will remain in the outbox");
}

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

const PORT = process.env.PORT || 3002;

const server = app.listen(PORT, () => {
  console.log(`Task Service running on port ${PORT}`);
});

async function shutdown() {
  server.close(async () => {
    try {
      await taskEventWorker?.stop();
      await taskEventPublisher.close();
      await prisma.$disconnect();
      process.exit(0);
    } catch (error) {
      console.error("Error shutting down Task Service:", error);
      process.exit(1);
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);