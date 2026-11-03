function createSocialOutboxWorker({ prisma, publisher, logger = console, pollIntervalMs = 5000 }) {
  let timer;
  let flushing = false;

  async function flush() {
    if (flushing) return;
    flushing = true;
    try {
      const events = await prisma.socialEventOutbox.findMany({
        where: { publishedAt: null },
        orderBy: { createdAt: "asc" },
        take: 100,
      });
      for (const event of events) {
        try {
          await publisher.publish(event);
          await prisma.socialEventOutbox.update({
            where: { id: event.id },
            data: { publishedAt: new Date() },
          });
        } catch (error) {
          logger.error(`Social event publish failed (${event.id}):`, error.message);
          await prisma.socialEventOutbox.update({
            where: { id: event.id },
            data: { attempts: { increment: 1 } },
          });
        }
      }
    } finally {
      flushing = false;
    }
  }

  function start() {
    if (timer) return;
    void flush().catch((error) => logger.error("Social outbox worker failed:", error.message));
    timer = setInterval(() => {
      void flush().catch((error) => logger.error("Social outbox worker failed:", error.message));
    }, pollIntervalMs);
    timer.unref?.();
  }

  async function stop() {
    clearInterval(timer);
    timer = null;
    while (flushing) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return { start, stop, flush };
}

module.exports = { createSocialOutboxWorker };