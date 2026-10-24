const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
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
  jwt.verify(
    token,
    process.env.JWT_SECRET,
    {
      issuer: "taskflow-user-service",
    },
    (error, decoded) => {
      if (error) {
        return res.status(401).json({
          success: false,
          message: "Invalid or expired access token",
        });
      }

      // Store authenticated user's ID for downstream handlers
      req.user = {
        id: decoded.sub,
      };

      next();
    }
  );
}

module.exports = authenticateToken;