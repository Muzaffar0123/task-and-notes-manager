const prisma = require("../config/prisma");
const { getEligiblePublicNote } = require("../services/notesClient");
const AppError = require("../utils/appError");

function parsePage(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (
    !Number.isInteger(page) || page < 1 || page > 1000000 ||
    !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50
  ) {
    throw new AppError(400, "Page must be positive and pageSize must be between 1 and 50");
  }
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

async function revalidateCandidates(candidates, authorization) {
  const results = [];
  for (let index = 0; index < candidates.length; index += 5) {
    const batch = candidates.slice(index, index + 5);
    results.push(...await Promise.all(batch.map(async (candidate) => {
      const note = await getEligiblePublicNote(candidate.noteId, authorization);
      if (!note || note.ownerId !== candidate.ownerId) {
        await prisma.eligibleNote.deleteMany({ where: { noteId: candidate.noteId } });
        return null;
      }
      return {
        note,
        engagement: {
          likeCount: candidate.likeCount,
          commentCount: candidate.commentCount,
          ratingCount: candidate.ratingCount,
          ratingAverage: candidate.ratingAverage,
        },
      };
    })));
  }
  return results.filter(Boolean);
}

async function getFeed(req, res) {
  const { page, pageSize, skip, take } = parsePage(req.query);
  const follows = await prisma.follow.findMany({
    where: { followerId: req.user.id },
    select: { followeeId: true },
  });
  const ownerIds = follows.map((follow) => follow.followeeId);
  if (ownerIds.length === 0) {
    return res.status(200).json({ success: true, data: [], pagination: { page, pageSize, total: 0 } });
  }

  const where = { ownerId: { in: ownerIds } };
  const [candidates, total] = await Promise.all([
    prisma.eligibleNote.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { noteId: "desc" }],
      skip,
      take,
    }),
    prisma.eligibleNote.count({ where }),
  ]);
  const data = await revalidateCandidates(candidates, req.headers.authorization);
  return res.status(200).json({ success: true, data, pagination: { page, pageSize, total } });
}

async function getTrending(req, res) {
  const { page, pageSize, skip, take } = parsePage(req.query);
  const [candidates, total] = await Promise.all([
    prisma.eligibleNote.findMany({
      orderBy: [
        { likeCount: "desc" },
        { commentCount: "desc" },
        { ratingAverage: "desc" },
        { publishedAt: "desc" },
      ],
      skip,
      take,
    }),
    prisma.eligibleNote.count(),
  ]);
  const data = await revalidateCandidates(candidates, req.headers.authorization);
  return res.status(200).json({ success: true, data, pagination: { page, pageSize, total } });
}

module.exports = { getFeed, getTrending, revalidateCandidates };