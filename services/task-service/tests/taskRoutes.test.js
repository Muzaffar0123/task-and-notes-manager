const assert = require("node:assert/strict");
const Module = require("node:module");
const { test } = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "task-service-test-secret";
delete process.env.NOTIFICATION_SERVICE_URL;

let tasks = [];
let nextId = 1;
let outbox = [];
let nextEventId = 1;

function matches(task, where) {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return condition.some((item) => matches(task, item));

    const value = task[key];
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("contains" in condition) {
        return String(value || "").toLowerCase().includes(condition.contains.toLowerCase());
      }
      if ("not" in condition && value === condition.not) return false;
      if (condition.gte && !(value && new Date(value) >= condition.gte)) return false;
      if (condition.lte && !(value && new Date(value) <= condition.lte)) return false;
      if (condition.lt && !(value && new Date(value) < condition.lt)) return false;
      return true;
    }

    return value === condition;
  });
}

const prismaStub = {
  task: {
    async create({ data }) {
      const task = {
        id: `task-${nextId++}`,
        status: "PENDING",
        priority: "MEDIUM",
        dueDate: null,
        deadlineReminderSentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      tasks.push(task);
      return { ...task };
    },
    async findMany({ where, orderBy, skip, take }) {
      const results = tasks.filter((task) => matches(task, where));
      if (!orderBy) return results.map((task) => ({ ...task }));

      const [sortField, sortOrder] = Object.entries(orderBy)[0];
      results.sort((left, right) => {
        const leftValue = left[sortField];
        const rightValue = right[sortField];
        const comparison = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
        return sortOrder === "asc" ? comparison : -comparison;
      });
      return results.slice(skip || 0, take === undefined ? undefined : (skip || 0) + take).map((task) => ({ ...task }));
    },
    async findFirst({ where }) {
      const task = tasks.find((candidate) => matches(candidate, where));
      return task ? { ...task } : null;
    },
    async updateMany({ where, data }) {
      const matchesToUpdate = tasks.filter((task) => matches(task, where));
      for (const task of matchesToUpdate) {
        Object.assign(task, data, { updatedAt: new Date() });
      }
      return { count: matchesToUpdate.length };
    },
    async deleteMany({ where }) {
      const originalLength = tasks.length;
      tasks = tasks.filter((task) => !matches(task, where));
      return { count: originalLength - tasks.length };
    },
    async count({ where }) {
      return tasks.filter((task) => matches(task, where)).length;
    },
  },
  taskEventOutbox: {
    async create({ data }) {
      const event = {
        id: `event-${nextEventId++}`,
        createdAt: new Date(),
        publishedAt: null,
        attempts: 0,
        ...data,
      };
      outbox.push(event);
      return { ...event };
    },
    async findMany({ take }) {
      return outbox
        .filter((event) => event.publishedAt === null)
        .sort((left, right) => left.createdAt - right.createdAt)
        .slice(0, take)
        .map((event) => ({ ...event }));
    },
    async update({ where, data }) {
      const event = outbox.find((item) => item.id === where.id);
      if (!event) throw new Error("Event not found");
      if (data.publishedAt) event.publishedAt = data.publishedAt;
      if (data.attempts) event.attempts += data.attempts.increment;
      return { ...event };
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

const taskRoutes = require("../src/routes/taskRoutes");
const { createTaskEventWorker } = require("../src/events/taskEventWorker");

function makeToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    issuer: "taskflow-user-service",
    expiresIn: "5m",
  });
}

test("task APIs preserve ownership and support validation, filtering, sorting, pagination, and statistics", async (context) => {
  tasks = [];
  nextId = 1;
  outbox = [];
  nextEventId = 1;

  const app = express();
  app.use(express.json());
  app.use("/api/tasks", taskRoutes);

  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));

  const baseUrl = `http://127.0.0.1:${server.address().port}/api/tasks`;
  const ownerToken = makeToken("owner-1");
  const otherToken = makeToken("owner-2");
  const request = (path, token = ownerToken, options = {}) => fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  assert.equal((await fetch(baseUrl)).status, 401);
  assert.equal((await request("", ownerToken, {
    method: "POST",
    body: JSON.stringify({ title: "   " }),
  })).status, 400);

  const pastDue = new Date(Date.now() - 86400000).toISOString();
  const futureDue = new Date(Date.now() + 3 * 86400000).toISOString();
  const createdResponse = await request("", ownerToken, {
    method: "POST",
    body: JSON.stringify({
      title: "Plan release",
      priority: "HIGH",
      dueDate: pastDue,
      userId: "owner-2",
    }),
  });
  const created = (await createdResponse.json()).data;

  assert.equal(createdResponse.status, 201);
  assert.equal(created.userId, "owner-1");

  const secondResponse = await request("", ownerToken, {
    method: "POST",
    body: JSON.stringify({ title: "Buy milk", priority: "LOW", dueDate: futureDue }),
  });
  assert.equal(secondResponse.status, 201);

  const otherTaskResponse = await request("", otherToken, {
    method: "POST",
    body: JSON.stringify({ title: "Private task" }),
  });
  const otherTask = (await otherTaskResponse.json()).data;

  const ownerTasks = await (await request("", ownerToken)).json();
  assert.equal(ownerTasks.count, 2);
  assert.equal(ownerTasks.data.length, 2);

  const searchResults = await (await request("?search=release", ownerToken)).json();
  assert.equal(searchResults.data.length, 1);
  assert.equal(searchResults.data[0].id, created.id);

  const filteredResults = await (await request("?status=PENDING&priority=HIGH", ownerToken)).json();
  assert.equal(filteredResults.data.length, 1);
  assert.equal(filteredResults.data[0].id, created.id);

  const dueDateResults = await (await request(
    `?dueDateTo=${encodeURIComponent(pastDue)}`,
    ownerToken
  )).json();
  assert.equal(dueDateResults.data.length, 1);
  assert.equal(dueDateResults.data[0].id, created.id);

  const sortedPage = await (await request("?sortBy=title&sortOrder=asc&page=1&pageSize=1", ownerToken)).json();
  assert.equal(sortedPage.data.length, 1);
  assert.equal(sortedPage.data[0].title, "Buy milk");
  assert.deepEqual(sortedPage.pagination, { page: 1, pageSize: 1, total: 2 });
  assert.equal((await request("?pageSize=101", ownerToken)).status, 400);
  assert.equal((await request("?status=INVALID", ownerToken)).status, 400);
  assert.equal((await request("?sortOrder=sideways", ownerToken)).status, 400);

  const otherUsersTasks = await (await request("", otherToken)).json();
  assert.equal(otherUsersTasks.count, 1);
  assert.equal(otherUsersTasks.data[0].id, otherTask.id);

  assert.equal((await request(`/${otherTask.id}`, ownerToken, {
    method: "PATCH",
    body: JSON.stringify({ title: "Changed" }),
  })).status, 404);
  assert.equal((await request(`/${otherTask.id}`, ownerToken, { method: "DELETE" })).status, 404);

  const updateResponse = await request(`/${created.id}`, ownerToken, {
    method: "PATCH",
    body: JSON.stringify({ status: "COMPLETED" }),
  });
  assert.equal(updateResponse.status, 200);

  const statistics = await (await request("/statistics", ownerToken)).json();
  assert.deepEqual(statistics.data, {
    total: 2,
    pending: 1,
    inProgress: 0,
    completed: 1,
    overdue: 0,
  });

  assert.equal((await request(`/${created.id}`, ownerToken, { method: "DELETE" })).status, 200);

  const reminderDueDate = new Date(Date.now() + 3600000).toISOString();
  const reminderTaskResponse = await request("", ownerToken, {
    method: "POST",
    body: JSON.stringify({ title: "Prepare demo", dueDate: reminderDueDate }),
  });
  assert.equal(reminderTaskResponse.status, 201);

  const publishedEvents = [];
  const worker = createTaskEventWorker({
    prisma: prismaStub,
    publisher: { publish: async (event) => publishedEvents.push(event) },
    logger: { error() {} },
  });

  await worker.scheduleDeadlineReminders();
  const reminders = outbox.filter((event) => event.eventType === "TaskDeadlineReminder");
  assert.equal(reminders.length, 1);

  await worker.scheduleDeadlineReminders();
  assert.equal(outbox.filter((event) => event.eventType === "TaskDeadlineReminder").length, 1);

  await worker.flushOutbox();
  assert.deepEqual(
    publishedEvents.map((event) => event.eventType).sort(),
    [
      "TaskCompleted",
      "TaskCreated",
      "TaskCreated",
      "TaskCreated",
      "TaskCreated",
      "TaskDeadlineReminder",
      "TaskUpdated",
    ].sort()
  );
  assert.equal(outbox.every((event) => event.publishedAt instanceof Date), true);
});