const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: "Access token is required",
    });
  }

  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      success: false,
      message: "Use Authorization: Bearer <token>",
    });
  }

  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is missing");

    return res.status(500).json({
      success: false,
      message: "Server configuration error",
    });
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET,
    { issuer: "taskflow-user-service" },
    (error, decoded) => {
      if (error) {
        return res.status(401).json({
          success: false,
          message: "Invalid or expired token",
        });
      }

      if (!decoded || typeof decoded.sub !== "string") {
        return res.status(401).json({
          success: false,
          message: "Invalid access token",
        });
      }

      req.user = { id: decoded.sub };
      next();
    }
  );
}

module.exports = authenticateToken;
