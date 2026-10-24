require("dotenv").config();

const express = require("express");
const prisma = require("./config/prisma");
const taskRoutes = require("./routes/taskRoutes");

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
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);