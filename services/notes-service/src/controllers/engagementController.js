const prisma = require("../config/prisma");
const { enqueueNoteEvent } = require("../services/noteEventOutbox");
const AppError = require("../utils/appError");

async function findPublicNote(transaction, noteId) {
  const note = await transaction.note.findFirst({
    where: { id: noteId, visibility: "PUBLIC", status: "PUBLISHED" },
    select: { id: true, ownerId: true, visibility: true, status: true, publishedAt: true },
  });
  if (!note) throw new AppError(404, "Public note not found");
  return note;
}

function assertNotOwner(note, userId) {
  if (note.ownerId === userId) throw new AppError(400, "You cannot engage with your own note");
}

async function runEngagementTransaction(callback) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(callback, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error.code !== "P2034") throw error;
      if (attempt === 2) throw new AppError(409, "Note changed while processing engagement; please retry");
    }
  }
  throw new AppError(409, "Note changed while processing engagement; please retry");
}

async function engagementSnapshot(transaction, note) {
  const [likeCount, ratings] = await Promise.all([
    transaction.noteLike.count({ where: { noteId: note.id } }),
    transaction.noteRating.aggregate({
      where: { noteId: note.id },
      _avg: { value: true },
      _sum: { value: true },
      _count: { _all: true },
    }),
  ]);
  return {
    likeCount,
    ratingCount: ratings._count._all,
    ratingAverage: ratings._avg.value || 0,
    ratingTotal: ratings._sum.value || 0,
  };
}

async function queueEngagementEvent(transaction, eventType, note, actorId, value) {
  const engagement = await engagementSnapshot(transaction, note);
  await transaction.noteEventOutbox.create({
    data: {
      eventType,
      noteId: note.id,
      ownerId: note.ownerId,
      payload: {
        ...note,
        actorId,
        ...(value === undefined ? {} : { value }),
        ...engagement,
      },
    },
  });
  return engagement;
}

async function likeNote(req, res) {
  const result = await runEngagementTransaction(async (transaction) => {
    const note = await findPublicNote(transaction, req.params.id);
    assertNotOwner(note, req.user.id);
    await transaction.noteLike.create({ data: { noteId: note.id, userId: req.user.id } });
    return queueEngagementEvent(transaction, "NoteLiked", note, req.user.id);
  });
  return res.status(201).json({ success: true, data: result });
}

async function unlikeNote(req, res) {
  const engagement = await runEngagementTransaction(async (transaction) => {
    const note = await findPublicNote(transaction, req.params.id);
    assertNotOwner(note, req.user.id);
    const result = await transaction.noteLike.deleteMany({
      where: { noteId: note.id, userId: req.user.id },
    });
    if (result.count === 0) throw new AppError(404, "Like not found");
    return queueEngagementEvent(transaction, "NoteUnliked", note, req.user.id);
  });
  return res.status(200).json({ success: true, data: engagement });
}

async function getLikes(req, res) {
  const note = await findPublicNote(prisma, req.params.id);
  const [count, mine] = await Promise.all([
    prisma.noteLike.count({ where: { noteId: note.id } }),
    prisma.noteLike.findUnique({
      where: { noteId_userId: { noteId: note.id, userId: req.user.id } },
      select: { id: true },
    }),
  ]);
  return res.status(200).json({ success: true, data: { count, likedByMe: Boolean(mine) } });
}

async function getRatings(req, res) {
  const note = await findPublicNote(prisma, req.params.id);
  const [aggregate, mine] = await Promise.all([
    prisma.noteRating.aggregate({
      where: { noteId: note.id },
      _avg: { value: true },
      _count: { _all: true },
    }),
    prisma.noteRating.findUnique({
      where: { noteId_userId: { noteId: note.id, userId: req.user.id } },
      select: { value: true },
    }),
  ]);
  return res.status(200).json({
    success: true,
    data: {
      average: aggregate._avg.value || 0,
      count: aggregate._count._all,
      myRating: mine?.value ?? null,
    },
  });
}

async function rateNote(req, res) {
  const { value } = req.body;
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new AppError(400, "Rating must be an integer from 1 to 5");
  }

  let eventType = "NoteRated";
  let engagement;
  try {
    engagement = await runEngagementTransaction(async (transaction) => {
      const note = await findPublicNote(transaction, req.params.id);
      assertNotOwner(note, req.user.id);
      await transaction.noteRating.create({
        data: { noteId: note.id, userId: req.user.id, value },
      });
      return queueEngagementEvent(transaction, eventType, note, req.user.id, value);
    });
  } catch (error) {
    if (error.code !== "P2002") throw error;
    eventType = "NoteRatingUpdated";
    engagement = await runEngagementTransaction(async (transaction) => {
      const note = await findPublicNote(transaction, req.params.id);
      assertNotOwner(note, req.user.id);
      await transaction.noteRating.update({
        where: { noteId_userId: { noteId: note.id, userId: req.user.id } },
        data: { value },
      });
      return queueEngagementEvent(transaction, eventType, note, req.user.id, value);
    });
  }
  return res.status(200).json({ success: true, data: engagement });
}

async function getEngagement(req, res) {
  const note = await findPublicNote(prisma, req.params.id);
  const [likeCount, ratings, likedByMe] = await Promise.all([
    prisma.noteLike.count({ where: { noteId: note.id } }),
    prisma.noteRating.aggregate({
      where: { noteId: note.id },
      _avg: { value: true },
      _sum: { value: true },
      _count: { _all: true },
    }),
    prisma.noteLike.findUnique({
      where: { noteId_userId: { noteId: note.id, userId: req.user.id } },
      select: { id: true },
    }),
  ]);
  return res.status(200).json({
    success: true,
    data: {
      likeCount,
      ratingCount: ratings._count._all,
      ratingAverage: ratings._avg.value || 0,
      ratingTotal: ratings._sum.value || 0,
      likedByMe: Boolean(likedByMe),
    },
  });
}

module.exports = { likeNote, unlikeNote, getLikes, getRatings, rateNote, getEngagement };
