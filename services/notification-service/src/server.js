require("dotenv").config();

const express = require("express");
const prisma = require("./config/prisma");
const notificationRoutes = require("./routes/notificationRoutes");

const app = express();

app.use(express.json());

app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return res.status(200).json({
      success: true,
      service: "notification-service",
      database: "connected",
    });
  } catch (error) {
    console.error("Notification Service health check failed:", error);

    return res.status(503).json({
      success: false,
      service: "notification-service",
      database: "disconnected",
    });
  }
});

app.use("/api/notifications", notificationRoutes);

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

const PORT = process.env.PORT || 3003;

const server = app.listen(PORT, () => {
  console.log(`Notification Service running on port ${PORT}`);
});

async function shutdown() {
  server.close(async () => {
    try {
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
