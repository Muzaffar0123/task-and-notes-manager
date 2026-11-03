require("dotenv").config();

const prisma = require("../src/config/prisma");
const { enqueueNoteEvent } = require("../src/services/noteEventOutbox");

const pageSize = 100;

async function fetchLegacyPage(page) {
  const serviceUrl = process.env.SOCIAL_SERVICE_URL;
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!serviceUrl || !token) throw new Error("SOCIAL_SERVICE_URL and INTERNAL_SERVICE_TOKEN are required");

  const url = new URL("/internal/social/engagement/export", serviceUrl);
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", String(pageSize));
  const response = await fetch(url, {
    headers: { "x-internal-service-token": token },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Social Service returned HTTP ${response.status}`);
  const result = await response.json();
  if (!Array.isArray(result.data?.likes) || !Array.isArray(result.data?.ratings) ||
      !Number.isInteger(result.data?.totals?.likes) || !Number.isInteger(result.data?.totals?.ratings)) {
    throw new Error("Social Service returned an invalid engagement export");
  }
  return result.data;
}

async function importLegacyEngagement() {
  let page = 1;
  let likeCount = 0;
  let ratingCount = 0;
  let selfEngagementsSkipped = 0;
  let invalidRatingsSkipped = 0;
  let totalLikes = 0;
  let totalRatings = 0;

  while (true) {
    const batch = await fetchLegacyPage(page);
    totalLikes = batch.totals.likes;
    totalRatings = batch.totals.ratings;
    const noteIds = [...new Set([
      ...batch.likes.map((item) => item.noteId),
      ...batch.ratings.map((item) => item.noteId),
    ])];
    if (noteIds.some((id) => typeof id !== "string" || !id)) {
      throw new Error("Social Service export contains an invalid note id");
    }

    await prisma.$transaction(async (transaction) => {
      const notes = noteIds.length
        ? await transaction.note.findMany({
          where: { id: { in: noteIds }, visibility: "PUBLIC", status: "PUBLISHED" },
          select: { id: true, ownerId: true, visibility: true, status: true, publishedAt: true },
        })
        : [];
      const byId = new Map(notes.map((note) => [note.id, note]));
      const likes = batch.likes.filter((like) => {
        const note = byId.get(like.noteId);
        if (note && note.ownerId === like.userId) selfEngagementsSkipped += 1;
        return note && note.ownerId !== like.userId;
      });
      const ratings = batch.ratings.filter((rating) => {
        const note = byId.get(rating.noteId);
        if (note && note.ownerId === rating.userId) selfEngagementsSkipped += 1;
        if (!Number.isInteger(rating.value) || rating.value < 1 || rating.value > 5) {
          invalidRatingsSkipped += 1;
          return false;
        }
        return note && note.ownerId !== rating.userId;
      });
      const createdLikes = likes.length
        ? await transaction.noteLike.createMany({
          data: likes.map(({ noteId, userId }) => ({ noteId, userId })),
          skipDuplicates: true,
        })
        : { count: 0 };
      const createdRatings = ratings.length
        ? await transaction.noteRating.createMany({
          data: ratings.map(({ noteId, userId, value }) => ({ noteId, userId, value })),
          skipDuplicates: true,
        })
        : { count: 0 };
      likeCount += createdLikes.count;
      ratingCount += createdRatings.count;
      for (const note of notes) await enqueueNoteEvent(transaction, "NoteUpdated", note);
    });

    if (page * pageSize >= Math.max(totalLikes, totalRatings)) break;
    page += 1;
  }

  console.log(JSON.stringify({
    importedLikes: likeCount,
    importedRatings: ratingCount,
    skippedSelfEngagements: selfEngagementsSkipped,
    skippedInvalidRatings: invalidRatingsSkipped,
    exportedLikeRows: totalLikes,
    exportedRatingRows: totalRatings,
  }));
}

importLegacyEngagement()
  .catch((error) => {
    console.error("Legacy engagement import failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
