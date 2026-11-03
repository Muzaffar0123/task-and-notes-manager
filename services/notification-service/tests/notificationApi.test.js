const assert = require("node:assert/strict");
const Module = require("node:module");
const { test } = require("node:test");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "notification-service-test-secret";

let notifications = [];
let preferences = [];
let announcements = [];
let nextId = 1;

function matches(record, where = {}) {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return condition.some((item) => matches(record, item));
    const value = record[key];
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("not" in condition) return value !== condition.not;
      return true;
    }
    return value === condition;
  });
}

const prismaStub = {
  notification: {
    async create({ data }) {
      const notification = { id: `notification-${nextId++}`, createdAt: new Date(), isRead: false, ...data };
      notifications.push(notification);
      return structuredClone(notification);
    },
    async findMany({ where, orderBy, skip = 0, take }) {
      const result = notifications.filter((item) => matches(item, where));
      if (orderBy?.createdAt) {
        result.sort((left, right) => orderBy.createdAt === "desc"
          ? right.createdAt - left.createdAt
          : left.createdAt - right.createdAt);
      }
      return result.slice(skip, take === undefined ? undefined : skip + take).map((item) => structuredClone(item));
    },
    async findFirst({ where }) {
      const item = notifications.find((notification) => matches(notification, where));
      return item ? structuredClone(item) : null;
    },
    async count({ where }) {
      return notifications.filter((item) => matches(item, where)).length;
    },
    async updateMany({ where, data }) {
      const found = notifications.filter((item) => matches(item, where));
      found.forEach((item) => Object.assign(item, data));
      return { count: found.length };
    },
    async deleteMany({ where }) {
      const before = notifications.length;
      notifications = notifications.filter((item) => !matches(item, where));
      return { count: before - notifications.length };
    },
  },
  notificationPreference: {
    async findMany({ where }) {
      return preferences.filter((item) => matches(item, where)).map((item) => structuredClone(item));
    },
    async upsert({ where, create, update }) {
      const preference = preferences.find((item) =>
        item.userId === where.userId_category.userId && item.category === where.userId_category.category
      );
      if (preference) Object.assign(preference, update);
      else preferences.push({ id: `preference-${nextId++}`, ...create });
      return structuredClone(preferences.find((item) =>
        item.userId === where.userId_category.userId && item.category === where.userId_category.category
      ));
    },
  },
  announcement: {
    async findMany({ where, skip = 0, take }) {
      const result = announcements.filter((item) => matches(item, where));
      return result.slice(skip, take === undefined ? undefined : skip + take).map((item) => structuredClone(item));
    },
    async count({ where }) {
      return announcements.filter((item) => matches(item, where)).length;
    },
  },
};
prismaStub.$transaction = (callback) => callback(prismaStub);

const prismaPath = require.resolve("../src/config/prisma");
const prismaModule = new Module(prismaPath);
prismaModule.filename = prismaPath;
prismaModule.loaded = true;
prismaModule.exports = prismaStub;
require.cache[prismaPath] = prismaModule;

const { createApp } = require("../src/app");

function token(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    issuer: "taskflow-user-service",
    expiresIn: "5m",
  });
}

test("notification APIs preserve legacy shape and enforce owner isolation/preferences", async (context) => {
  notifications = [];
  preferences = [];
  announcements = [];
  nextId = 1;
  const app = createApp();
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));

  const baseUrl = `http://127.0.0.1:${server.address().port}/api/notifications`;
  const ownerToken = token("user-1");
  const otherToken = token("user-2");
  const request = (path, accessToken = ownerToken, options = {}) => fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  });

  const createdResponse = await request("", ownerToken, {
    method: "POST",
    body: JSON.stringify({
      userId: "user-1",
      taskId: "task-1",
      title: "Task created",
      message: "Your task is ready. https://private.example/document",
    }),
  });
  const created = (await createdResponse.json()).data;
  assert.equal(createdResponse.status, 201);
  assert.equal(created.category, "TASK");
  assert.equal(created.message, "Your task is ready.");
  assert.equal((await request("", ownerToken, {
    method: "POST",
    body: JSON.stringify({ userId: "user-2", title: "Spoof", message: "Not yours" }),
  })).status, 403);

  const otherNotification = await request("", otherToken, {
    method: "POST",
    body: JSON.stringify({ title: "Private", message: "Other account" }),
  });
  const otherId = (await otherNotification.json()).data.id;
  const list = await (await request("", ownerToken)).json();
  assert.equal(list.count, 1);
  assert.equal(list.data.length, 1);
  assert.equal((await request(`/${otherId}`, ownerToken)).status, 404);
  assert.equal((await request(`/${otherId}/read`, ownerToken, { method: "PATCH" })).status, 404);
  assert.equal((await request(`/${otherId}`, ownerToken, { method: "DELETE" })).status, 404);

  assert.equal((await (await request("/unread-count", ownerToken)).json()).count, 1);
  assert.equal((await request(`/${created.id}/read`, ownerToken, { method: "PATCH" })).status, 200);
  const second = await request("", ownerToken, {
    method: "POST",
    body: JSON.stringify({ title: "Another", message: "Unread" }),
  });
  assert.equal((await second.json()).success, true);
  const marked = await (await request("/read-all", ownerToken, { method: "PATCH" })).json();
  assert.equal(marked.updatedCount, 1);
  assert.equal((await (await request("/unread-count", ownerToken)).json()).count, 0);

  const preferenceResponse = await request("/preferences", ownerToken, {
    method: "PUT",
    body: JSON.stringify({
      preferences: [{ category: "LIKE", inAppEnabled: false, emailEnabled: true }],
    }),
  });
  assert.equal(preferenceResponse.status, 200);
  const ownerPreferences = await (await request("/preferences", ownerToken)).json();
  const likePreference = ownerPreferences.data.find((item) => item.category === "LIKE");
  assert.equal(likePreference.inAppEnabled, false);
  assert.equal(likePreference.emailEnabled, true);
  const otherPreferences = await (await request("/preferences", otherToken)).json();
  assert.equal(otherPreferences.data.find((item) => item.category === "LIKE").inAppEnabled, true);

  assert.equal((await request(`/${created.id}`, ownerToken, { method: "DELETE" })).status, 200);
  assert.equal((await request("/preferences", ownerToken, {
    method: "PUT",
    body: JSON.stringify({ preferences: [{ category: "UNKNOWN", inAppEnabled: true, emailEnabled: false }] }),
  })).status, 400);
});