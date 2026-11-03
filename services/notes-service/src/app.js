const crypto = require("node:crypto");
const express = require("express");
const prisma = require("./config/prisma");
const noteRoutes = require("./routes/noteRoutes");
const adminRoutes = require("./routes/adminRoutes");
const errorHandler = require("./middleware/errorHandler");

function createApp({ database = prisma } = {}) {
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
      return res.status(200).json({ success: true, service: "notes-service", database: "connected" });
    } catch (error) {
      console.error("Notes Service health check failed:", error.message);
      return res.status(503).json({ success: false, service: "notes-service", database: "disconnected" });
    }
  });

  app.use("/api/notes/admin", adminRoutes);
  app.use("/api/notes", noteRoutes);
  app.use((req, res) => res.status(404).json({ success: false, message: "Route not found" }));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };