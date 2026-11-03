const prisma = require("../config/prisma");
const { discoverUsers, getPublicProfile } = require("../services/userClient");
const { creatorLevel } = require("../services/creatorPopularity");
const AppError = require("../utils/appError");

function parsePage(query, maximum = 50) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (
    !Number.isInteger(page) || page < 1 || page > 1000000 ||
    !Number.isInteger(pageSize) || pageSize < 1 || pageSize > maximum
  ) {
    throw new AppError(400, `Page must be positive and pageSize must be between 1 and ${maximum}`);
  }
  return { page, pageSize };
}

async function getUsers(req, res) {
  const { page, pageSize } = parsePage(req.query);
  const search = req.query.search === undefined ? "" : req.query.search;
  if (typeof search !== "string" || search.length > 80) {
    throw new AppError(400, "Search must be at most 80 characters");
  }
  const result = await discoverUsers({
    search: search.trim(),
    page,
    pageSize,
    authorization: req.headers.authorization,
  });
  if (!Array.isArray(result.data) || !result.pagination) {
    throw new AppError(503, "User Service returned an invalid discovery response");
  }
  const users = result.data;
  const ids = users.map((user) => user.id);
  const [following, counts] = await Promise.all([
    ids.length
      ? prisma.follow.findMany({
        where: { followerId: req.user.id, followeeId: { in: ids } },
        select: { followeeId: true },
      })
      : [],
    ids.length
      ? prisma.follow.groupBy({
        by: ["followeeId"],
        where: { followeeId: { in: ids } },
        _count: { _all: true },
      })
      : [],
  ]);
  const followingIds = new Set(following.map((follow) => follow.followeeId));
  const followerCounts = new Map(counts.map((item) => [item.followeeId, item._count._all]));

  return res.status(200).json({
    success: true,
    data: users.map((user) => ({
      ...user,
      followerCount: followerCounts.get(user.id) || 0,
      following: followingIds.has(user.id),
    })),
    pagination: result.pagination,
  });
}

async function getFollowStatus(req, res) {
  const userId = req.params.userId;
  if (!userId.trim() || userId.length > 100) throw new AppError(400, "Invalid userId");
  if (userId === req.user.id) {
    return res.status(200).json({ success: true, following: false });
  }
  const profile = await getPublicProfile(userId, req.headers.authorization);
  if (!profile) throw new AppError(404, "User not found");
  const follow = await prisma.follow.findUnique({
    where: { followerId_followeeId: { followerId: req.user.id, followeeId: userId } },
    select: { id: true },
  });
  return res.status(200).json({ success: true, following: Boolean(follow) });
}

async function discoverPublicNotes(req, res) {
  const { page, pageSize } = parsePage(req.query, 100);
  const search = req.query.search === undefined ? "" : req.query.search;
  const category = req.query.category === undefined ? "" : req.query.category;
  const sortBy = req.query.sortBy === undefined ? "createdAt" : req.query.sortBy;
  if (typeof search !== "string" || search.length > 200) throw new AppError(400, "Search must be at most 200 characters");
  if (typeof category !== "string" || category.length > 80) throw new AppError(400, "Category must be at most 80 characters");
  if (!["createdAt", "popularityScore"].includes(sortBy)) throw new AppError(400, "Sort by createdAt or popularityScore");

  const serviceUrl = process.env.NOTES_SERVICE_URL;
  if (!serviceUrl) throw new AppError(503, "Notes Service is not configured");
  const url = new URL(`${serviceUrl}/api/notes/search`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("sortBy", sortBy);
  url.searchParams.set("sortOrder", "desc");
  url.searchParams.set("visibility", "PUBLIC");
  if (search.trim()) url.searchParams.set("search", search.trim());
  if (category.trim()) url.searchParams.set("category", category.trim());

  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: req.headers.authorization },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new AppError(503, "Notes Service is unavailable");
  }
  if (response.status === 401) throw new AppError(401, "Authentication is no longer valid");
  if (!response.ok) throw new AppError(503, "Notes Service could not discover public notes");

  const result = await response.json();
  if (!Array.isArray(result.data) || !result.pagination) {
    throw new AppError(503, "Notes Service returned an invalid discovery response");
  }
  const data = result.data
    .filter((note) => note.visibility === "PUBLIC" && note.status === "PUBLISHED")
    .map(({ files, ...publicNote }) => publicNote);
  return res.status(200).json({ success: true, data, pagination: result.pagination });
}

async function getPopularCreators(req, res) {
  const { page, pageSize } = parsePage(req.query);
  const where = { popularityScore: { gt: 0 } };
  const [creators, allCreators] = await Promise.all([
    prisma.eligibleNote.groupBy({
      by: ["ownerId"],
      where,
      _sum: { likeCount: true, ratingCount: true, ratingTotal: true, popularityScore: true },
      orderBy: [{ _sum: { popularityScore: "desc" } }, { ownerId: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.eligibleNote.groupBy({ by: ["ownerId"], where }),
  ]);
  const data = [];
  for (const creator of creators) {
    const profile = await getPublicProfile(creator.ownerId, req.headers.authorization);
    if (!profile) continue;
    const sums = creator._sum;
    const score = sums.popularityScore || 0;
    data.push({
      ...profile,
      popularityScore: score,
      creatorLevel: creatorLevel(score),
      totalLikesReceived: sums.likeCount || 0,
      totalRatings: sums.ratingCount || 0,
      averageRating: sums.ratingCount
        ? Number(((sums.ratingTotal || 0) / sums.ratingCount).toFixed(2))
        : 0,
    });
  }
  return res.status(200).json({
    success: true,
    data,
    pagination: { page, pageSize, total: allCreators.length },
  });
}

module.exports = { getUsers, getFollowStatus, discoverPublicNotes, getPopularCreators };
