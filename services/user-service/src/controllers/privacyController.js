const prisma = require("../config/prisma");

const visibilityOptions = new Set(["EVERYONE", "FOLLOWERS_ONLY", "ONLY_ME"]);

async function getPrivacySettings(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { followersVisibility: true, followingVisibility: true },
    });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    return res.status(200).json({ success: true, settings: user });
  } catch (error) {
    console.error("Privacy settings lookup failed:", error);
    return res.status(500).json({ success: false, message: "Could not load privacy settings" });
  }
}

async function updatePrivacySettings(req, res) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const keys = Object.keys(body);
  if (
    keys.length === 0 ||
    keys.some((key) => !["followersVisibility", "followingVisibility"].includes(key)) ||
    keys.some((key) => !visibilityOptions.has(body[key]))
  ) {
    return res.status(400).json({
      success: false,
      message: "Provide follower and/or following visibility as EVERYONE, FOLLOWERS_ONLY, or ONLY_ME",
    });
  }

  try {
    const settings = await prisma.user.update({
      where: { id: req.user.id },
      data: body,
      select: { followersVisibility: true, followingVisibility: true },
    });
    return res.status(200).json({ success: true, settings });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    console.error("Privacy settings update failed:", error);
    return res.status(500).json({ success: false, message: "Could not update privacy settings" });
  }
}

module.exports = { getPrivacySettings, updatePrivacySettings };
