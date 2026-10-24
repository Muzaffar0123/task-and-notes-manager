require("dotenv").config();

const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const PORT = process.env.PORT || 3000;

// Allow the local Vite frontend to call the API Gateway.
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && /^http:\/\/localhost:\d+$/.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "TaskFlow API Gateway",
    status: "running",
  });
});

// User Service
app.use(
  "/api/users",
  createProxyMiddleware({
    target: process.env.USER_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/api/users${path}`,
  })
);

// Task Service
app.use(
  "/api/tasks",
  createProxyMiddleware({
    target: process.env.TASK_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/api/tasks${path}`,
  })
);

// Notification Service
app.use(
  "/api/notifications",
  createProxyMiddleware({
    target: process.env.NOTIFICATION_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/api/notifications${path}`,
  })
);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API Gateway route not found",
  });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});
