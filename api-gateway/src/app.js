const crypto = require("node:crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const { rateLimit } = require("express-rate-limit");
const { createProxyMiddleware } = require("http-proxy-middleware");

const servicePrefixes = {
  users: "/api/users",
  tasks: "/api/tasks",
  notifications: "/api/notifications",
  notes: "/api/notes",
  social: "/api/social",
};

function parseOrigins(value) {
  if (Array.isArray(value)) return new Set(value);
  const raw = value === undefined ? "http://localhost:5173" : value;
  return new Set(raw.split(",").map((origin) => origin.trim()).filter(Boolean));
}

function validServiceUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function createApp(options = {}) {
  const app = express();
  const logger = options.logger || console;
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
  const origins = parseOrigins(options.corsOrigins ?? process.env.CORS_ALLOWED_ORIGINS);
  const services = {
    users: options.serviceUrls?.users ?? process.env.USER_SERVICE_URL,
    tasks: options.serviceUrls?.tasks ?? process.env.TASK_SERVICE_URL,
    notifications: options.serviceUrls?.notifications ?? process.env.NOTIFICATION_SERVICE_URL,
    notes: options.serviceUrls?.notes ?? process.env.NOTES_SERVICE_URL,
    social: options.serviceUrls?.social ?? process.env.SOCIAL_SERVICE_URL,
  };
  const adminUserIdsSource = options.adminUserIds ?? process.env.GATEWAY_ADMIN_USER_IDS ?? "";
  const adminUserIds = new Set(
    (Array.isArray(adminUserIdsSource) ? adminUserIdsSource : adminUserIdsSource.split(","))
      .map((id) => String(id).trim())
      .filter(Boolean)
  );
  const validateSession = options.validateSession || (async ({ token }) => {
    const response = await fetch(`${services.users}/api/users/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(Number(process.env.UPSTREAM_TIMEOUT_MS || 10000)),
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, user: body?.user };
  });

  const apiLimiter = rateLimit({
    windowMs: options.apiWindowMs ?? Number(process.env.API_RATE_LIMIT_WINDOW_MS || 900000),
    limit: options.apiLimit ?? Number(process.env.API_RATE_LIMIT_MAX || 300),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler(req, res) {
      return res.status(429).json({
        success: false,
        error: { code: "RATE_LIMITED", message: "Too many requests", requestId: req.requestId },
      });
    },
  });
  const authLimiter = rateLimit({
    windowMs: options.authWindowMs ?? Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 900000),
    limit: options.authLimit ?? Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler(req, res) {
      return res.status(429).json({
        success: false,
        error: { code: "AUTH_RATE_LIMITED", message: "Too many authentication attempts", requestId: req.requestId },
      });
    },
  });

  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    for (const header of ["x-user-id", "x-authenticated-user-id", "x-user-role", "x-roles", "x-internal-service-token"]) {
      delete req.headers[header];
    }

    const startedAt = Date.now();
    res.on("finish", () => {
      logger.info?.(JSON.stringify({
        level: "info",
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      }));
    });
    next();
  });

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) {
      return res.status(403).json({
        success: false,
        error: { code: "CORS_ORIGIN_DENIED", message: "Origin is not allowed", requestId: req.requestId },
      });
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-Id");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
  });

  function authenticate(req, res, next) {
    const match = /^Bearer\s+([^\s]+)$/i.exec(req.headers.authorization || "");
    if (!match) {
      return res.status(401).json({
        success: false,
        error: { code: "AUTH_REQUIRED", message: "Bearer access token is required", requestId: req.requestId },
      });
    }
    if (!jwtSecret) {
      logger.error?.(JSON.stringify({ level: "error", requestId: req.requestId, message: "JWT_SECRET is missing" }));
      return res.status(503).json({
        success: false,
        error: { code: "AUTH_UNAVAILABLE", message: "Authentication is unavailable", requestId: req.requestId },
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(match[1], jwtSecret, { issuer: "taskflow-user-service" });
    } catch {
      return res.status(401).json({
        success: false,
        error: { code: "AUTH_INVALID", message: "Invalid or expired access token", requestId: req.requestId },
      });
    }
    if (!decoded || typeof decoded !== "object" || typeof decoded.sub !== "string") {
      return res.status(401).json({
        success: false,
        error: { code: "AUTH_INVALID", message: "Invalid access token", requestId: req.requestId },
      });
    }
    Promise.resolve(validateSession({ token: match[1], decoded }))
      .then(({ status, user }) => {
        if (status === 401) {
          return res.status(401).json({
            success: false,
            error: { code: "AUTH_INVALID", message: "Invalid or expired access token", requestId: req.requestId },
          });
        }
        if (status === 403) {
          return res.status(403).json({
            success: false,
            error: { code: "ACCOUNT_INACTIVE", message: "This account is not active", requestId: req.requestId },
          });
        }
        if (status !== 200 || !user || user.id !== decoded.sub || !["USER", "ADMIN"].includes(user.role)) {
          return res.status(503).json({
            success: false,
            error: { code: "AUTH_UNAVAILABLE", message: "Authentication is unavailable", requestId: req.requestId },
          });
        }
        req.authenticatedUser = { id: user.id, role: user.role };
        req.headers["x-request-id"] = req.requestId;
        return next();
      })
      .catch((error) => {
        logger.error?.(JSON.stringify({
          level: "error",
          requestId: req.requestId,
          message: "Session validation failed",
          code: error.code || "AUTH_UPSTREAM_ERROR",
        }));
        if (res.headersSent) return;
        return res.status(503).json({
          success: false,
          error: { code: "AUTH_UNAVAILABLE", message: "Authentication is unavailable", requestId: req.requestId },
        });
      });
  }

  function requireAdmin(req, res, next) {
    if (req.authenticatedUser?.role !== "ADMIN" && !adminUserIds.has(req.authenticatedUser?.id)) {
      return res.status(403).json({
        success: false,
        error: { code: "ADMIN_REQUIRED", message: "Administrator access is required", requestId: req.requestId },
      });
    }
    return next();
  }

  function proxyFor(serviceName, prefix) {
    const target = services[serviceName];
    if (!validServiceUrl(target)) {
      return (req, res) => res.status(503).json({
        success: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Requested service is not configured", requestId: req.requestId },
      });
    }

    return createProxyMiddleware({
      target,
      changeOrigin: true,
      proxyTimeout: Number(process.env.UPSTREAM_TIMEOUT_MS || 10000),
      timeout: Number(process.env.UPSTREAM_TIMEOUT_MS || 10000),
      pathRewrite: (_path, req) => req.originalUrl,
      on: {
        proxyReq(proxyReq, req) {
          proxyReq.setHeader("X-Request-Id", req.requestId);
          for (const header of ["x-user-id", "x-authenticated-user-id", "x-user-role", "x-roles", "x-internal-service-token"]) {
            proxyReq.removeHeader(header);
          }
        },
        error(error, req, res) {
          logger.error?.(JSON.stringify({
            level: "error",
            requestId: req.requestId,
            upstream: serviceName,
            code: error.code || "UPSTREAM_ERROR",
          }));
          if (res.headersSent) return res.destroy(error);
          return res.status(502).json({
            success: false,
            error: { code: "UPSTREAM_UNAVAILABLE", message: "A service is temporarily unavailable", requestId: req.requestId },
          });
        },
      },
    });
  }

  const usersProxy = proxyFor("users", servicePrefixes.users);
  const usersRouter = express.Router();
  usersRouter.post("/register", authLimiter, usersProxy);
  usersRouter.post("/login", authLimiter, usersProxy);
  usersRouter.use(authenticate, usersProxy);
  app.use("/api/users", apiLimiter, usersRouter);

  app.use("/api/tasks", apiLimiter, authenticate, proxyFor("tasks", servicePrefixes.tasks));
  app.use("/api/notifications", apiLimiter, authenticate, proxyFor("notifications", servicePrefixes.notifications));

  const notesProxy = proxyFor("notes", servicePrefixes.notes);
  const notesRouter = express.Router();
  notesRouter.use("/admin", authenticate, requireAdmin, notesProxy);
  notesRouter.use(authenticate, notesProxy);
  app.use("/api/notes", apiLimiter, notesRouter);

  app.use("/api/social", apiLimiter, authenticate, proxyFor("social", servicePrefixes.social));

  const serviceHealthNames = {
    users: "User Service",
    tasks: "Task Service",
    notes: "Notes Service",
    social: "Social Service",
    notifications: "Notification Service",
  };
  const healthTimeoutMs = options.healthTimeoutMs ?? Number(process.env.SERVICE_HEALTH_TIMEOUT_MS || 1500);
  const healthCacheMs = options.healthCacheMs ?? Number(process.env.SERVICE_HEALTH_CACHE_MS || 3000);
  const probeServiceHealth = options.probeServiceHealth || (options.checkServiceHealth
    ? async ({ url }) => {
      const startedAt = Date.now();
      const healthy = await options.checkServiceHealth(url);
      return { healthy, httpStatus: healthy ? 200 : 503, responseTimeMs: Date.now() - startedAt };
    }
    : async ({ url, timeoutMs }) => {
      const startedAt = Date.now();
      try {
        const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(timeoutMs) });
        const body = await response.json().catch(() => null);
        return {
          healthy: response.ok && body?.success === true && body?.database === "connected",
          httpStatus: response.status,
          responseTimeMs: Date.now() - startedAt,
        };
      } catch {
        return { healthy: false, httpStatus: null, responseTimeMs: Date.now() - startedAt };
      }
    });
  let serviceHealthCache = null;

  async function probeConfiguredService(serviceKey) {
    const url = services[serviceKey];
    const name = serviceHealthNames[serviceKey];
    if (!validServiceUrl(url)) {
      return { name, status: "unhealthy", httpStatus: null, responseTimeMs: 0 };
    }

    const startedAt = Date.now();
    try {
      const result = await probeServiceHealth({ name, url, timeoutMs: healthTimeoutMs });
      const httpStatus = Number.isInteger(result?.httpStatus) && result.httpStatus >= 100 && result.httpStatus <= 599
        ? result.httpStatus
        : null;
      const responseTimeMs = Number.isFinite(result?.responseTimeMs) && result.responseTimeMs >= 0
        ? Math.round(result.responseTimeMs)
        : Date.now() - startedAt;
      const healthy = result?.healthy === true;
      return { name, status: healthy ? "healthy" : "unhealthy", httpStatus, responseTimeMs };
    } catch {
      return { name, status: "unhealthy", httpStatus: null, responseTimeMs: Date.now() - startedAt };
    }
  }

  async function getServiceHealth() {
    if (serviceHealthCache?.data && Date.now() < serviceHealthCache.expiresAt) {
      return serviceHealthCache.data;
    }
    if (serviceHealthCache?.pending) return serviceHealthCache.pending;

    const pending = Promise.all(["users", "tasks", "notes", "social", "notifications"].map(probeConfiguredService));
    serviceHealthCache = { pending, data: null, expiresAt: 0 };
    try {
      const data = await pending;
      serviceHealthCache = { pending: null, data, expiresAt: Date.now() + healthCacheMs };
      return data;
    } catch (error) {
      serviceHealthCache = null;
      throw error;
    }
  }
  app.get("/health", (req, res) => res.status(200).json({
    success: true,
    service: "api-gateway",
    status: "running",
  }));
  app.get("/health/services", async (req, res) => {
    const servicesHealth = await getServiceHealth();
    const healthy = servicesHealth.every((service) => service.status === "healthy");
    return res.status(healthy ? 200 : 503).json({
      status: healthy ? "healthy" : "unhealthy",
      services: servicesHealth,
    });
  });
  app.get("/ready", async (req, res) => {
    const servicesHealth = await getServiceHealth();
    const dependencies = Object.fromEntries(["users", "tasks", "notes", "social", "notifications"]
      .map((name, index) => [name, servicesHealth[index].status === "healthy"]));
    const ready = Object.values(dependencies).every(Boolean);
    return res.status(ready ? 200 : 503).json({
      success: ready,
      service: "api-gateway",
      dependencies,
    });
  });

  app.use((req, res) => res.status(404).json({
    success: false,
    error: { code: "ROUTE_NOT_FOUND", message: "API Gateway route not found", requestId: req.requestId },
  }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    logger.error?.(JSON.stringify({ level: "error", requestId: req.requestId, path: req.path, message: error.message }));
    return res.status(500).json({
      success: false,
      error: { code: "GATEWAY_ERROR", message: "API Gateway request failed", requestId: req.requestId },
    });
  });

  return app;
}

module.exports = { createApp, parseOrigins, validServiceUrl };
