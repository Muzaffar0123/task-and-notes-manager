const prisma = require("../config/prisma");
const storage = require("../services/objectStorage");
const { enqueueNoteEvent } = require("../services/noteEventOutbox");
const AppError = require("../utils/appError");

const noteInclude = {
  categories: { select: { id: true, name: true } },
  tags: { select: { id: true, name: true } },
  files: {
    select: {
      id: true,
      originalFilename: true,
      contentType: true,
      sizeBytes: true,
      createdAt: true,
    },
  },
};

function normalizeNames(value, fieldName) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 20) {
    throw new AppError(400, `${fieldName} must be an array of at most 20 names`);
  }

  const names = value.map((name) => {
    if (typeof name !== "string" || !name.trim() || name.trim().length > 80) {
      throw new AppError(400, `Each ${fieldName.toLowerCase()} name must be 1 to 80 characters`);
    }
    return name.trim();
  });

  return [...new Set(names)];
}

function relationInput(names) {
  return {
    set: [],
    connectOrCreate: names.map((name) => ({
      where: { name },
      create: { name },
    })),
  };
}

function canManageNote(user, note) {
  return user.id === note.ownerId;
}

function ownedNoteWhere(user, noteId) {
  return { id: noteId, ownerId: user.id };
}

function readableNoteWhere(user, noteId) {
  return {
    id: noteId,
    OR: [
      { visibility: "PUBLIC", status: "PUBLISHED" },
      { ownerId: user.id },
    ],
  };
}

function pagination(query) {
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

function parseDate(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new AppError(400, `Invalid ${label}`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError(400, `Invalid ${label}`);
  return date;
}

async function createNote(req, res) {
  const { title, description = "", visibility = "PRIVATE" } = req.body;

  if (typeof title !== "string" || !title.trim() || title.trim().length > 200) {
    throw new AppError(400, "Title is required and must be at most 200 characters");
  }
  if (typeof description !== "string" || description.length > 50000) {
    throw new AppError(400, "Description must be a string of at most 50000 characters");
  }
  if (!["PUBLIC", "PRIVATE"].includes(visibility)) {
    throw new AppError(400, "Visibility must be PUBLIC or PRIVATE");
  }

  const categories = normalizeNames(req.body.categories, "Categories");
  const tags = normalizeNames(req.body.tags, "Tags");
  const note = await prisma.note.create({
    data: {
      ownerId: req.user.id,
      title: title.trim(),
      description,
      visibility,
      ...(categories ? { categories: { connectOrCreate: categories.map((name) => ({ where: { name }, create: { name } })) } } : {}),
      ...(tags ? { tags: { connectOrCreate: tags.map((name) => ({ where: { name }, create: { name } })) } } : {}),
    },
    include: noteInclude,
  });

  return res.status(201).json({ success: true, data: note });
}

async function getMyNotes(req, res) {
  const { visibility, status } = req.query;
  if (visibility !== undefined && !["PUBLIC", "PRIVATE"].includes(visibility)) {
    throw new AppError(400, "Invalid visibility filter");
  }
  if (status !== undefined && !["DRAFT", "PUBLISHED", "RESTRICTED"].includes(status)) {
    throw new AppError(400, "Invalid note status filter");
  }
  const { page, pageSize, skip, take } = pagination(req.query);
  const where = {
    ownerId: req.user.id,
    ...(visibility ? { visibility } : {}),
    ...(status ? { status } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.note.findMany({ where, include: noteInclude, orderBy: { updatedAt: "desc" }, skip, take }),
    prisma.note.count({ where }),
  ]);

  return res.status(200).json({ success: true, data, pagination: { page, pageSize, total } });
}

async function searchPublicNotes(req, res) {
  const { search, category, tag, ownerId, sortBy = "createdAt", sortOrder = "desc" } = req.query;
  if (req.query.visibility !== undefined && req.query.visibility !== "PUBLIC") {
    throw new AppError(400, "Public search only supports PUBLIC visibility");
  }
  if (search !== undefined && (typeof search !== "string" || search.length > 200)) {
    throw new AppError(400, "Search must be a string of at most 200 characters");
  }
  if (![
    "createdAt",
    "popularityScore",
  ].includes(sortBy)) {
    throw new AppError(400, "Sort by createdAt or popularityScore");
  }
  if (!["asc", "desc"].includes(sortOrder)) throw new AppError(400, "Sort order must be asc or desc");
  if (category !== undefined && (typeof category !== "string" || category.length > 80)) {
    throw new AppError(400, "Invalid category filter");
  }
  if (tag !== undefined && (typeof tag !== "string" || tag.length > 80)) {
    throw new AppError(400, "Invalid tag filter");
  }
  if (ownerId !== undefined && (typeof ownerId !== "string" || !ownerId.trim() || ownerId.length > 100)) {
    throw new AppError(400, "Invalid ownerId filter");
  }

  const { page, pageSize, skip, take } = pagination(req.query);
  const where = {
    visibility: "PUBLIC",
    status: "PUBLISHED",
    ...(ownerId ? { ownerId: ownerId.trim() } : {}),
    ...(search?.trim() ? {
      OR: [
        { title: { contains: search.trim(), mode: "insensitive" } },
        { description: { contains: search.trim(), mode: "insensitive" } },
        { categories: { some: { name: { contains: search.trim(), mode: "insensitive" } } } },
        { tags: { some: { name: { contains: search.trim(), mode: "insensitive" } } } },
      ],
    } : {}),
    ...(category ? { categories: { some: { name: { equals: category, mode: "insensitive" } } } } : {}),
    ...(tag ? { tags: { some: { name: { equals: tag, mode: "insensitive" } } } } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.note.findMany({ where, include: noteInclude, orderBy: { [sortBy]: sortOrder }, skip, take }),
    prisma.note.count({ where }),
  ]);

  return res.status(200).json({ success: true, data, pagination: { page, pageSize, total } });
}

async function getNoteById(req, res) {
  const note = await prisma.note.findFirst({
    where: readableNoteWhere(req.user, req.params.id),
    include: noteInclude,
  });
  if (!note) throw new AppError(404, "Note not found");

  if (note.visibility === "PUBLIC" && note.status === "PUBLISHED" && note.ownerId !== req.user.id) {
    await prisma.note.update({
      where: { id: note.id },
      data: { viewCount: { increment: 1 }, popularityScore: { increment: 1 } },
    });
    note.viewCount += 1;
    note.popularityScore += 1;
  }

  return res.status(200).json({ success: true, data: note });
}

async function updateNote(req, res) {
  const existing = await prisma.note.findUnique({
    where: ownedNoteWhere(req.user, req.params.id),
    include: noteInclude,
  });
  if (!existing || !canManageNote(req.user, existing)) throw new AppError(404, "Note not found");

  const data = {};
  const { title, description, visibility } = req.body;
  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim() || title.trim().length > 200) {
      throw new AppError(400, "Title must be a non-empty string of at most 200 characters");
    }
    data.title = title.trim();
  }
  if (description !== undefined) {
    if (typeof description !== "string" || description.length > 50000) {
      throw new AppError(400, "Description must be a string of at most 50000 characters");
    }
    data.description = description;
  }
  if (visibility !== undefined) {
    if (!["PUBLIC", "PRIVATE"].includes(visibility)) throw new AppError(400, "Invalid visibility");
    data.visibility = visibility;
  }

  const categories = normalizeNames(req.body.categories, "Categories");
  const tags = normalizeNames(req.body.tags, "Tags");
  if (categories) data.categories = relationInput(categories);
  if (tags) data.tags = relationInput(tags);
  if (Object.keys(data).length === 0) throw new AppError(400, "Provide at least one field to update");

  const updated = await prisma.$transaction(async (transaction) => {
    const note = await transaction.note.update({
      where: { id: existing.id },
      data,
      include: noteInclude,
    });
    const wasPublic = existing.visibility === "PUBLIC" && existing.status === "PUBLISHED";
    const remainsPublic = note.visibility === "PUBLIC" && note.status === "PUBLISHED";
    if (existing.visibility === note.visibility && (wasPublic || remainsPublic)) {
      await enqueueNoteEvent(transaction, "NoteUpdated", note);
    }
    if (existing.visibility !== note.visibility) {
      await enqueueNoteEvent(transaction, "NoteVisibilityChanged", note);
    }
    return note;
  });

  return res.status(200).json({ success: true, data: updated });
}

async function publishNote(req, res) {
  const existing = await prisma.note.findFirst({
    where: ownedNoteWhere(req.user, req.params.id),
  });
  if (!existing || !canManageNote(req.user, existing)) throw new AppError(404, "Note not found");
  if (existing.status === "RESTRICTED") throw new AppError(409, "Restricted notes cannot be published");
  if (!existing.title.trim() || !existing.description.trim()) {
    throw new AppError(400, "A title and description are required before publishing");
  }

  const note = await prisma.$transaction(async (transaction) => {
    const published = await transaction.note.update({
      where: { id: existing.id },
      data: { status: "PUBLISHED", publishedAt: existing.publishedAt || new Date() },
      include: noteInclude,
    });
    if (published.visibility === "PUBLIC") {
      await enqueueNoteEvent(transaction, "NotePublished", published);
    }
    return published;
  });

  return res.status(200).json({ success: true, data: note });
}

async function deleteNote(req, res) {
  const note = await prisma.note.findUnique({
    where: ownedNoteWhere(req.user, req.params.id),
    include: noteInclude,
  });
  if (!note || !canManageNote(req.user, note)) throw new AppError(404, "Note not found");
  const files = await prisma.noteFile.findMany({
    where: { noteId: note.id },
    select: { storageKey: true },
  });

  await prisma.$transaction(async (transaction) => {
    if (note.visibility === "PUBLIC") await enqueueNoteEvent(transaction, "NoteDeleted", note);
    await transaction.note.delete({ where: { id: note.id } });
  });

  const cleanup = await Promise.allSettled(files.map((file) => storage.deleteObject(file.storageKey)));
  for (const result of cleanup) {
    if (result.status === "rejected") {
      console.error("Deleted note object cleanup failed:", result.reason.message);
    }
  }

  return res.status(200).json({ success: true, message: "Note deleted" });
}

async function getNoteStatistics(req, res) {
  const note = await prisma.note.findFirst({ where: readableNoteWhere(req.user, req.params.id) });
  if (!note) throw new AppError(404, "Note not found");

  return res.status(200).json({
    success: true,
    data: {
      viewCount: note.viewCount,
      downloadCount: note.downloadCount,
      publishedAt: note.publishedAt,
    },
  });
}

async function reportPublicNote(req, res) {
  const { reason } = req.body;
  if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 1000) {
    throw new AppError(400, "Report reason is required and must be at most 1000 characters");
  }

  const note = await prisma.note.findFirst({
    where: {
      id: req.params.noteId,
      visibility: "PUBLIC",
      status: "PUBLISHED",
    },
    select: { id: true },
  });
  if (!note) throw new AppError(404, "Public note not found");

  const report = await prisma.noteReport.create({
    data: {
      noteId: note.id,
      reporterId: req.user.id,
      reason: reason.trim(),
    },
    select: { id: true, noteId: true, reason: true, status: true, createdAt: true },
  });

  return res.status(201).json({ success: true, data: report });
}

module.exports = {
  createNote,
  getMyNotes,
  searchPublicNotes,
  getNoteById,
  updateNote,
  publishNote,
  deleteNote,
  getNoteStatistics,
  reportPublicNote,
};