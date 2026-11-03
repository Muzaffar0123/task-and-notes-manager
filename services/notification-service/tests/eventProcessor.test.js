const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createEventProcessor } = require("../src/services/eventProcessor");

function createDatabase() {
  const state = {
    processed: new Map(),
    notifications: [],
    preferences: [],
    announcements: [],
  };

  const database = {
    processedEvent: {
      async findUnique({ where }) {
        return state.processed.get(where.eventId) || null;
      },
      async create({ data }) {
        if (state.processed.has(data.eventId)) {
          const error = new Error("duplicate event");
          error.code = "P2002";
          throw error;
        }
        const row = { ...data, attempts: 0, lastError: null };
        state.processed.set(row.eventId, row);
        return row;
      },
      async update({ where, data }) {
        const row = state.processed.get(where.eventId);
        if (!row) throw new Error("Processed event missing");
        for (const [key, value] of Object.entries(data)) {
          if (value && typeof value === "object" && "increment" in value) row[key] += value.increment;
          else row[key] = value;
        }
        return row;
      },
      async updateMany({ where, data }) {
        const row = state.processed.get(where.eventId);
        if (!row) return { count: 0 };
        const eligible = where.OR?.some((condition) => {
          if (condition.status === "RETRY") return row.status === "RETRY";
          if (condition.status === "PROCESSING" && condition.processingUntil === null) {
            return row.status === "PROCESSING" && row.processingUntil === null;
          }
          if (condition.status === "PROCESSING" && condition.processingUntil?.lte) {
            return row.status === "PROCESSING" && row.processingUntil <= condition.processingUntil.lte;
          }
          return false;
        });
        if (!eligible) return { count: 0 };
        await database.processedEvent.update({ where, data });
        return { count: 1 };
      },
    },
    notificationPreference: {
      async findMany({ where }) {
        return state.preferences.filter((item) => where.userId.in.includes(item.userId));
      },
      async findUnique({ where }) {
        return state.preferences.find((item) =>
          item.userId === where.userId_category.userId && item.category === where.userId_category.category
        ) || null;
      },
    },
    notification: {
      async upsert({ where, create }) {
        const existing = state.notifications.find((item) =>
          item.userId === where.userId_sourceEventId.userId &&
          item.sourceEventId === where.userId_sourceEventId.sourceEventId
        );
        if (existing) return existing;
        const notification = { id: `notification-${state.notifications.length + 1}`, ...create };
        state.notifications.push(notification);
        return notification;
      },
    },
    announcement: {
      async upsert({ where, create }) {
        const existing = state.announcements.find((item) => item.sourceEventId === where.sourceEventId);
        if (existing) return existing;
        state.announcements.push(create);
        return create;
      },
    },
    async $transaction(callback) {
      return callback(database);
    },
  };

  return { database, state };
}

test("processor deduplicates events and respects in-app preferences", async () => {
  const { database, state } = createDatabase();
  const sentEmails = [];
  const processor = createEventProcessor({
    database,
    followerLookup: async () => ["follower-1", "follower-2"],
    email: { async sendEmail(message) { sentEmails.push(message); } },
  });

  const welcome = {
    eventId: "user-event-1",
    type: "UserRegistered",
    payload: { userId: "user-1", email: "user@example.com", name: "Alex", passwordHash: "must-not-be-retained", accessToken: "must-not-be-retained" },
  };
  await processor.processEvent(welcome);
  await processor.processEvent(welcome);
  assert.equal(state.notifications.length, 1);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, "user@example.com");
  assert.equal(state.processed.get("user-event-1").status, "PROCESSED");
  assert.equal("passwordHash" in state.processed.get("user-event-1").payload, false);
  assert.equal("accessToken" in state.processed.get("user-event-1").payload, false);

  state.preferences.push({ userId: "follower-1", category: "NOTE", inAppEnabled: false, emailEnabled: false });
  const noteEvent = {
    eventId: "note-event-1",
    type: "NotePublished",
    payload: {
      noteId: "note-1",
      ownerId: "author-1",
      privateNoteContent: "must not be copied",
      documentUrl: "https://private.example/document",
    },
  };
  await processor.processEvent(noteEvent);
  assert.equal(state.notifications.length, 2);
  assert.equal(state.notifications[1].userId, "follower-2");
  assert.equal("privateNoteContent" in state.notifications[1].metadata, false);
  assert.equal("documentUrl" in state.notifications[1].metadata, false);
  assert.equal(state.notifications[1].message.includes("must not be copied"), false);
  assert.equal("privateNoteContent" in state.processed.get(noteEvent.eventId).payload, false);
  assert.equal("documentUrl" in state.processed.get(noteEvent.eventId).payload, false);
});

test("failed activity email retries without duplicating its notification", async () => {
  const { database, state } = createDatabase();
  const idempotencyKeys = [];
  let shouldFail = true;
  const processor = createEventProcessor({
    database,
    email: {
      async sendEmail(message) {
        idempotencyKeys.push(message.idempotencyKey);
        if (shouldFail) throw new Error("provider unavailable");
      },
    },
  });
  state.preferences.push({ userId: "note-owner", category: "LIKE", inAppEnabled: true, emailEnabled: true });
  const event = {
    eventId: "like-event-1",
    type: "NoteLiked",
    payload: { ownerId: "note-owner", actorId: "actor-1", recipientId: "note-owner", recipientEmail: "owner@example.com", noteId: "note-1" },
  };

  await assert.rejects(processor.processEvent(event), /provider unavailable/);
  assert.equal(state.notifications.length, 1);
  assert.equal(state.processed.get(event.eventId).status, "RETRY");

  shouldFail = false;
  await processor.processEvent(event);
  assert.equal(state.notifications.length, 1);
  assert.equal(state.processed.get(event.eventId).status, "PROCESSED");
  assert.deepEqual(idempotencyKeys, ["like-event-1:note-owner", "like-event-1:note-owner"]);
});

test("supported task, follow, comment, like, and rating events notify their intended recipients", async () => {
  const { database, state } = createDatabase();
  const processor = createEventProcessor({ database });
  const cases = [
    ["FollowCreated", { followerId: "user-1", followeeId: "followed-user" }, "followed-user", "FOLLOW"],
    ["TaskCreated", { id: "task-1", userId: "task-owner" }, "task-owner", "TASK"],
    ["TaskUpdated", { id: "task-2", userId: "task-owner" }, "task-owner", "TASK"],
    ["TaskCompleted", { id: "task-3", userId: "task-owner" }, "task-owner", "TASK"],
    ["NoteLiked", { noteId: "note-1", ownerId: "note-owner", actorId: "user-2" }, "note-owner", "LIKE"],
    ["NoteRestricted", { noteId: "note-1", ownerId: "note-owner" }, "note-owner", "NOTE"],
    ["NoteRestored", { noteId: "note-1", ownerId: "note-owner" }, "note-owner", "NOTE"],
    ["CommentCreated", { noteId: "note-1", ownerId: "note-owner" }, "note-owner", "COMMENT"],
    ["NoteRated", { noteId: "note-1", ownerId: "note-owner", actorId: "user-2", value: 4 }, "note-owner", "RATING"],
  ];

  for (const [type, payload, expectedUser, expectedCategory] of cases) {
    await processor.processEvent({ eventId: `event-${type}`, type, payload });
    const notification = state.notifications.find((item) => item.sourceEventId === `event-${type}`);
    assert.equal(notification.userId, expectedUser);
    assert.equal(notification.category, expectedCategory);
  }
});

test("announcement events persist sanitized announcements and deliver to listed users", async () => {
  const { database, state } = createDatabase();
  const processor = createEventProcessor({ database });
  await processor.processEvent({
    eventId: "announcement-event-1",
    type: "AnnouncementPublished",
    payload: {
      title: "Maintenance",
      message: "Service window https://private.example/file",
      recipientIds: ["user-1", "user-2"],
    },
  });
  assert.equal(state.announcements.length, 1);
  assert.equal(state.announcements[0].message.includes("https://"), false);
  assert.deepEqual(state.notifications.map((item) => item.userId), ["user-1", "user-2"]);
  assert.equal(state.notifications.every((item) => item.category === "ANNOUNCEMENT"), true);
});

test("invalid events are rejected before being claimed or persisted", async () => {
  const { database, state } = createDatabase();
  const processor = createEventProcessor({ database });
  await assert.rejects(
    processor.processEvent({ eventId: "invalid-1", type: "TaskCreated", payload: {} }),
    { permanent: true }
  );
  assert.equal(state.processed.size, 0);
});
