const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const { createNoteEventPublisher } = require("../src/events/noteEventPublisher");
const { createNoteEventWorker } = require("../src/events/noteEventWorker");

test("publisher routes safe note events through durable persistent messages", async () => {
  const published = [];
  const connection = new EventEmitter();
  const channel = {
    async assertExchange(name, type, options) {
      assert.equal(name, "taskflow.events");
      assert.equal(type, "topic");
      assert.equal(options.durable, true);
    },
    publish(exchange, routingKey, body, options) {
      published.push({ exchange, routingKey, envelope: JSON.parse(body.toString()), options });
    },
    async waitForConfirms() {},
    async close() {},
  };
  connection.createConfirmChannel = async () => channel;
  connection.close = async () => {};

  const publisher = createNoteEventPublisher({ connect: async () => connection });
  const eventTypes = [
    ["NotePublished", "note.published"],
    ["NoteUpdated", "note.updated"],
    ["NoteRestricted", "note.restricted"],
    ["NoteDeleted", "note.deleted"],
    ["NoteVisibilityChanged", "note.visibility_changed"],
    ["NoteLiked", "note.liked"],
    ["NoteUnliked", "note.unliked"],
    ["NoteRated", "note.rated"],
    ["NoteRatingUpdated", "note.rating_updated"],
  ];

  for (const [eventType] of eventTypes) {
    await publisher.publish({
      id: `id-${eventType}`,
      eventType,
      createdAt: "2026-11-01T10:00:00.000Z",
      payload: {
        noteId: "note-1",
        ownerId: "owner-1",
        visibility: "PUBLIC",
        status: "PUBLISHED",
        publishedAt: "2026-11-01T10:00:00.000Z",
      },
    });
  }

  assert.deepEqual(published.map((event) => [event.envelope.type, event.routingKey]), eventTypes);
  assert.equal(published.every((event) => event.options.persistent), true);
  assert.equal(published.every((event) => !("title" in event.envelope.payload)), true);
  assert.equal(published.every((event) => !("description" in event.envelope.payload)), true);
  await publisher.close();
});

test("outbox worker marks confirmed events and tracks failed attempts", async () => {
  const event = {
    id: "event-1",
    eventType: "NotePublished",
    payload: { noteId: "note-1", visibility: "PUBLIC" },
    createdAt: new Date(),
    publishedAt: null,
    attempts: 0,
  };
  const prisma = {
    noteEventOutbox: {
      async findMany() {
        return event.publishedAt ? [] : [{ ...event }];
      },
      async update({ data }) {
        if (data.publishedAt) event.publishedAt = data.publishedAt;
        if (data.attempts) event.attempts += data.attempts.increment;
        return { ...event };
      },
    },
  };
  let shouldFail = true;
  const delivered = [];
  const worker = createNoteEventWorker({
    prisma,
    publisher: {
      async publish(message) {
        if (shouldFail) throw new Error("broker unavailable");
        delivered.push(message);
      },
    },
    logger: { error() {} },
  });

  await worker.flushOutbox();
  assert.equal(event.attempts, 1);
  assert.equal(event.publishedAt, null);

  shouldFail = false;
  await worker.flushOutbox();
  assert.equal(delivered.length, 1);
  assert.ok(event.publishedAt instanceof Date);
});