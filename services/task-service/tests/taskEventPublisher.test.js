const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const { createTaskEventPublisher } = require("../src/events/taskEventPublisher");

test("publisher emits a persistent task event with its routing key and envelope", async () => {
  const published = [];
  const connection = new EventEmitter();
  let closedChannel = false;
  let closedConnection = false;

  const channel = {
    async assertExchange(name, type, options) {
      assert.equal(name, "taskflow.events");
      assert.equal(type, "topic");
      assert.equal(options.durable, true);
    },
    publish(exchange, routingKey, body, options) {
      published.push({
        exchange,
        routingKey,
        body: JSON.parse(body.toString()),
        options,
      });
    },
    async waitForConfirms() {},
    async close() {
      closedChannel = true;
    },
  };

  connection.createConfirmChannel = async () => channel;
  connection.close = async () => {
    closedConnection = true;
  };

  const publisher = createTaskEventPublisher({
    connect: async () => connection,
    logger: { warn() {} },
  });

  await publisher.publish({
    id: "event-1",
    eventType: "TaskCompleted",
    createdAt: "2026-11-01T10:00:00.000Z",
    payload: { taskId: "task-1", userId: "user-1" },
  });

  assert.equal(published.length, 1);
  assert.equal(published[0].exchange, "taskflow.events");
  assert.equal(published[0].routingKey, "task.completed");
  assert.equal(published[0].options.persistent, true);
  assert.deepEqual(published[0].body, {
    eventId: "event-1",
    type: "TaskCompleted",
    occurredAt: "2026-11-01T10:00:00.000Z",
    payload: { taskId: "task-1", userId: "user-1" },
  });

  await publisher.close();
  assert.equal(closedChannel, true);
  assert.equal(closedConnection, true);
});

test("publisher rejects unknown task event types", async () => {
  const publisher = createTaskEventPublisher({ connect: async () => { throw new Error("should not connect"); } });

  await assert.rejects(
    publisher.publish({ eventType: "UnknownEvent" }),
    /Unsupported task event/
  );
});