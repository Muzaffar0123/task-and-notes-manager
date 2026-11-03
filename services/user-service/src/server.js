require("dotenv").config();

const express = require("express");
const prisma = require("./config/prisma");
const userRoutes = require("./routes/userRoutes");
const { createUserOutboxWorker } = require("./events/userOutboxWorker");
const { userEventPublisher } = require("./events/userEventPublisher");

const app = express();
 

app.use(express.json());

// Health check
app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return res.status(200).json({
      success: true,
      service: "user-service",
      database: "connected",
      message: "User Service is running",
    });
  } catch (error) {
    console.error("Health check failed:", error);

    return res.status(503).json({
      success: false,
      service: "user-service",
      database: "disconnected",
      message: "Database is unavailable",
    });
  }
});

// Mount user routes
app.use("/api/users", userRoutes);

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`User Service running on port ${PORT}`);
});
const rabbitConfigured = Boolean(
  process.env.RABBITMQ_URL ||
  (process.env.RABBITMQ_USER && process.env.RABBITMQ_PASSWORD)
);
const userOutboxWorker = rabbitConfigured
  ? createUserOutboxWorker({ prisma, publisher: userEventPublisher })
  : null;

if (userOutboxWorker) {
  userOutboxWorker.start();
} else {
  console.warn("RabbitMQ is not configured; UserRegistered events will remain in the outbox");
}

// Gracefully close server and database connection
async function shutdown() {
  console.log("Shutting down User Service...");

  server.close(async () => {
    try {
      await userOutboxWorker?.stop();
      await userEventPublisher.close();
      await prisma.$disconnect();
      console.log("Database connection closed");
      process.exit(0);
    } catch (error) {
      console.error("Error closing database connection:", error);
      process.exit(1);
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);