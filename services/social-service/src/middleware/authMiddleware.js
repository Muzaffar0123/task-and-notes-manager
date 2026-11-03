const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ success: false, message: "Bearer access token is required" });
  }
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ success: false, message: "Authentication is unavailable" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "taskflow-user-service",
    });
    if (!decoded || typeof decoded !== "object" || typeof decoded.sub !== "string") {
      return res.status(401).json({ success: false, message: "Invalid access token" });
    }
    req.user = { id: decoded.sub };
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired access token" });
  }
}

module.exports = authenticateToken;