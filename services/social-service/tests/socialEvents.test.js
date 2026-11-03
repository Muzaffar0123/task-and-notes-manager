const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const { createNoteEventConsumer } = require("../src/events/noteEventConsumer");
const { createSocialEventPublisher } = require("../src/events/socialEventPublisher");
const { createSocialOutboxWorker } = require("../src/events/socialOutboxWorker");

test("Notes events maintain an eligible-only Social read model", async () => {
  const eligible = new Map();
  const processedEvents = new Set();
  let upsertCalls = 0;
  const deleted = { likes: [], comments: [], ratings: [], bookmarks: [], eligibleNotes: [] };
  const transaction = {
    eligibleNote: {
      async upsert({ where, create, update }) {
        upsertCalls += 1;
        const existing = eligible.get(where.noteId);
        eligible.set(where.noteId, { ...(existing || create), ...(existing ? update : create) });
      },
      async deleteMany({ where }) {
        eligible.delete(where.noteId);
        deleted.eligibleNotes.push(where.noteId);
      },
      async updateMany({ where, data }) {
        const note = eligible.get(where.noteId);
        if (note) Object.assign(note, data);
      },
    },
    like: {
      async count() { return 2; },
      async upsert() {},
      async deleteMany({ where }) { deleted.likes.push(where.noteId); },
    },
    comment: {
      async count() { return 1; },
      async deleteMany({ where }) { deleted.comments.push(where.noteId); },
    },
    rating: {
      async aggregate() { return { _avg: { value: 4.5 }, _count: { _all: 2 } }; },
      async upsert() {},
      async deleteMany({ where }) { deleted.ratings.push(where.noteId); },
    },
    bookmark: {
      async deleteMany({ where }) { deleted.bookmarks.push(where.noteId); },
    },
  };
  transaction.socialProcessedEvent = {
    async create({ data }) {
      if (processedEvents.has(data.eventId)) {
        const error = new Error("duplicate event");
        error.code = "P2002";
        throw error;
      }
      processedEvents.add(data.eventId);
    },
  };
  const prisma = { async $transaction(callback) { return callback(transaction); } };
  const consumer = createNoteEventConsumer({ prisma });

  await consumer.applyEvent({
    eventId: "note-published-1",
    type: "NotePublished",
    payload: {
      noteId: "note-1",
      ownerId: "owner-1",
      visibility: "PUBLIC",
      status: "PUBLISHED",
      publishedAt: "2026-11-01T10:00:00.000Z",
      likeCount: 2,
      ratingCount: 2,
      ratingAverage: 4.5,
      ratingTotal: 9,
    },
  });
  assert.equal(eligible.get("note-1").likeCount, 2);
  assert.equal(eligible.get("note-1").commentCount, 1);
  assert.equal(eligible.get("note-1").ratingAverage, 4.5);
  assert.equal(eligible.get("note-1").ratingTotal, 9);
  assert.equal(eligible.get("note-1").popularityScore, 11);
  await consumer.applyEvent({
    eventId: "note-published-1",
    type: "NotePublished",
    payload: {
      noteId: "note-1",
      ownerId: "owner-1",
      visibility: "PUBLIC",
      status: "PUBLISHED",
      publishedAt: "2026-11-01T10:00:00.000Z",
      likeCount: 2,
      ratingCount: 2,
      ratingAverage: 4.5,
      ratingTotal: 9,
    },
  });
  assert.equal(upsertCalls, 1, "duplicate delivery must not repeat projection side effects");

  await consumer.applyEvent({
    eventId: "note-updated-1",
    type: "NoteUpdated",
    payload: {
      noteId: "note-1",
      ownerId: "owner-1",
      visibility: "PRIVATE",
      status: "PUBLISHED",
      publishedAt: "2026-11-01T10:00:00.000Z",
    },
  });
  assert.equal(eligible.has("note-1"), false);

  await consumer.applyEvent({ eventId: "note-deleted-1", type: "NoteDeleted", payload: { noteId: "note-1" } });
  assert.deepEqual(deleted.likes, ["note-1", "note-1"]);
  assert.deepEqual(deleted.comments, ["note-1"]);
  assert.deepEqual(deleted.ratings, ["note-1", "note-1"]);
  assert.deepEqual(deleted.bookmarks, ["note-1"]);
});

test("engagement events recalculate popularity idempotently and privacy events remove it", async () => {
  const eligible = new Map();
  const processed = new Set();
  const likes = [];
  const ratings = [];
  const transaction = {
    socialProcessedEvent: {
      async create({ data }) {
        if (processed.has(data.eventId)) {
          const error = new Error("duplicate event");
          error.code = "P2002";
          throw error;
        }
        processed.add(data.eventId);
      },
    },
    eligibleNote: {
      async upsert({ where, create, update }) {
        eligible.set(where.noteId, { ...(eligible.get(where.noteId) || create), ...update });
      },
      async deleteMany({ where }) { eligible.delete(where.noteId); },
    },
    like: {
      async upsert({ create }) {
        if (!likes.some((item) => item.userId === create.userId && item.noteId === create.noteId)) likes.push(create);
      },
      async deleteMany({ where }) {
        for (let index = likes.length - 1; index >= 0; index -= 1) {
          if (likes[index].noteId === where.noteId && (!where.userId || likes[index].userId === where.userId)) likes.splice(index, 1);
        }
      },
    },
    rating: {
      async upsert({ where, create, update }) {
        const existing = ratings.find((item) => item.userId === where.userId_noteId.userId && item.noteId === where.userId_noteId.noteId);
        if (existing) Object.assign(existing, update);
        else ratings.push(create);
      },
      async deleteMany({ where }) {
        for (let index = ratings.length - 1; index >= 0; index -= 1) {
          if (ratings[index].noteId === where.noteId) ratings.splice(index, 1);
        }
      },
    },
    comment: { async deleteMany() {} },
    bookmark: { async deleteMany() {} },
  };
  const consumer = createNoteEventConsumer({
    prisma: { async $transaction(callback) { return callback(transaction); } },
  });
  const basePayload = {
    noteId: "note-1",
    ownerId: "owner-1",
    actorId: "actor-1",
    visibility: "PUBLIC",
    status: "PUBLISHED",
    publishedAt: "2026-11-01T10:00:00.000Z",
  };
  const event = (eventId, type, totals = {}) => ({
    eventId,
    type,
    payload: {
      ...basePayload,
      likeCount: 1,
      ratingCount: 0,
      ratingAverage: 0,
      ratingTotal: 0,
      ...totals,
    },
  });
  await consumer.applyEvent(event("like-1", "NoteLiked"));
  await consumer.applyEvent(event("like-1", "NoteLiked"));
  assert.equal(eligible.get("note-1").popularityScore, 1);
  assert.equal(likes.length, 1);

  await consumer.applyEvent(event("rating-1", "NoteRated", {
    ratingCount: 1, ratingAverage: 4, ratingTotal: 4, value: 4,
  }));
  assert.equal(eligible.get("note-1").popularityScore, 5);
  await consumer.applyEvent(event("rating-update-1", "NoteRatingUpdated", {
    ratingCount: 1, ratingAverage: 2, ratingTotal: 2, value: 2,
  }));
  assert.equal(eligible.get("note-1").popularityScore, 3);
  assert.equal(ratings.length, 1);
  assert.equal(ratings[0].value, 2);

  await consumer.applyEvent({
    eventId: "private-1",
    type: "NoteVisibilityChanged",
    payload: { ...basePayload, visibility: "PRIVATE", likeCount: 1, ratingCount: 1, ratingTotal: 2, ratingAverage: 2 },
  });
  assert.equal(eligible.has("note-1"), false);
  assert.equal(likes.length, 0);
  assert.equal(ratings.length, 0);
});

test("Social Notes consumer validates, retries transient failures, and dead-letters poison events", async () => {
  const exchanges = [];
  const queues = [];
  const bindings = [];
  const publications = [];
  let delivery;
  const channel = {
    async assertExchange(name, type, options) { exchanges.push({ name, type, options }); },
    async assertQueue(name, options) { queues.push({ name, options }); },
    async bindQueue(queue, exchange, routingKey) { bindings.push({ queue, exchange, routingKey }); },
    async prefetch() {},
    async consume(queue, handler) { delivery = handler; },
    publish(exchange, routingKey, content, options) { publications.push({ exchange, routingKey, content, options }); },
    async waitForConfirms() {},
    ack(message) { message.acked = true; },
    nack(message, allUpTo, requeue) { message.nacked = { allUpTo, requeue }; },
    async close() {},
  };
  const connection = new EventEmitter();
  connection.createConfirmChannel = async () => channel;
  connection.close = async () => {};
  let shouldFail = false;
  const consumer = createNoteEventConsumer({
    prisma: { async $transaction() { if (shouldFail) throw new Error("database unavailable"); } },
    connect: async () => connection,
    logger: { error() {} },
  });

  await consumer.start();
  assert.ok(bindings.some((binding) => binding.routingKey === "note.restored"));
  assert.ok(queues.some((queue) => queue.name === "taskflow.social.notes.retry.queue" && queue.options.arguments["x-message-ttl"] > 0));
  assert.ok(queues.some((queue) => queue.name === "taskflow.social.notes.dead"));

  shouldFail = true;
  const retryMessage = {
    content: Buffer.from(JSON.stringify({ eventId: "retry-1", type: "NotePublished", payload: { noteId: "n1", ownerId: "u1", visibility: "PUBLIC", status: "PUBLISHED", publishedAt: "2026-11-01T10:00:00Z" } })),
    properties: { headers: {} },
  };
  await delivery(retryMessage);
  assert.equal(retryMessage.acked, true);
  assert.equal(publications[0].exchange, "taskflow.social.notes.retry");
  assert.equal(publications[0].routingKey, "social.notes.retry");

  const invalidMessage = { content: Buffer.from("not-json"), properties: { headers: {} } };
  await delivery(invalidMessage);
  assert.equal(invalidMessage.acked, true);
  assert.equal(publications[1].exchange, "taskflow.social.notes.dlx");
  await consumer.stop();
});

test("Social publisher routes durable engagement events", async () => {
  const sent = [];
  const connection = new EventEmitter();
  const channel = {
    async assertExchange(name, type, options) {
      assert.equal(name, "taskflow.events");
      assert.equal(type, "topic");
      assert.equal(options.durable, true);
    },
    publish(exchange, routingKey, body, options) {
      sent.push({ exchange, routingKey, envelope: JSON.parse(body.toString()), options });
    },
    async waitForConfirms() {},
    async close() {},
  };
  connection.createConfirmChannel = async () => channel;
  connection.close = async () => {};

  const publisher = createSocialEventPublisher({ connect: async () => connection });
  await publisher.publish({
    id: "event-1",
    eventType: "NoteLiked",
    createdAt: "2026-11-01T10:00:00.000Z",
    payload: { noteId: "note-1", ownerId: "owner-1", actorId: "user-1" },
  });
  assert.equal(sent[0].routingKey, "social.note.liked");
  assert.equal(sent[0].options.persistent, true);
  assert.equal(sent[0].envelope.eventId, "event-1");
  await publisher.close();
});

test("Social outbox retries failed publishes and marks confirmed events", async () => {
  const event = { id: "event-2", eventType: "CommentCreated", publishedAt: null, attempts: 0 };
  const prisma = {
    socialEventOutbox: {
      async findMany() { return event.publishedAt ? [] : [{ ...event }]; },
      async update({ data }) {
        if (data.publishedAt) event.publishedAt = data.publishedAt;
        if (data.attempts) event.attempts += data.attempts.increment;
      },
    },
  };
  let fails = true;
  const worker = createSocialOutboxWorker({
    prisma,
    publisher: { async publish() { if (fails) throw new Error("offline"); } },
    logger: { error() {} },
  });

  await worker.flush();
  assert.equal(event.attempts, 1);
  assert.equal(event.publishedAt, null);
  fails = false;
  await worker.flush();
  assert.ok(event.publishedAt instanceof Date);
});
