const crypto = require("node:crypto");
const express = require("express");
const prisma = require("./config/prisma");
const socialRoutes = require("./routes/socialRoutes");
const errorHandler = require("./middleware/errorHandler");
const requireInternalService = require("./middleware/internalServiceAuth");

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
      return res.status(200).json({ success: true, service: "social-service", database: "connected" });
    } catch (error) {
      console.error("Social Service health check failed:", error.message);
      return res.status(503).json({ success: false, service: "social-service", database: "disconnected" });
    }
  });

  app.get("/internal/social/users/:userId/followers", requireInternalService, async (req, res) => {
    const follows = await database.follow.findMany({
      where: { followeeId: req.params.userId },
      select: { followerId: true },
    });
    return res.status(200).json({
      success: true,
      userIds: follows.map((follow) => follow.followerId),
    });
  });

  app.get("/internal/social/engagement/export", requireInternalService, async (req, res) => {
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const pageSize = req.query.pageSize === undefined ? 100 : Number(req.query.pageSize);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
      return res.status(400).json({ success: false, message: "Invalid export pagination" });
    }
    const skip = (page - 1) * pageSize;
    const [likes, ratings, likeTotal, ratingTotal] = await Promise.all([
      database.like.findMany({
        select: { noteId: true, userId: true },
        orderBy: { id: "asc" },
        skip,
        take: pageSize,
      }),
      database.rating.findMany({
        select: { noteId: true, userId: true, value: true },
        orderBy: { id: "asc" },
        skip,
        take: pageSize,
      }),
      database.like.count(),
      database.rating.count(),
    ]);
    return res.status(200).json({
      success: true,
      data: { likes, ratings, totals: { likes: likeTotal, ratings: ratingTotal } },
      pagination: { page, pageSize },
    });
  });

  app.use("/api/social", socialRoutes);
  app.use((req, res) => res.status(404).json({ success: false, message: "Route not found" }));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };