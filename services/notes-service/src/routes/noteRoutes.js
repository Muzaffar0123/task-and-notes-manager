const express = require("express");
const { authenticateToken } = require("../middleware/authMiddleware");
const { upload } = require("../middleware/uploadMiddleware");
const controller = require("../controllers/noteController");
const engagementController = require("../controllers/engagementController");
const fileController = require("../controllers/fileController");

const router = express.Router();

router.use(authenticateToken);
router.post("/", controller.createNote);
router.get("/mine", controller.getMyNotes);
router.get("/search", controller.searchPublicNotes);
router.get("/", controller.searchPublicNotes);
router.post("/:noteId/reports", controller.reportPublicNote);
router.get("/:id/likes", engagementController.getLikes);
router.post("/:id/likes", engagementController.likeNote);
router.delete("/:id/likes", engagementController.unlikeNote);
router.get("/:id/ratings", engagementController.getRatings);
router.put("/:id/ratings", engagementController.rateNote);
router.get("/:id/engagement", engagementController.getEngagement);
router.post("/:noteId/files", upload.single("file"), fileController.uploadNoteFile);
router.get("/:noteId/files/:fileId/download", fileController.downloadNoteFile);
router.delete("/:noteId/files/:fileId", fileController.deleteNoteFile);
router.get("/:id/statistics", controller.getNoteStatistics);
router.post("/:id/publish", controller.publishNote);
router.get("/:id", controller.getNoteById);
router.patch("/:id", controller.updateNote);
router.delete("/:id", controller.deleteNote);

module.exports = router;