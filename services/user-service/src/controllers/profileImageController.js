const crypto = require("node:crypto");
const path = require("node:path");
const { Readable } = require("node:stream");
const prisma = require("../config/prisma");
const storage = require("../services/objectStorage");

const acceptedTypes = {
  ".jpg": { contentType: "image/jpeg", matches: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  ".jpeg": { contentType: "image/jpeg", matches: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  ".png": { contentType: "image/png", matches: (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  ".webp": { contentType: "image/webp", matches: (buffer) => buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" },
};

function validateImage(file) {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) return null;
  const extension = path.extname(file.originalname || "").toLowerCase();
  const type = acceptedTypes[extension];
  if (!type || !type.matches(file.buffer)) return null;
  return { extension, contentType: type.contentType };
}

function handleStorageFailure(res, operation) {
  console.error(`Profile image ${operation} failed`);
  return res.status(503).json({ success: false, message: "Profile image storage is unavailable" });
}

async function uploadProfileImage(req, res) {
  const image = validateImage(req.file);
  if (!image) return res.status(415).json({ success: false, message: "Upload a valid PNG, JPEG, or WebP image" });

  const current = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { profileImageKey: true },
  });
  if (!current) return res.status(404).json({ success: false, message: "User not found" });

  const key = `profiles/${req.user.id}/${crypto.randomUUID()}${image.extension}`;
  try {
    await storage.putObject(key, req.file.buffer, image.contentType);
  } catch {
    return handleStorageFailure(res, "upload");
  }

  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        profileImageKey: key,
        profileImageContentType: image.contentType,
        profileImageSizeBytes: req.file.size,
      },
    });
  } catch (error) {
    await storage.deleteObject(key).catch(() => {});
    console.error("Profile image metadata update failed");
    return res.status(500).json({ success: false, message: "Could not save profile image" });
  }

  if (current.profileImageKey && current.profileImageKey !== key) {
    await storage.deleteObject(current.profileImageKey).catch(() => {
      console.error("Previous profile image cleanup failed");
    });
  }

  return res.status(201).json({
    success: true,
    data: { contentType: image.contentType, sizeBytes: req.file.size },
  });
}

async function getProfileImage(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { profileImageKey: true, profileImageContentType: true, profileImageSizeBytes: true },
  });
  if (!user?.profileImageKey) return res.status(404).json({ success: false, message: "Profile image not found" });

  let object;
  try {
    object = await storage.getObject(user.profileImageKey);
  } catch {
    return handleStorageFailure(res, "read");
  }
  if (!object.Body) return res.status(502).json({ success: false, message: "Stored profile image is unavailable" });
  res.setHeader("Content-Type", user.profileImageContentType);
  if (user.profileImageSizeBytes) res.setHeader("Content-Length", user.profileImageSizeBytes);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return (Buffer.isBuffer(object.Body) ? Readable.from(object.Body) : object.Body).pipe(res);
}

async function getPublicProfileImage(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.params.userId },
    select: { profileImageKey: true, profileImageContentType: true, profileImageSizeBytes: true },
  });
  if (!user?.profileImageKey) {
    return res.status(404).json({ success: false, message: "Profile image not found" });
  }

  let object;
  try {
    object = await storage.getObject(user.profileImageKey);
  } catch {
    return handleStorageFailure(res, "read");
  }
  if (!object.Body) return res.status(502).json({ success: false, message: "Stored profile image is unavailable" });
  res.setHeader("Content-Type", user.profileImageContentType);
  if (user.profileImageSizeBytes) res.setHeader("Content-Length", user.profileImageSizeBytes);
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return (Buffer.isBuffer(object.Body) ? Readable.from(object.Body) : object.Body).pipe(res);
}

async function deleteProfileImage(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { profileImageKey: true },
  });
  if (!user?.profileImageKey) return res.status(404).json({ success: false, message: "Profile image not found" });

  try {
    await storage.deleteObject(user.profileImageKey);
  } catch {
    return handleStorageFailure(res, "deletion");
  }
  await prisma.user.update({
    where: { id: req.user.id },
    data: { profileImageKey: null, profileImageContentType: null, profileImageSizeBytes: null },
  });
  return res.status(200).json({ success: true, message: "Profile image deleted" });
}

module.exports = { uploadProfileImage, getProfileImage, getPublicProfileImage, deleteProfileImage, validateImage };
