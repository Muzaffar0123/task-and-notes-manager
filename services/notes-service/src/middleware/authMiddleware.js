const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ success: false, message: "Bearer access token is required" });
  }

  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is missing");
    return res.status(503).json({ success: false, message: "Authentication is unavailable" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "taskflow-user-service",
    });

    if (!decoded || typeof decoded !== "object" || typeof decoded.sub !== "string") {
      return res.status(401).json({ success: false, message: "Invalid access token" });
    }

    const configuredAdmins = (process.env.ADMIN_USER_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    req.user = {
      id: decoded.sub,
      role: decoded.role === "ADMIN" || configuredAdmins.includes(decoded.sub) ? "ADMIN" : "USER",
    };
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired access token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ success: false, message: "Administrator access is required" });
  }

  return next();
}

module.exports = { authenticateToken, requireAdmin };