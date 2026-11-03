function serializePayload(payload) {
  return JSON.parse(JSON.stringify(payload));
}

function createTaskEventWorker({
  prisma,
  publisher,
  logger = console,
  pollIntervalMs = 5000,
  reminderIntervalMs = 60000,
  reminderWindowHours = 24,
}) {
  let outboxTimer;
  let reminderTimer;
  let flushing = false;
  let schedulingReminders = false;

  async function flushOutbox() {
    if (flushing) return;
    flushing = true;

    try {
      const events = await prisma.taskEventOutbox.findMany({
        where: { publishedAt: null },
        orderBy: { createdAt: "asc" },
        take: 100,
      });

      for (const event of events) {
        try {
          await publisher.publish(event);
          await prisma.taskEventOutbox.update({
            where: { id: event.id },
            data: { publishedAt: new Date() },
          });
        } catch (error) {
          logger.error(`Task event publish failed (${event.id}):`, error.message);
          await prisma.taskEventOutbox.update({
            where: { id: event.id },
            data: { attempts: { increment: 1 } },
          });
        }
      }
    } finally {
      flushing = false;
    }
  }

  async function scheduleDeadlineReminders() {
    if (schedulingReminders) return;
    schedulingReminders = true;

    try {
      const now = new Date();
      const reminderUntil = new Date(now.getTime() + reminderWindowHours * 60 * 60 * 1000);
      const dueTasks = await prisma.task.findMany({
        where: {
          status: { not: "COMPLETED" },
          dueDate: { gte: now, lte: reminderUntil },
          deadlineReminderSentAt: null,
        },
        select: {
          id: true,
          userId: true,
          title: true,
          dueDate: true,
        },
      });

      for (const task of dueTasks) {
        await prisma.$transaction(async (transaction) => {
          const claim = await transaction.task.updateMany({
            where: {
              id: task.id,
              userId: task.userId,
              status: { not: "COMPLETED" },
              dueDate: task.dueDate,
              deadlineReminderSentAt: null,
            },
            data: { deadlineReminderSentAt: now },
          });

          if (claim.count === 0) return;

          await transaction.taskEventOutbox.create({
            data: {
              eventType: "TaskDeadlineReminder",
              taskId: task.id,
              userId: task.userId,
              payload: serializePayload({
                taskId: task.id,
                userId: task.userId,
                title: task.title,
                dueDate: task.dueDate,
              }),
            },
          });
        });
      }
    } finally {
      schedulingReminders = false;
    }
  }

  function start() {
    if (outboxTimer || reminderTimer) return;

    void flushOutbox().catch((error) => logger.error("Task event worker failed:", error.message));
    void scheduleDeadlineReminders().catch((error) => logger.error("Deadline reminder scheduler failed:", error.message));

    outboxTimer = setInterval(() => {
      void flushOutbox().catch((error) => logger.error("Task event worker failed:", error.message));
    }, pollIntervalMs);
    reminderTimer = setInterval(() => {
      void scheduleDeadlineReminders().catch((error) => logger.error("Deadline reminder scheduler failed:", error.message));
    }, reminderIntervalMs);
    outboxTimer.unref?.();
    reminderTimer.unref?.();
  }

  async function stop() {
    clearInterval(outboxTimer);
    clearInterval(reminderTimer);
    outboxTimer = null;
    reminderTimer = null;
    while (flushing || schedulingReminders) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  return { start, stop, flushOutbox, scheduleDeadlineReminders };
}

module.exports = { createTaskEventWorker };