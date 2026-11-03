const assert = require("node:assert/strict");
const Module = require("node:module");
const { test } = require("node:test");
const bcrypt = require("bcrypt");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "taskflow-admin-users-test-secret";

let users;
let auditRows;
function matches(user, where = {}) {
  if (!where.OR) return true;
  const search = where.OR[0].name.contains.toLowerCase();
  return user.name.toLowerCase().includes(search) || user.email.toLowerCase().includes(search);
}
function project(user, select) {
  if (!user) return null;
  if (!select) return { ...user };
  return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, user[key]]));
}

const prisma = {
  user: {
    async findUnique({ where, select }) {
      const user = users.find((item) => (where.id && item.id === where.id) || (where.email && item.email === where.email));
      return project(user, select);
    },
    async findMany({ where, select, skip, take }) {
      return users.filter((user) => matches(user, where)).slice(skip, skip + take).map((user) => project(user, select));
    },
    async count({ where }) {
      return users.filter((user) => matches(user, where)).length;
    },
    async update({ where, data, select }) {
      const user = users.find((item) => item.id === where.id);
      if (!user) {
        const error = new Error("Not found");
        error.code = "P2025";
        throw error;
      }
      const { tokenVersion, ...updates } = data;
      Object.assign(user, updates);
      if (tokenVersion?.increment) user.tokenVersion += tokenVersion.increment;
      return project(user, select);
    },
  },
  adminAuditLog: {
    async create({ data }) {
      const row = { id: `audit-${auditRows.length + 1}`, ...data, createdAt: new Date() };
      auditRows.push(row);
      return row;
    },
  },
};
prisma.$transaction = (callback) => callback(prisma);

const prismaPath = require.resolve("../src/config/prisma");
const prismaModule = new Module(prismaPath);
prismaModule.filename = prismaPath;
prismaModule.loaded = true;
prismaModule.exports = prisma;
require.cache[prismaPath] = prismaModule;

const authenticateToken = require("../src/middleware/authMiddleware");
const requireAdmin = require("../src/middleware/requireAdmin");
const authController = require("../src/controllers/authController");
const adminUserRoutes = require("../src/routes/adminUserRoutes");

test("admin user APIs protect access, paginate/search safe fields, and freeze/restore accounts", async (context) => {
  const passwordHash = await bcrypt.hash("test-password-123", 4);
  users = [
    { id: "admin-1", name: "TaskFlow Admin", email: "admin@example.com", passwordHash, role: "ADMIN", status: "ACTIVE", tokenVersion: 0, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") },
    { id: "user-1", name: "Avery Member", email: "avery@example.com", passwordHash, role: "USER", status: "ACTIVE", tokenVersion: 0, createdAt: new Date("2026-01-02"), updatedAt: new Date("2026-01-02") },
  ];
  auditRows = [];

  const app = express();
  app.use(express.json());
  app.post("/login", authController.login);
  app.use("/admin", authenticateToken, requireAdmin, adminUserRoutes);
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const tokenFor = (user) => jwt.sign({ sub: user.id, ver: user.tokenVersion, role: user.role }, process.env.JWT_SECRET, { issuer: "taskflow-user-service", expiresIn: "5m" });
  const adminHeaders = { Authorization: `Bearer ${tokenFor(users[0])}` };
  const userHeaders = { Authorization: `Bearer ${tokenFor(users[1])}` };

  assert.equal((await fetch(`${baseUrl}/admin/users`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/admin/users`, { headers: userHeaders })).status, 403);

  const listResponse = await fetch(`${baseUrl}/admin/users?page=1&pageSize=1`, { headers: adminHeaders });
  const list = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.equal(list.data.length, 1);
  assert.deepEqual(list.pagination, { page: 1, pageSize: 1, total: 2, totalPages: 2 });
  assert.equal("passwordHash" in list.data[0], false);
  assert.equal("tokenVersion" in list.data[0], false);

  const searchResponse = await fetch(`${baseUrl}/admin/users?search=avery%40example.com`, { headers: adminHeaders });
  const search = await searchResponse.json();
  assert.equal(searchResponse.status, 200);
  assert.equal(search.data.length, 1);
  assert.equal(search.data[0].id, "user-1");

  const detailResponse = await fetch(`${baseUrl}/admin/users/user-1`, { headers: adminHeaders });
  const detail = await detailResponse.json();
  assert.equal(detailResponse.status, 200);
  assert.equal(detail.data.email, "avery@example.com");
  assert.equal("passwordHash" in detail.data, false);

  assert.equal((await fetch(`${baseUrl}/admin/users?page=0`, { headers: adminHeaders })).status, 400);
  assert.equal((await fetch(`${baseUrl}/admin/users/admin-1/status`, {
    method: "PATCH", headers: { ...adminHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ status: "FROZEN" }),
  })).status, 403);
  assert.equal((await fetch(`${baseUrl}/admin/users/user-1/status`, {
    method: "PATCH", headers: { ...adminHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ status: "ACTIVE", role: "ADMIN" }),
  })).status, 403);

  const freezeResponse = await fetch(`${baseUrl}/admin/users/user-1/status`, {
    method: "PATCH", headers: { ...adminHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ status: "FROZEN", reason: "Security review" }),
  });
  assert.equal(freezeResponse.status, 200);
  assert.equal((await freezeResponse.json()).data.status, "FROZEN");
  const blockedLogin = await fetch(`${baseUrl}/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "avery@example.com", password: "test-password-123" }),
  });
  assert.equal(blockedLogin.status, 403);
  assert.equal((await fetch(`${baseUrl}/admin/users`, { headers: userHeaders })).status, 401);

  const restoreResponse = await fetch(`${baseUrl}/admin/users/user-1/status`, {
    method: "PATCH", headers: { ...adminHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ status: "ACTIVE" }),
  });
  assert.equal(restoreResponse.status, 200);
  assert.equal((await restoreResponse.json()).data.status, "ACTIVE");
  const restoredLogin = await fetch(`${baseUrl}/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "avery@example.com", password: "test-password-123" }),
  });
  assert.equal(restoredLogin.status, 200);
  assert.equal(auditRows.length, 2);
  assert.deepEqual(auditRows.map((row) => row.action), ["USER_STATUS_CHANGED", "USER_STATUS_CHANGED"]);
});
