const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const { createNotificationEventConsumer } = require("../src/events/notificationEventConsumer");

function makeBroker() {
  const exchanges = [];
  const queues = [];
  const bindings = [];
  const publications = [];
  let delivery;
  const channel = {
    async assertExchange(name, type, options) { exchanges.push({ name, type, options }); },
    async assertQueue(name, options) { queues.push({ name, options }); },
    async bindQueue(queue, exchange, routingKey) { bindings.push({ queue, exchange, routingKey }); },
    async prefetch(value) { assert.ok(value > 0); },
    async consume(queue, handler) { delivery = { queue, handler }; },
    publish(exchange, routingKey, content, options) {
      publications.push({ exchange, routingKey, content, options });
    },
    async waitForConfirms() {},
    ack(message) { message.acked = true; },
    nack(message, allUpTo, requeue) { message.nacked = { allUpTo, requeue }; },
    async close() {},
  };
  const connection = new EventEmitter();
  connection.createConfirmChannel = async () => channel;
  connection.close = async () => {};
  return {
    exchanges,
    queues,
    bindings,
    publications,
    channel,
    connection,
    getDelivery: () => delivery,
  };
}

test("consumer declares durable event, retry, and dead-letter queues", async () => {
  const broker = makeBroker();
  const consumer = createNotificationEventConsumer({
    connect: async () => broker.connection,
    processor: { async processEvent() {} },
    database: { processedEvent: { async updateMany() {} } },
    logger: { error() {} },
  });

  assert.equal(consumer.isReady(), false);
  await consumer.start();
  assert.equal(consumer.isReady(), true);
  assert.equal(broker.exchanges.every((exchange) => exchange.options.durable), true);
  assert.equal(broker.queues.length, 3);
  assert.equal(broker.queues.every((queue) => queue.options.durable), true);
  assert.ok(broker.bindings.some((binding) => binding.routingKey === "task.created"));
  assert.ok(broker.bindings.some((binding) => binding.routingKey === "note.published"));
  assert.ok(broker.bindings.some((binding) => binding.routingKey === "note.restored"));
  assert.ok(broker.bindings.some((binding) => binding.routingKey === "note.liked"));
  assert.ok(broker.bindings.some((binding) => binding.routingKey === "note.rated"));
  assert.ok(broker.bindings.some((binding) => binding.routingKey === "social.follow.created"));
  await consumer.stop();
  assert.equal(consumer.isReady(), false);
});

test("consumer acknowledges successful processing and dead-letters after retry limit", async () => {
  const broker = makeBroker();
  let processingFails = false;
  let deadLettered = 0;
  const consumer = createNotificationEventConsumer({
    connect: async () => broker.connection,
    maxRetries: 0,
    processor: {
      async processEvent() {
        if (processingFails) throw new Error("permanent failure");
      },
    },
    database: {
      processedEvent: {
        async updateMany() { deadLettered += 1; },
      },
    },
    logger: { error() {} },
  });
  await consumer.start();
  const delivery = broker.getDelivery();

  const successfulMessage = {
    content: Buffer.from(JSON.stringify({ eventId: "ok", type: "TaskCreated", payload: { id: "task-1", userId: "user-1" } })),
    properties: { headers: {} },
  };
  await delivery.handler(successfulMessage);
  assert.equal(successfulMessage.acked, true);

  processingFails = true;
  const failedMessage = {
    content: Buffer.from(JSON.stringify({ eventId: "bad", type: "TaskCreated", payload: { id: "task-2", userId: "user-1" } })),
    properties: { headers: {} },
  };
  await delivery.handler(failedMessage);
  assert.equal(broker.publications.length, 1);
  assert.equal(broker.publications[0].routingKey, "notification.dead");
  assert.equal(failedMessage.acked, true);
  assert.equal(deadLettered, 1);

  const invalidMessage = {
    content: Buffer.from(JSON.stringify({ eventId: "invalid", type: "TaskCreated", payload: {} })),
    properties: { headers: {} },
  };
  await delivery.handler(invalidMessage);
  assert.equal(broker.publications.length, 2, "invalid payload should be rejected into DLQ immediately");
  assert.equal(invalidMessage.acked, true);
  await consumer.stop();
});
