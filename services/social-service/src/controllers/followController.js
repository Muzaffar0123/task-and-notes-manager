const prisma = require("../config/prisma");
const { getPublicProfile } = require("../services/userClient");
const { enqueueSocialEvent } = require("../services/socialEventOutbox");
const AppError = require("../utils/appError");

function parsePage(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (
    !Number.isInteger(page) || page < 1 || page > 1000000 ||
    !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100
  ) {
    throw new AppError(400, "Page must be positive and pageSize must be between 1 and 100");
  }
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

async function followUser(req, res) {
  const { followeeId } = req.body;
  if (typeof followeeId !== "string" || !followeeId.trim() || followeeId.length > 100) {
    throw new AppError(400, "followeeId is required");
  }
  if (followeeId === req.user.id) throw new AppError(400, "You cannot follow yourself");

  const profile = await getPublicProfile(followeeId, req.headers.authorization);
  if (!profile) throw new AppError(404, "User not found");

  const follow = await prisma.$transaction(async (transaction) => {
    const created = await transaction.follow.create({
      data: { followerId: req.user.id, followeeId },
      select: { id: true, followerId: true, followeeId: true, createdAt: true },
    });
    await enqueueSocialEvent(
      transaction,
      "FollowCreated",
      null,
      req.user.id,
      { followerId: req.user.id, followeeId }
    );
    return created;
  });
  return res.status(201).json({ success: true, data: { ...follow, user: profile } });
}

async function unfollowUser(req, res) {
  if (req.params.userId === req.user.id) throw new AppError(400, "You cannot unfollow yourself");
  const result = await prisma.follow.deleteMany({
    where: { followerId: req.user.id, followeeId: req.params.userId },
  });
  if (result.count === 0) throw new AppError(404, "Follow relationship not found");
  return res.status(200).json({ success: true, message: "User unfollowed" });
}

async function listConnections(req, res, direction) {
  const { page, pageSize, skip, take } = parsePage(req.query);
  const targetUserId = req.query.userId === undefined ? req.user.id : req.query.userId;
  if (typeof targetUserId !== "string" || !targetUserId.trim() || targetUserId.length > 100) {
    throw new AppError(400, "Invalid userId");
  }
  const profile = await getPublicProfile(targetUserId, req.headers.authorization);
  if (!profile) throw new AppError(404, "User not found");

  if (targetUserId !== req.user.id) {
    const visibility = direction === "following"
      ? profile.followingVisibility
      : profile.followersVisibility;
    const isFollower = visibility === "FOLLOWERS_ONLY"
      ? await prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId: req.user.id, followeeId: targetUserId } },
        select: { id: true },
      })
      : null;
    if (visibility === "ONLY_ME" || (visibility === "FOLLOWERS_ONLY" && !isFollower)) {
      throw new AppError(403, "This connection list is not visible to you");
    }
  }

  const where = direction === "following"
    ? { followerId: targetUserId }
    : { followeeId: targetUserId };
  const idField = direction === "following" ? "followeeId" : "followerId";
  const [connections, total] = await Promise.all([
    prisma.follow.findMany({
      where,
      select: { id: true, followerId: true, followeeId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.follow.count({ where }),
  ]);

  const users = await Promise.all(connections.map(async (connection) => ({
    ...connection,
    user: await getPublicProfile(connection[idField], req.headers.authorization),
  })));
  return res.status(200).json({
    success: true,
    data: users.filter((item) => item.user),
    pagination: { page, pageSize, total },
  });
}

async function getFollowing(req, res) {
  return listConnections(req, res, "following");
}

async function getFollowers(req, res) {
  return listConnections(req, res, "followers");
}

module.exports = { followUser, unfollowUser, getFollowing, getFollowers };