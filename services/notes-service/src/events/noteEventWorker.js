function createNoteEventWorker({ prisma, publisher, logger = console, pollIntervalMs = 5000 }) {
  let timer;
  let flushing = false;

  async function flushOutbox() {
    if (flushing) return;
    flushing = true;

    try {
      const events = await prisma.noteEventOutbox.findMany({
        where: { publishedAt: null },
        orderBy: { createdAt: "asc" },
        take: 100,
      });

      for (const event of events) {
        try {
          await publisher.publish(event);
          await prisma.noteEventOutbox.update({
            where: { id: event.id },
            data: { publishedAt: new Date() },
          });
        } catch (error) {
          logger.error(`Note event publish failed (${event.id}):`, error.message);
          await prisma.noteEventOutbox.update({
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
    void flushOutbox().catch((error) => logger.error("Notes event worker failed:", error.message));
    timer = setInterval(() => {
      void flushOutbox().catch((error) => logger.error("Notes event worker failed:", error.message));
    }, pollIntervalMs);
    timer.unref?.();
  }

  async function stop() {
    clearInterval(timer);
    timer = null;
    while (flushing) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return { start, stop, flushOutbox };
}

module.exports = { createNoteEventWorker };