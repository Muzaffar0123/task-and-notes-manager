const prisma = require("../config/prisma");
const { getEligiblePublicNote } = require("../services/notesClient");
const AppError = require("../utils/appError");

function parsePage(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new AppError(400, "Invalid collection pagination");
  }
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

async function createCollection(req, res) {
  const { name } = req.body;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
    throw new AppError(400, "Collection name is required and must be at most 100 characters");
  }
  const collection = await prisma.collection.create({
    data: { userId: req.user.id, name: name.trim() },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
  });
  return res.status(201).json({ success: true, data: collection });
}

async function listCollections(req, res) {
  const { page, pageSize, skip, take } = parsePage(req.query);
  const where = { userId: req.user.id };
  const [data, total] = await Promise.all([
    prisma.collection.findMany({
      where,
      select: { id: true, name: true, createdAt: true, updatedAt: true, _count: { select: { items: true } } },
      orderBy: { updatedAt: "desc" },
      skip,
      take,
    }),
    prisma.collection.count({ where }),
  ]);
  return res.status(200).json({ success: true, data, pagination: { page, pageSize, total } });
}

async function renameCollection(req, res) {
  const { name } = req.body;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
    throw new AppError(400, "Collection name is required and must be at most 100 characters");
  }
  const result = await prisma.collection.updateMany({
    where: { id: req.params.collectionId, userId: req.user.id },
    data: { name: name.trim() },
  });
  if (result.count === 0) throw new AppError(404, "Collection not found");
  const collection = await prisma.collection.findFirst({
    where: { id: req.params.collectionId, userId: req.user.id },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
  });
  return res.status(200).json({ success: true, data: collection });
}

async function deleteCollection(req, res) {
  const result = await prisma.collection.deleteMany({
    where: { id: req.params.collectionId, userId: req.user.id },
  });
  if (result.count === 0) throw new AppError(404, "Collection not found");
  return res.status(200).json({ success: true, message: "Collection deleted" });
}

async function addBookmarkToCollection(req, res) {
  const { bookmarkId } = req.body;
  if (typeof bookmarkId !== "string" || !bookmarkId.trim()) throw new AppError(400, "bookmarkId is required");
  const collection = await prisma.collection.findFirst({
    where: { id: req.params.collectionId, userId: req.user.id },
    select: { id: true },
  });
  if (!collection) throw new AppError(404, "Collection not found");
  const bookmark = await prisma.bookmark.findFirst({
    where: { id: bookmarkId, userId: req.user.id },
    select: { id: true, noteId: true },
  });
  if (!bookmark) throw new AppError(404, "Bookmark not found");
  const note = await getEligiblePublicNote(bookmark.noteId, req.headers.authorization);
  if (!note) throw new AppError(404, "Public note not found");

  const item = await prisma.collectionItem.create({
    data: { collectionId: collection.id, bookmarkId: bookmark.id },
    select: { id: true, collectionId: true, bookmarkId: true, createdAt: true },
  });
  return res.status(201).json({ success: true, data: item });
}

async function removeBookmarkFromCollection(req, res) {
  const result = await prisma.collectionItem.deleteMany({
    where: {
      collectionId: req.params.collectionId,
      bookmarkId: req.params.bookmarkId,
      collection: { is: { userId: req.user.id } },
    },
  });
  if (result.count === 0) throw new AppError(404, "Collection item not found");
  return res.status(200).json({ success: true, message: "Bookmark removed from collection" });
}

async function listCollectionItems(req, res) {
  const collection = await prisma.collection.findFirst({
    where: { id: req.params.collectionId, userId: req.user.id },
    select: { id: true, name: true },
  });
  if (!collection) throw new AppError(404, "Collection not found");
  const { page, pageSize, skip, take } = parsePage(req.query);
  const items = await prisma.collectionItem.findMany({
    where: { collectionId: collection.id },
    include: { bookmark: { select: { id: true, noteId: true, createdAt: true } } },
    orderBy: { createdAt: "desc" },
    skip,
    take,
  });
  const data = [];
  for (const item of items) {
    const note = await getEligiblePublicNote(item.bookmark.noteId, req.headers.authorization);
    if (note) data.push({ id: item.id, createdAt: item.createdAt, bookmark: item.bookmark, note });
    else {
      await prisma.collectionItem.deleteMany({ where: { id: item.id, collectionId: collection.id } });
      await prisma.bookmark.deleteMany({ where: { id: item.bookmark.id, userId: req.user.id } });
    }
  }
  const total = await prisma.collectionItem.count({ where: { collectionId: collection.id } });
  return res.status(200).json({
    success: true,
    data,
    pagination: { page, pageSize, total },
  });
}

module.exports = {
  createCollection,
  listCollections,
  renameCollection,
  deleteCollection,
  addBookmarkToCollection,
  removeBookmarkFromCollection,
  listCollectionItems,
};