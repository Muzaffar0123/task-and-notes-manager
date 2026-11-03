const express = require("express");
const { authenticateToken, requireAdmin } = require("../middleware/authMiddleware");
const controller = require("../controllers/adminController");

const router = express.Router();

router.use(authenticateToken, requireAdmin);
router.get("/public", controller.listPublicNotes);
router.get("/reports", controller.listReports);
router.patch("/reports/:reportId", controller.updateReportStatus);
router.post("/:noteId/restrict", controller.restrictPublicNote);
router.post("/:noteId/restore", controller.restorePublicNote);

module.exports = router;