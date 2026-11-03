const multer = require("multer");

const defaultLimit = 5 * 1024 * 1024;
const configuredLimit = Number(process.env.PROFILE_IMAGE_MAX_BYTES || defaultLimit);
const maxImageBytes = Number.isSafeInteger(configuredLimit) && configuredLimit > 0
  ? configuredLimit
  : defaultLimit;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxImageBytes, files: 1 } });

function receiveProfileImage(req, res, next) {
  upload.single("file")(req, res, (error) => {
    if (!error) return next();
    if (error.name === "MulterError") {
      const tooLarge = error.code === "LIMIT_FILE_SIZE";
      return res.status(tooLarge ? 413 : 400).json({
        success: false,
        message: tooLarge ? "Profile image exceeds the configured size limit" : "Invalid profile image upload",
      });
    }
    return res.status(400).json({ success: false, message: "Invalid profile image upload" });
  });
}

module.exports = { receiveProfileImage, maxImageBytes };
