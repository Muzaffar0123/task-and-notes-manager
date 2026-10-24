const prisma = require("../config/prisma");

const allowedStatuses = ["PENDING", "IN_PROGRESS", "COMPLETED"];
const allowedPriorities = ["LOW", "MEDIUM", "HIGH"];

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

    const task = await prisma.task.create({
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
    const tasks = await prisma.task.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      count: tasks.length,
      data: tasks,
    });
  } catch (error) {
    console.error("Get tasks error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve tasks",
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

    const result = await prisma.task.updateMany({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
      data,
    });

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    const task = await prisma.task.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

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
  getTaskById,
  updateTask,
  deleteTask,
};