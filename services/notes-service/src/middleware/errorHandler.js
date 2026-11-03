const AppError = require("../utils/appError");

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  let status = error instanceof AppError ? error.status : 500;
  let message = error instanceof AppError ? error.message : "Internal server error";

  if (error.code === "P2002") {
    status = 409;
    message = "A record with the same unique value already exists";
  } else if (error.code === "P2025") {
    status = 404;
    message = "Resource not found";
  } else if (error.name === "MulterError") {
    status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    message = error.code === "LIMIT_FILE_SIZE" ? "File exceeds the configured size limit" : "Invalid upload";
  } else if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    status = 400;
    message = "Invalid JSON request body";
  }

  if (status >= 500) {
    console.error("Notes Service request failed:", {
      method: req.method,
      path: req.path,
      message: error.message,
    });
  }

  return res.status(status).json({ success: false, message });
}

module.exports = errorHandler;