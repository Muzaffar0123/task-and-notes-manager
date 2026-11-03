const prisma = require("../config/prisma");
const { enqueueNoteEvent } = require("../services/noteEventOutbox");
const AppError = require("../utils/appError");

const publicNoteInclude = {
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

function parsePage(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new AppError(400, "Page must be positive and pageSize must be between 1 and 100");
  }
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

async function listPublicNotes(req, res) {
  const { status, search, sortBy = "createdAt", sortOrder = "desc" } = req.query;
  if (status !== undefined && !["PUBLISHED", "RESTRICTED"].includes(status)) {
    throw new AppError(400, "Moderation view only supports published or restricted public notes");
  }
  if (search !== undefined && (typeof search !== "string" || search.length > 200)) {
    throw new AppError(400, "Search must be a string of at most 200 characters");
  }
  if (!["createdAt", "updatedAt", "popularityScore"].includes(sortBy)) {
    throw new AppError(400, "Invalid sort field");
  }
  if (!["asc", "desc"].includes(sortOrder)) throw new AppError(400, "Sort order must be asc or desc");

  const { page, pageSize, skip, take } = parsePage(req.query);
  const where = {
    visibility: "PUBLIC",
    status: status || { in: ["PUBLISHED", "RESTRICTED"] },
    ...(search?.trim() ? {
      OR: [
        { title: { contains: search.trim(), mode: "insensitive" } },
        { description: { contains: search.trim(), mode: "insensitive" } },
      ],
    } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.note.findMany({ where, include: publicNoteInclude, orderBy: { [sortBy]: sortOrder }, skip, take }),
    prisma.note.count({ where }),
  ]);

  return res.status(200).json({ success: true, data, pagination: { page, pageSize, total } });
}

async function listReports(req, res) {
  const { status } = req.query;
  if (status !== undefined && !["OPEN", "REVIEWED", "DISMISSED"].includes(status)) {
    throw new AppError(400, "Invalid report status");
  }
  const { page, pageSize, skip, take } = parsePage(req.query);
  const where = {
    ...(status ? { status } : {}),
    note: { is: { visibility: "PUBLIC" } },
  };
  const [data, total] = await Promise.all([
    prisma.noteReport.findMany({
      where,
      include: {
        note: {
          select: {
            id: true,
            ownerId: true,
            title: true,
            description: true,
            visibility: true,
            status: true,
            publishedAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.noteReport.count({ where }),
  ]);

  return res.status(200).json({ success: true, data, pagination: { page, pageSize, total } });
}

async function updateReportStatus(req, res) {
  const { status } = req.body;
  if (!["REVIEWED", "DISMISSED"].includes(status)) {
    throw new AppError(400, "Report status must be REVIEWED or DISMISSED");
  }

  const report = await prisma.noteReport.findFirst({
    where: {
      id: req.params.reportId,
      note: { is: { visibility: "PUBLIC" } },
    },
    select: { id: true },
  });
  if (!report) throw new AppError(404, "Public note report not found");

  const updated = await prisma.noteReport.update({
    where: { id: report.id },
    data: { status },
    select: { id: true, noteId: true, status: true, updatedAt: true },
  });
  return res.status(200).json({ success: true, data: updated });
}

async function moderatePublicNote(req, res, action) {
  const { reason } = req.body;
  if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 1000) {
    throw new AppError(400, "Moderation reason is required and must be at most 1000 characters");
  }

  const note = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.note.findFirst({
      where: {
        id: req.params.noteId,
        visibility: "PUBLIC",
        status: action === "RESTRICTED" ? "PUBLISHED" : "RESTRICTED",
      },
      select: { id: true, ownerId: true, visibility: true, status: true, publishedAt: true },
    });
    if (!existing) throw new AppError(404, "Eligible public note not found");

    const changed = await transaction.note.updateMany({
      where: {
        id: existing.id,
        visibility: "PUBLIC",
        status: action === "RESTRICTED" ? "PUBLISHED" : "RESTRICTED",
      },
      data: {
        status: action === "RESTRICTED" ? "RESTRICTED" : "PUBLISHED",
        ...(action === "RESTORED" && !existing.publishedAt ? { publishedAt: new Date() } : {}),
      },
    });
    if (changed.count === 0) throw new AppError(404, "Eligible public note not found");

    const updated = await transaction.note.findFirst({
      where: { id: existing.id, visibility: "PUBLIC" },
      select: { id: true, ownerId: true, visibility: true, status: true, publishedAt: true },
    });
    if (!updated) throw new AppError(404, "Eligible public note not found");

    await transaction.moderationRecord.create({
      data: {
        noteId: existing.id,
        adminId: req.user.id,
        action,
        reason: reason.trim(),
      },
    });
    await enqueueNoteEvent(
      transaction,
      action === "RESTRICTED" ? "NoteRestricted" : "NoteRestored",
      updated
    );
    return updated;
  });

  return res.status(200).json({
    success: true,
    data: { id: note.id, status: note.status, visibility: note.visibility },
  });
}

async function restrictPublicNote(req, res) {
  return moderatePublicNote(req, res, "RESTRICTED");
}

async function restorePublicNote(req, res) {
  return moderatePublicNote(req, res, "RESTORED");
}

module.exports = {
  listPublicNotes,
  listReports,
  updateReportStatus,
  restrictPublicNote,
  restorePublicNote,
};