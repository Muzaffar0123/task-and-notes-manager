const prisma = require("../config/prisma");

const allowedStatuses = ["PENDING", "IN_PROGRESS", "COMPLETED"];
const allowedPriorities = ["LOW", "MEDIUM", "HIGH"];
const allowedSortFields = [
  "createdAt",
  "updatedAt",
  "dueDate",
  "title",
  "status",
  "priority",
];

function serializeEventPayload(payload) {
  return JSON.parse(JSON.stringify(payload));
}

async function enqueueTaskEvent(transaction, eventType, task) {
  await transaction.taskEventOutbox.create({
    data: {
      eventType,
      taskId: task.id,
      userId: task.userId,
      payload: serializeEventPayload(task),
    },
  });
}

function parsePositiveInteger(value, defaultValue, maximum) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;

  const parsedValue = Number(value);
  if (parsedValue < 1 || parsedValue > maximum) return null;

  return parsedValue || defaultValue;
}

function parseDate(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

// CREATE TASK
async function createTask(req, res) {
  try {
    const { title, description, priority, dueDate } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Task title is required",
      });
    }

    if (
      priority !== undefined &&
      !allowedPriorities.includes(priority)
    ) {
      return res.status(400).json({
        success: false,
        message: "Priority must be LOW, MEDIUM, or HIGH",
      });
    }

    let parsedDueDate;

    if (dueDate !== undefined && dueDate !== null && dueDate !== "") {
      parsedDueDate = new Date(dueDate);

      if (Number.isNaN(parsedDueDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid due date",
        });
      }
    }

    const task = await prisma.$transaction(async (transaction) => {
      const createdTask = await transaction.task.create({
        data: {
          title: title.trim(),
          description:
            typeof description === "string" && description.trim()
              ? description.trim()
              : null,
          priority: priority || "MEDIUM",
          dueDate: parsedDueDate,
          userId: req.user.id,
        },
      });

      await enqueueTaskEvent(transaction, "TaskCreated", createdTask);
      return createdTask;
    });

    // Send a notification without failing task creation if notifications are unavailable.
    try {
      const notificationUrl = process.env.NOTIFICATION_SERVICE_URL;

      if (notificationUrl) {
        const response = await fetch(`${notificationUrl}/api/notifications`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(req.headers.authorization
              ? { Authorization: req.headers.authorization }
              : {}),
          },
          body: JSON.stringify({
            userId: req.user.id,
            taskId: task.id,
            title: "Task created",
            message: `Your task "${task.title}" was created successfully.`,
          }),
          signal: AbortSignal.timeout(3000),
        });

        if (!response.ok) {
          console.error(
            "Notification request failed:",
            response.status,
            await response.text()
          );
        } else {
          console.log("Task creation notification sent:", task.id);
        }
      }
    } catch (notificationError) {
      console.error("Notification Service unavailable:", notificationError.message);
    }

    return res.status(201).json({ success: true, data: task });
  } catch (error) {
    console.error("Create task error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not create task",
    });
  }
}

// GET ALL TASKS FOR LOGGED-IN USER
async function getTasks(req, res) {
  try {
    const {
      search,
      status,
      priority,
      dueDateFrom,
      dueDateTo,
      sortBy = "createdAt",
      sortOrder = "desc",
      page: pageValue,
      pageSize: pageSizeValue,
    } = req.query;

    if (search !== undefined && typeof search !== "string") {
      return res.status(400).json({ success: false, message: "Search must be a string" });
    }

    if (typeof search === "string" && search.length > 200) {
      return res.status(400).json({ success: false, message: "Search must be 200 characters or fewer" });
    }

    if (status !== undefined && !allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid task status" });
    }

    if (priority !== undefined && !allowedPriorities.includes(priority)) {
      return res.status(400).json({ success: false, message: "Invalid task priority" });
    }

    if (!allowedSortFields.includes(sortBy)) {
      return res.status(400).json({ success: false, message: "Invalid sort field" });
    }

    if (!["asc", "desc"].includes(sortOrder)) {
      return res.status(400).json({ success: false, message: "Sort order must be asc or desc" });
    }

    const parsedDueDateFrom = dueDateFrom === undefined ? undefined : parseDate(dueDateFrom);
    const parsedDueDateTo = dueDateTo === undefined ? undefined : parseDate(dueDateTo);

    if (
      (dueDateFrom !== undefined && !parsedDueDateFrom) ||
      (dueDateTo !== undefined && !parsedDueDateTo)
    ) {
      return res.status(400).json({ success: false, message: "Invalid due date filter" });
    }

    if (parsedDueDateFrom && parsedDueDateTo && parsedDueDateFrom > parsedDueDateTo) {
      return res.status(400).json({ success: false, message: "Due date range is invalid" });
    }

    const where = { userId: req.user.id };

    if (typeof search === "string" && search.trim()) {
      where.OR = [
        { title: { contains: search.trim(), mode: "insensitive" } },
        { description: { contains: search.trim(), mode: "insensitive" } },
      ];
    }
    if (status !== undefined) where.status = status;
    if (priority !== undefined) where.priority = priority;
    if (parsedDueDateFrom || parsedDueDateTo) {
      where.dueDate = {
        ...(parsedDueDateFrom ? { gte: parsedDueDateFrom } : {}),
        ...(parsedDueDateTo ? { lte: parsedDueDateTo } : {}),
      };
    }

    const paginated = pageValue !== undefined || pageSizeValue !== undefined;
    const page = paginated ? parsePositiveInteger(pageValue ?? "1", 1, 1000000) : undefined;
    const pageSize = paginated ? parsePositiveInteger(pageSizeValue ?? "20", 20, 100) : undefined;

    if (paginated && (!page || !pageSize)) {
      return res.status(400).json({
        success: false,
        message: "Page must be positive and pageSize must be between 1 and 100",
      });
    }

    const findManyOptions = {
      where,
      orderBy: { [sortBy]: sortOrder },
      ...(paginated ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
    };

    const [tasks, total] = await Promise.all([
      prisma.task.findMany(findManyOptions),
      paginated ? prisma.task.count({ where }) : Promise.resolve(null),
    ]);

    return res.status(200).json({
      success: true,
      count: paginated ? total : tasks.length,
      data: tasks,
      ...(paginated ? { pagination: { page, pageSize, total } } : {}),
    });
  } catch (error) {
    console.error("Get tasks error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve tasks",
    });
  }
}

async function getTaskStatistics(req, res) {
  try {
    const userFilter = { userId: req.user.id };
    const now = new Date();
    const [total, pending, inProgress, completed, overdue] = await Promise.all([
      prisma.task.count({ where: userFilter }),
      prisma.task.count({ where: { ...userFilter, status: "PENDING" } }),
      prisma.task.count({ where: { ...userFilter, status: "IN_PROGRESS" } }),
      prisma.task.count({ where: { ...userFilter, status: "COMPLETED" } }),
      prisma.task.count({
        where: {
          ...userFilter,
          status: { not: "COMPLETED" },
          dueDate: { lt: now },
        },
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: { total, pending, inProgress, completed, overdue },
    });
  } catch (error) {
    console.error("Get task statistics error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve task statistics",
    });
  }
}

// GET ONE TASK
async function getTaskById(req, res) {
  try {
    const task = await prisma.task.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    return res.status(200).json({ success: true, data: task });
  } catch (error) {
    console.error("Get task error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve task",
    });
  }
}

// UPDATE TASK
async function updateTask(req, res) {
  try {
    const { title, description, status, priority, dueDate } = req.body;
    const data = {};

    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({
          success: false,
          message: "Title must be a non-empty string",
        });
      }

      data.title = title.trim();
    }

    if (description !== undefined) {
      if (
        description !== null &&
        typeof description !== "string"
      ) {
        return res.status(400).json({
          success: false,
          message: "Description must be a string or null",
        });
      }

      data.description =
        typeof description === "string" && description.trim()
          ? description.trim()
          : null;
    }

    if (status !== undefined) {
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid task status",
        });
      }

      data.status = status;
    }

    if (priority !== undefined) {
      if (!allowedPriorities.includes(priority)) {
        return res.status(400).json({
          success: false,
          message: "Invalid task priority",
        });
      }

      data.priority = priority;
    }

    if (dueDate !== undefined) {
      if (dueDate === null || dueDate === "") {
        data.dueDate = null;
      } else {
        const parsedDueDate = new Date(dueDate);

        if (Number.isNaN(parsedDueDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid due date",
          });
        }

        data.dueDate = parsedDueDate;
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one valid field to update",
      });
    }

    if (dueDate !== undefined) data.deadlineReminderSentAt = null;

    const task = await prisma.$transaction(async (transaction) => {
      const existingTask = await transaction.task.findFirst({
        where: { id: req.params.id, userId: req.user.id },
      });

      if (!existingTask) return null;

      const result = await transaction.task.updateMany({
        where: {
          id: req.params.id,
          userId: req.user.id,
        },
        data,
      });

      if (result.count === 0) return null;

      const updatedTask = await transaction.task.findFirst({
        where: { id: req.params.id, userId: req.user.id },
      });

      await enqueueTaskEvent(transaction, "TaskUpdated", updatedTask);

      if (existingTask.status !== "COMPLETED" && updatedTask.status === "COMPLETED") {
        await enqueueTaskEvent(transaction, "TaskCompleted", updatedTask);
      }

      return updatedTask;
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    return res.status(200).json({ success: true, data: task });
  } catch (error) {
    console.error("Update task error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not update task",
    });
  }
}

// DELETE TASK
async function deleteTask(req, res) {
  try {
    const result = await prisma.task.deleteMany({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    console.error("Delete task error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not delete task",
    });
  }
}

module.exports = {
  createTask,
  getTasks,
  getTaskStatistics,
  getTaskById,
  updateTask,
  deleteTask,
};