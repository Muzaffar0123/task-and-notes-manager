const crypto = require("node:crypto");
const path = require("node:path");
const { Readable } = require("node:stream");
const prisma = require("../config/prisma");
const storage = require("../services/objectStorage");
const { validateDocument } = require("../services/documentValidation");
const AppError = require("../utils/appError");

function ownerNoteScope(user, noteId) {
  return { id: noteId, ownerId: user.id };
}

function readableNoteScope(user) {
  return {
    OR: [
      { visibility: "PUBLIC", status: "PUBLISHED" },
      { ownerId: user.id },
    ],
  };
}

function safeOriginalFilename(filename, extension) {
  const basename = path.basename(filename || `document${extension}`);
  const safeName = basename
    .replace(/[\r\n\0]/g, "")
    .replace(/[\\/]/g, "_")
    .slice(0, 180);
  return safeName || `document${extension}`;
}

function fileResponse(file) {
  return {
    id: file.id,
    originalFilename: file.originalFilename,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    createdAt: file.createdAt,
  };
}

async function uploadNoteFile(req, res) {
  if (!req.file) throw new AppError(400, "A document file is required");
  const note = await prisma.note.findFirst({
    where: ownerNoteScope(req.user, req.params.noteId),
    select: { id: true },
  });
  if (!note) throw new AppError(404, "Note not found");

  const document = await validateDocument(req.file);
  const storageKey = `notes/${note.id}/${crypto.randomUUID()}${document.extension}`;
  const originalFilename = safeOriginalFilename(req.file.originalname, document.extension);

  await storage.putObject(storageKey, req.file.buffer, document.contentType);
  try {
    const file = await prisma.noteFile.create({
      data: {
        noteId: note.id,
        storageKey,
        originalFilename,
        contentType: document.contentType,
        sizeBytes: req.file.size,
      },
    });
    return res.status(201).json({ success: true, data: fileResponse(file) });
  } catch (error) {
    await storage.deleteObject(storageKey).catch((cleanupError) => {
      console.error("Uploaded object cleanup failed:", cleanupError.message);
    });
    throw error;
  }
}

async function downloadNoteFile(req, res) {
  const file = await prisma.noteFile.findFirst({
    where: {
      id: req.params.fileId,
      noteId: req.params.noteId,
      note: { is: readableNoteScope(req.user) },
    },
    include: {
      note: { select: { id: true, ownerId: true, visibility: true, status: true } },
    },
  });
  if (!file) throw new AppError(404, "File not found");

  const object = await storage.getObject(file.storageKey);
  if (!object.Body) throw new AppError(502, "Stored file is unavailable");

  await prisma.note.update({
    where: { id: file.noteId },
    data: {
      downloadCount: { increment: 1 },
      popularityScore: { increment: 2 },
    },
  });

  const encodedName = encodeURIComponent(file.originalFilename).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodedName}`);
  res.setHeader("Content-Length", file.sizeBytes);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const body = Buffer.isBuffer(object.Body) ? Readable.from(object.Body) : object.Body;
  body.on("error", (error) => {
    console.error("S3 download stream failed:", error.message);
    res.destroy(error);
  });
  return body.pipe(res);
}

async function deleteNoteFile(req, res) {
  const file = await prisma.noteFile.findFirst({
    where: {
      id: req.params.fileId,
      noteId: req.params.noteId,
      note: { is: ownerNoteScope(req.user, req.params.noteId) },
    },
  });
  if (!file) throw new AppError(404, "File not found");

  await storage.deleteObject(file.storageKey);
  await prisma.noteFile.delete({ where: { id: file.id } });
  return res.status(200).json({ success: true, message: "File deleted" });
}

module.exports = { uploadNoteFile, downloadNoteFile, deleteNoteFile };