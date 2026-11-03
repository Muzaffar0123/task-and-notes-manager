const express = require("express");

const {
  register,
  login,
  logout,
  getProfile,
  getPublicProfile,
  getPublicProfileByUsername,
  updateProfile,
} = require("../controllers/authController");

const authenticateToken = require("../middleware/authMiddleware");
const requireAdmin = require("../middleware/requireAdmin");
const adminUserRoutes = require("./adminUserRoutes");
const { uploadProfileImage, getProfileImage, getPublicProfileImage, deleteProfileImage } = require("../controllers/profileImageController");
const { getPrivacySettings, updatePrivacySettings } = require("../controllers/privacyController");
const { discoverUsers } = require("../controllers/discoveryController");
const { receiveProfileImage } = require("../middleware/profileImageUpload");

const router = express.Router();

// Public routes
router.post("/register", register);
router.post("/login", login);
router.get("/auth/session", authenticateToken, (req, res) => {
  res.status(200).json({ success: true, user: req.user });
});
router.post("/profile/image", authenticateToken, receiveProfileImage, uploadProfileImage);
router.get("/profile/image", authenticateToken, getProfileImage);
router.delete("/profile/image", authenticateToken, deleteProfileImage);
router.get("/public-profile/username/:username", authenticateToken, getPublicProfileByUsername);
router.get("/discover", authenticateToken, discoverUsers);
router.get("/:userId/public-profile/image", authenticateToken, getPublicProfileImage);
router.get("/profile/privacy", authenticateToken, getPrivacySettings);
router.put("/profile/privacy", authenticateToken, updatePrivacySettings);

// Admin routes live in User Service so the Dashboard never reads its database directly.
router.use("/admin", authenticateToken, requireAdmin, adminUserRoutes);

// Protected route
router.post("/logout", authenticateToken, logout);
router.get("/:userId/public-profile", authenticateToken, getPublicProfile);
router.get("/profile", authenticateToken, getProfile);
router.put("/profile", authenticateToken, updateProfile);

module.exports = router;
