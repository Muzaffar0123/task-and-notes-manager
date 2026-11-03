const assert = require("node:assert/strict");
const { test } = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");
const { createApp } = require("../src/app");

const secret = "gateway-test-secret";
const issuer = "taskflow-user-service";

function makeToken(userId, role = "USER", expiresIn = "5m") {
  return jwt.sign({ sub: userId, role }, secret, { issuer, expiresIn });
}

async function testValidateSession({ decoded }) {
  return { status: 200, user: { id: decoded.sub, role: decoded.role || "USER" } };
}

async function listen(app) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return server;
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function createUpstream(name, requests = []) {
  const app = express();
  app.use((req, res) => {
    requests.push({
      name,
      path: req.originalUrl,
      authorization: req.headers.authorization,
      spoofedUserId: req.headers["x-user-id"],
      requestId: req.headers["x-request-id"],
      internalToken: req.headers["x-internal-service-token"],
    });
    res.json({ service: name, path: req.originalUrl });
  });
  const server = await listen(app);
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

test("forwards all existing service paths with verified bearer identity and safe headers", async (context) => {
  const requests = [];
  const upstreams = {};
  for (const name of ["users", "tasks", "notifications", "notes", "social"]) {
    upstreams[name] = await createUpstream(name, requests);
    context.after(() => close(upstreams[name].server));
  }
  const logs = [];
  const gateway = await listen(createApp({
    serviceUrls: Object.fromEntries(Object.entries(upstreams).map(([name, upstream]) => [name, upstream.url])),
    jwtSecret: secret,
    validateSession: testValidateSession,
    corsOrigins: ["https://app.taskflow.example"],
    logger: { info: (message) => logs.push(message), error: (message) => logs.push(message) },
  }));
  context.after(() => close(gateway));

  const baseUrl = `http://127.0.0.1:${gateway.address().port}`;
  const accessToken = makeToken("user-123");
  const routes = [
    ["/api/users/profile?view=short", "users", "/api/users/profile?view=short"],
    ["/api/tasks?status=PENDING", "tasks", "/api/tasks?status=PENDING"],
    ["/api/notifications/unread-count", "notifications", "/api/notifications/unread-count"],
    ["/api/notes/search?search=public", "notes", "/api/notes/search?search=public"],
    ["/api/social/feed?page=1", "social", "/api/social/feed?page=1"],
  ];

  for (const [path, name, forwardedPath] of routes) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-User-Id": "attacker-controlled-user",
        "X-Internal-Service-Token": "attacker-controlled-token",
      },
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.service, name);
    assert.equal(body.path, forwardedPath);
    assert.ok(response.headers.get("x-request-id"));
  }

  assert.equal(requests.length, routes.length);
  assert.equal(requests.every((request) => request.authorization === `Bearer ${accessToken}`), true);
  assert.equal(requests.every((request) => request.spoofedUserId === undefined), true);
  assert.equal(requests.every((request) => request.internalToken === undefined), true);
  assert.equal(requests.every((request) => Boolean(request.requestId)), true);
  const serializedLogs = logs.join("\n");
  assert.equal(serializedLogs.includes(accessToken), false);
  assert.equal(serializedLogs.includes("attacker-controlled-user"), false);

  const publicRegistration = await fetch(`${baseUrl}/api/users/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "New user" }),
  });
  assert.equal(publicRegistration.status, 200);
  assert.equal((await publicRegistration.json()).service, "users");

  const missingToken = await fetch(`${baseUrl}/api/tasks`);
  assert.equal(missingToken.status, 401);
  const expiredToken = await fetch(`${baseUrl}/api/tasks`, {
    headers: { Authorization: `Bearer ${makeToken("user-123", "USER", -1)}` },
  });
  assert.equal(expiredToken.status, 401);

  const allowedCors = await fetch(`${baseUrl}/health`, {
    headers: { Origin: "https://app.taskflow.example" },
  });
  assert.equal(allowedCors.headers.get("access-control-allow-origin"), "https://app.taskflow.example");
  const deniedCors = await fetch(`${baseUrl}/health`, {
    headers: { Origin: "https://attacker.example" },
  });
  assert.equal(deniedCors.status, 403);
  const preflight = await fetch(`${baseUrl}/api/tasks`, {
    method: "OPTIONS",
    headers: { Origin: "https://app.taskflow.example", "Access-Control-Request-Method": "POST" },
  });
  assert.equal(preflight.status, 204);
});

test("administrative Notes routes require an admin claim or configured allowlist", async (context) => {
  const upstream = await createUpstream("notes");
  context.after(() => close(upstream.server));
  const gateway = await listen(createApp({
    serviceUrls: { notes: upstream.url },
    jwtSecret: secret,
    validateSession: testValidateSession,
    corsOrigins: [],
    adminUserIds: ["allowlisted-admin"],
    logger: { info() {}, error() {} },
  }));
  context.after(() => close(gateway));
  const baseUrl = `http://127.0.0.1:${gateway.address().port}`;

  const userResponse = await fetch(`${baseUrl}/api/notes/admin/public`, {
    headers: { Authorization: `Bearer ${makeToken("regular-user")}` },
  });
  assert.equal(userResponse.status, 403);

  const adminResponse = await fetch(`${baseUrl}/api/notes/admin/public`, {
    headers: { Authorization: `Bearer ${makeToken("allowlisted-admin")}` },
  });
  assert.equal(adminResponse.status, 200);
  const roleAdminResponse = await fetch(`${baseUrl}/api/notes/admin/reports`, {
    headers: { Authorization: `Bearer ${makeToken("role-admin", "ADMIN")}` },
  });
  assert.equal(roleAdminResponse.status, 200);
});

test("rejects frozen account sessions before forwarding to downstream services", async (context) => {
  const requests = [];
  const upstream = await createUpstream("tasks", requests);
  context.after(() => close(upstream.server));
  const gateway = await listen(createApp({
    serviceUrls: { tasks: upstream.url },
    jwtSecret: secret,
    corsOrigins: [],
    validateSession: async ({ decoded }) => decoded.sub === "frozen-user"
      ? { status: 403 }
      : { status: 200, user: { id: decoded.sub, role: decoded.role || "USER" } },
    logger: { info() {}, error() {} },
  }));
  context.after(() => close(gateway));

  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/api/tasks`, {
    headers: { Authorization: `Bearer ${makeToken("frozen-user")}` },
  });
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.error.code, "ACCOUNT_INACTIVE");
  assert.equal(requests.length, 0);
});

test("rate limits auth and API traffic and hides upstream addresses on failure", async (context) => {
  const upstream = await createUpstream("tasks");
  context.after(() => close(upstream.server));
  const gateway = await listen(createApp({
    serviceUrls: { tasks: upstream.url, users: upstream.url },
    jwtSecret: secret,
    validateSession: testValidateSession,
    corsOrigins: [],
    apiLimit: 1,
    authLimit: 1,
    apiWindowMs: 60000,
    authWindowMs: 60000,
    logger: { info() {}, error() {} },
  }));
  context.after(() => close(gateway));
  const baseUrl = `http://127.0.0.1:${gateway.address().port}`;
  const headers = { Authorization: `Bearer ${makeToken("user-1")}` };

  assert.equal((await fetch(`${baseUrl}/api/tasks`, { headers })).status, 200);
  const limited = await fetch(`${baseUrl}/api/tasks`, { headers });
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.code, "RATE_LIMITED");

  const authGateway = await listen(createApp({
    serviceUrls: { users: upstream.url },
    jwtSecret: secret,
    validateSession: testValidateSession,
    corsOrigins: [],
    apiLimit: 20,
    authLimit: 1,
    apiWindowMs: 60000,
    authWindowMs: 60000,
    logger: { info() {}, error() {} },
  }));
  context.after(() => close(authGateway));
  const authBase = `http://127.0.0.1:${authGateway.address().port}`;
  assert.equal((await fetch(`${authBase}/api/users/login`, { method: "POST" })).status, 200);
  assert.equal((await fetch(`${authBase}/api/users/login`, { method: "POST" })).status, 429);

  const unavailableGateway = await listen(createApp({
    serviceUrls: { tasks: "http://127.0.0.1:1" },
    jwtSecret: secret,
    validateSession: testValidateSession,
    corsOrigins: [],
    logger: { info() {}, error() {} },
  }));
  context.after(() => close(unavailableGateway));
  const unavailable = await fetch(`http://127.0.0.1:${unavailableGateway.address().port}/api/tasks`, { headers });
  assert.equal(unavailable.status, 502);
  const errorBody = await unavailable.json();
  assert.equal(errorBody.error.code, "UPSTREAM_UNAVAILABLE");
  assert.equal(JSON.stringify(errorBody).includes("127.0.0.1:1"), false);
});


test("readiness probes each configured service health endpoint", async (context) => {
  const checks = [];
  const gateway = await listen(createApp({
    serviceUrls: {
      users: "http://users:3001",
      tasks: "http://tasks:3002",
      notifications: "http://notifications:3003",
      notes: "http://notes:3004",
      social: "http://social:3005",
    },
    jwtSecret: secret,
    corsOrigins: [],
    checkServiceHealth: async (url) => {
      checks.push(url);
      return url !== "http://notes:3004";
    },
  }));
  context.after(() => close(gateway));

  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/ready`);
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.success, false);
  assert.deepEqual(body.dependencies, {
    users: true,
    tasks: true,
    notifications: true,
    notes: false,
    social: true,
  });
  assert.equal(checks.length, 5);
});

test("service health endpoint reports all five services safely and caches probes", async (context) => {
  const checks = [];
  const serviceUrls = {
    users: "http://user.internal:3001",
    tasks: "http://task.internal:3002",
    notes: "http://notes.internal:3004",
    social: "http://social.internal:3005",
    notifications: "http://notifications.internal:3003",
  };
  const gateway = await listen(createApp({
    serviceUrls,
    jwtSecret: secret,
    corsOrigins: [],
    probeServiceHealth: async ({ name, timeoutMs }) => {
      checks.push({ name, timeoutMs });
      return { healthy: true, httpStatus: 200, responseTimeMs: 7 };
    },
    healthCacheMs: 5000,
  }));
  context.after(() => close(gateway));
  const baseUrl = `http://127.0.0.1:${gateway.address().port}`;

  for (let index = 0; index < 2; index += 1) {
    const response = await fetch(`${baseUrl}/health/services`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, "healthy");
    assert.deepEqual(body.services, [
      { name: "User Service", status: "healthy", httpStatus: 200, responseTimeMs: 7 },
      { name: "Task Service", status: "healthy", httpStatus: 200, responseTimeMs: 7 },
      { name: "Notes Service", status: "healthy", httpStatus: 200, responseTimeMs: 7 },
      { name: "Social Service", status: "healthy", httpStatus: 200, responseTimeMs: 7 },
      { name: "Notification Service", status: "healthy", httpStatus: 200, responseTimeMs: 7 },
    ]);
    assert.equal(JSON.stringify(body).includes("internal"), false);
  }
  assert.equal(checks.length, 5);
  assert.equal(checks.every((check) => check.timeoutMs > 0), true);
});

test("service health endpoint returns 503 when one service is unhealthy", async (context) => {
  const gateway = await listen(createApp({
    serviceUrls: {
      users: "http://users:3001",
      tasks: "http://tasks:3002",
      notes: "http://notes:3004",
      social: "http://social:3005",
      notifications: "http://notifications:3003",
    },
    jwtSecret: secret,
    corsOrigins: [],
    probeServiceHealth: async ({ name }) => ({
      healthy: name !== "Social Service",
      httpStatus: name === "Social Service" ? 503 : 200,
      responseTimeMs: 3,
    }),
  }));
  context.after(() => close(gateway));

  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/health/services`);
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.status, "unhealthy");
  assert.equal(body.services.find((service) => service.name === "Social Service").httpStatus, 503);
  assert.equal(body.services.filter((service) => service.status === "unhealthy").length, 1);
});

test("service health endpoint marks a timed out probe unhealthy", async (context) => {
  const healthyApp = express();
  healthyApp.get("/health", (_req, res) => res.json({ success: true, database: "connected" }));
  const healthyUpstream = await listen(healthyApp);
  context.after(() => close(healthyUpstream));

  const slowApp = express();
  slowApp.get("/health", () => {});
  const slowUpstream = await listen(slowApp);
  context.after(() => close(slowUpstream));

  const healthyUrl = `http://127.0.0.1:${healthyUpstream.address().port}`;
  const slowUrl = `http://127.0.0.1:${slowUpstream.address().port}`;
  const gateway = await listen(createApp({
    serviceUrls: {
      users: healthyUrl,
      tasks: healthyUrl,
      notes: healthyUrl,
      social: slowUrl,
      notifications: healthyUrl,
    },
    jwtSecret: secret,
    corsOrigins: [],
    healthTimeoutMs: 30,
    healthCacheMs: 0,
  }));
  context.after(() => close(gateway));

  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/health/services`);
  const body = await response.json();
  const timedOutService = body.services.find((service) => service.name === "Social Service");
  assert.equal(response.status, 503);
  assert.equal(timedOutService.status, "unhealthy");
  assert.equal(timedOutService.httpStatus, null);
});

test("service health endpoint safely handles invalid and unavailable service configuration", async (context) => {
  const probed = [];
  const gateway = await listen(createApp({
    serviceUrls: {
      users: "ftp://users.internal",
      tasks: "http://user:password@tasks.internal",
      notes: "http://notes.internal:3004",
      social: "",
      notifications: "http://notifications.internal:3003",
    },
    jwtSecret: secret,
    corsOrigins: [],
    probeServiceHealth: async ({ name }) => {
      probed.push(name);
      if (name === "Notes Service") throw new Error("Unavailable");
      return { healthy: true, httpStatus: 200, responseTimeMs: 4 };
    },
  }));
  context.after(() => close(gateway));

  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/health/services`);
  const body = await response.json();
  const serialized = JSON.stringify(body);
  assert.equal(response.status, 503);
  assert.equal(body.status, "unhealthy");
  assert.equal(body.services.find((service) => service.name === "User Service").httpStatus, null);
  assert.equal(body.services.find((service) => service.name === "Task Service").httpStatus, null);
  assert.equal(body.services.find((service) => service.name === "Social Service").httpStatus, null);
  assert.equal(body.services.find((service) => service.name === "Notes Service").status, "unhealthy");
  assert.equal(serialized.includes("internal"), false);
  assert.equal(serialized.includes("password"), false);
  assert.deepEqual(probed, ["Notes Service", "Notification Service"]);
});
