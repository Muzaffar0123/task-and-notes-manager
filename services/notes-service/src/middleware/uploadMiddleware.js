const multer = require("multer");

const defaultMaxBytes = 10 * 1024 * 1024;
const configuredMaxBytes = Number(process.env.MAX_UPLOAD_BYTES || defaultMaxBytes);
const maxUploadBytes = Number.isSafeInteger(configuredMaxBytes) && configuredMaxBytes > 0
  ? configuredMaxBytes
  : defaultMaxBytes;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes, files: 1 },
});

module.exports = { upload, maxUploadBytes };