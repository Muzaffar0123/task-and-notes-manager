const crypto = require("node:crypto");

function requireInternalService(req, res, next) {
  const expected = process.env.INTERNAL_SERVICE_TOKEN || "";
  const supplied = req.headers["x-internal-service-token"] || "";
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  const valid = expectedBuffer.length > 0 &&
    expectedBuffer.length === suppliedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);

  if (!valid) {
    return res.status(401).json({ success: false, message: "Internal service authentication required" });
  }
  return next();
}

module.exports = requireInternalService;