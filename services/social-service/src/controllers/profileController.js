const prisma = require("../config/prisma");
const { getPublicProfileByUsername } = require("../services/userClient");
const { creatorLevel } = require("../services/creatorPopularity");
const AppError = require("../utils/appError");

async function getProfile(req, res) {
  const profile = await getPublicProfileByUsername(req.params.username, req.headers.authorization);
  if (!profile) throw new AppError(404, "User not found");

  const [followerCount, followingCount, notes] = await Promise.all([
    prisma.follow.count({ where: { followeeId: profile.id } }),
    prisma.follow.count({ where: { followerId: profile.id } }),
    prisma.eligibleNote.findMany({
      where: { ownerId: profile.id },
      select: { likeCount: true, ratingCount: true, ratingAverage: true, ratingTotal: true },
    }),
  ]);
  const publicNotesCount = notes.length;
  const totalLikesReceived = notes.reduce((total, note) => total + note.likeCount, 0);
  const totalRatings = notes.reduce((total, note) => total + note.ratingCount, 0);
  const ratingPoints = notes.reduce(
    (total, note) => total + (note.ratingTotal ?? Math.round(note.ratingAverage * note.ratingCount)),
    0
  );
  const popularityScore = totalLikesReceived + ratingPoints;
  const averageRating = totalRatings ? ratingPoints / totalRatings : 0;

  return res.status(200).json({
    success: true,
    data: {
      ...profile,
      followerCount,
      followingCount,
      publicNotesCount,
      totalLikesReceived,
      totalRatings,
      averageRating: Number(averageRating.toFixed(2)),
      popularityScore,
      creatorLevel: creatorLevel(popularityScore),
    },
  });
}

module.exports = { getProfile };
