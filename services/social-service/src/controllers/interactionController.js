const prisma = require("../config/prisma");
const { getEligiblePublicNote } = require("../services/notesClient");
const { refreshEligibleNoteStats } = require("../services/engagementStats");
const { enqueueSocialEvent } = require("../services/socialEventOutbox");
const AppError = require("../utils/appError");

function parsePage(query, maximum = 100) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (
    !Number.isInteger(page) || page < 1 || page > 1000000 ||
    !Number.isInteger(pageSize) || pageSize < 1 || pageSize > maximum
  ) {
    throw new AppError(400, `Page must be positive and pageSize must be between 1 and ${maximum}`);
  }
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

async function ensureEligibleNote(req, noteId) {
  const note = await getEligiblePublicNote(noteId, req.headers.authorization);
  if (!note) throw new AppError(404, "Public note not found");
  return note;
}

async function listComments(req, res) {
  const note = await ensureEligibleNote(req, req.params.noteId);
  const { page, pageSize, skip, take } = parsePage(req.query, 50);
  const where = { noteId: note.id, parentId: null, deletedAt: null };
  const [data, total] = await Promise.all([
    prisma.comment.findMany({
      where,
      select: {
        id: true,
        noteId: true,
        userId: true,
        parentId: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        replies: {
          where: { deletedAt: null },
          select: { id: true, noteId: true, userId: true, parentId: true, content: true, createdAt: true, updatedAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.comment.count({ where }),
  ]);
  return res.status(200).json({ success: true, data, pagination: { page, pageSize, total } });
}

async function createComment(req, res) {
  const note = await ensureEligibleNote(req, req.params.noteId);
  const { content, parentId = null } = req.body;
  if (typeof content !== "string" || !content.trim() || content.trim().length > 5000) {
    throw new AppError(400, "Comment content is required and must be at most 5000 characters");
  }
  if (parentId !== null && (typeof parentId !== "string" || !parentId.trim())) {
    throw new AppError(400, "Invalid parent comment");
  }
  if (parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: parentId, noteId: note.id, deletedAt: null },
      select: { id: true },
    });
    if (!parent) throw new AppError(404, "Parent comment not found");
  }

  const comment = await prisma.$transaction(async (transaction) => {
    const created = await transaction.comment.create({
      data: { noteId: note.id, userId: req.user.id, parentId, content: content.trim() },
      select: { id: true, noteId: true, userId: true, parentId: true, content: true, createdAt: true },
    });
    await refreshEligibleNoteStats(transaction, note.id);
    await enqueueSocialEvent(transaction, "CommentCreated", note.id, req.user.id, {
      noteId: note.id,
      ownerId: note.ownerId,
      actorId: req.user.id,
      commentId: created.id,
      parentId: created.parentId,
    });
    return created;
  });
  return res.status(201).json({ success: true, data: comment });
}

async function updateComment(req, res) {
  const comment = await prisma.comment.findFirst({
    where: { id: req.params.commentId, noteId: req.params.noteId, userId: req.user.id, deletedAt: null },
    select: { id: true },
  });
  if (!comment) throw new AppError(404, "Comment not found");

  const { content } = req.body;
  if (typeof content !== "string" || !content.trim() || content.trim().length > 5000) {
    throw new AppError(400, "Comment content is required and must be at most 5000 characters");
  }
  await ensureEligibleNote(req, req.params.noteId);
  const updated = await prisma.comment.update({
    where: { id: comment.id },
    data: { content: content.trim() },
    select: { id: true, noteId: true, userId: true, parentId: true, content: true, createdAt: true, updatedAt: true },
  });
  return res.status(200).json({ success: true, data: updated });
}

async function deleteComment(req, res) {
  const note = await ensureEligibleNote(req, req.params.noteId);
  const comment = await prisma.comment.findFirst({
    where: { id: req.params.commentId, noteId: note.id, userId: req.user.id, deletedAt: null },
    select: { id: true },
  });
  if (!comment) throw new AppError(404, "Comment not found");

  await prisma.$transaction(async (transaction) => {
    await transaction.comment.update({
      where: { id: comment.id },
      data: { deletedAt: new Date(), content: "" },
    });
    await refreshEligibleNoteStats(transaction, note.id);
    await enqueueSocialEvent(transaction, "CommentDeleted", note.id, req.user.id, {
      noteId: note.id,
      ownerId: note.ownerId,
      actorId: req.user.id,
      commentId: comment.id,
    });
  });
  return res.status(200).json({ success: true, message: "Comment deleted" });
}

async function bookmarkNote(req, res) {
  const note = await ensureEligibleNote(req, req.params.noteId);
  const bookmark = await prisma.$transaction(async (transaction) => {
    const created = await transaction.bookmark.create({
      data: { userId: req.user.id, noteId: note.id },
      select: { id: true, noteId: true, createdAt: true },
    });
    await enqueueSocialEvent(
      transaction,
      "BookmarkCreated",
      note.id,
      req.user.id,
      { noteId: note.id, ownerId: note.ownerId, actorId: req.user.id }
    );
    return created;
  });
  return res.status(201).json({ success: true, data: bookmark });
}

async function removeBookmark(req, res) {
  const note = await ensureEligibleNote(req, req.params.noteId);
  const result = await prisma.bookmark.deleteMany({
    where: { userId: req.user.id, noteId: note.id },
  });
  if (result.count === 0) throw new AppError(404, "Bookmark not found");
  return res.status(200).json({ success: true, message: "Bookmark removed" });
}

async function listBookmarks(req, res) {
  const { page, pageSize, skip, take } = parsePage(req.query, 50);
  const [bookmarks, total] = await Promise.all([
    prisma.bookmark.findMany({
      where: { userId: req.user.id },
      select: { id: true, noteId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.bookmark.count({ where: { userId: req.user.id } }),
  ]);

  const results = [];
  for (const bookmark of bookmarks) {
    const note = await getEligiblePublicNote(bookmark.noteId, req.headers.authorization);
    if (note) results.push({ ...bookmark, note });
    else await prisma.bookmark.deleteMany({ where: { id: bookmark.id, userId: req.user.id } });
  }
  return res.status(200).json({ success: true, data: results, pagination: { page, pageSize, total } });
}

module.exports = {
  listComments,
  createComment,
  updateComment,
  deleteComment,
  bookmarkNote,
  removeBookmark,
  listBookmarks,
};