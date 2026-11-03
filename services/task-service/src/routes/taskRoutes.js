const express = require("express");

const {
  createTask,
  getTasks,
  getTaskStatistics,
  getTaskById,
  updateTask,
  deleteTask,
} = require("../controllers/taskController");

const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authenticateToken);

router.post("/", createTask);
router.get("/statistics", getTaskStatistics);
router.get("/", getTasks);
router.get("/:id", getTaskById);
router.patch("/:id", updateTask);
router.delete("/:id", deleteTask);

module.exports = router;