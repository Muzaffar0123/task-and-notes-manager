const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  // Check whether the Authorization header exists
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: "Access token is required",
    });
  }

  // Expected format: Bearer <token>
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      success: false,
      message: "Authorization format must be Bearer <token>",
    });
  }

  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is missing");

    return res.status(500).json({
      success: false,
      message: "Server configuration error",
    });
  }

  // Verify token signature, expiry and issuer
  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "taskflow-user-service",
    });
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired access token",
    });
  }

  if (
    !decoded ||
    typeof decoded !== "object" ||
    typeof decoded.sub !== "string"
  ) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired access token",
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, tokenVersion: true, role: true, status: true },
    });
    const tokenVersion = decoded.ver ?? 0;

    if (
      !user ||
      !Number.isInteger(tokenVersion) ||
      tokenVersion !== user.tokenVersion
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired access token",
      });
    }

    if ((user.status || "ACTIVE") !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: "This account is not active",
      });
    }

    req.user = { id: user.id, role: user.role || "USER" };
    return next();
  } catch (error) {
    console.error("Authentication verification failed:", error);

    return res.status(503).json({
      success: false,
      message: "Authentication service unavailable",
    });
  }
}

module.exports = authenticateToken;
