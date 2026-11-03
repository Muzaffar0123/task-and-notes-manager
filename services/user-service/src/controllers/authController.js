const bcrypt = require("bcrypt");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

function makeUsername(name) {
  const prefix = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 19) || "member";
  return `${prefix}_${crypto.randomBytes(5).toString("hex")}`;
}

// Register a new user
async function register(req, res) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields must be strings",
      });
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (
      !normalizedName ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid name and email",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.$transaction(async (transaction) => {
      const createdUser = await transaction.user.create({
        data: {
          name: normalizedName,
          username: makeUsername(normalizedName),
          email: normalizedEmail,
          passwordHash,
        },
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });

      await transaction.userEventOutbox.create({
        data: {
          eventType: "UserRegistered",
          userId: createdUser.id,
          payload: {
            userId: createdUser.id,
            name: createdUser.name,
            email: createdUser.email,
          },
        },
      });
      return createdUser;
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      user,
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "An account with this email or username already exists",
      });
    }

    console.error("Registration error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

// Login an existing user
async function login(req, res) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { email, password } = body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid email and password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if ((user.status || "ACTIVE") !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: "This account is not active",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing");

      return res.status(500).json({
        success: false,
        message: "Server configuration error",
      });
    }

    const token = jwt.sign(
      { sub: user.id, ver: user.tokenVersion ?? 0, role: user.role || "USER" },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "1h",
        issuer: "taskflow-user-service",
      }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role || "USER",
        hasProfileImage: Boolean(user.profileImageContentType),
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

async function logout(req, res) {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { tokenVersion: { increment: 1 } },
    });

    return res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired access token",
      });
    }

    console.error("Logout error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not log out",
    });
  }
}

// Get the authenticated user's profile
async function getProfile(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        username: true,
        bio: true,
        email: true,
        role: true,
        followersVisibility: true,
        followingVisibility: true,
        profileImageContentType: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        bio: user.bio,
        email: user.email,
        role: user.role,
        followersVisibility: user.followersVisibility,
        followingVisibility: user.followingVisibility,
        hasProfileImage: Boolean(user.profileImageContentType),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error("Profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

async function getPublicProfile(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: {
        id: true,
        name: true,
        username: true,
        bio: true,
        profileImageContentType: true,
        followersVisibility: true,
        followingVisibility: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        bio: user.bio,
        hasProfileImage: Boolean(user.profileImageContentType),
        followersVisibility: user.followersVisibility,
        followingVisibility: user.followingVisibility,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Public profile lookup error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

async function getPublicProfileByUsername(req, res) {
  try {
    const username = req.params.username.toLowerCase();
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        name: true,
        username: true,
        bio: true,
        profileImageContentType: true,
        followersVisibility: true,
        followingVisibility: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        bio: user.bio,
        hasProfileImage: Boolean(user.profileImageContentType),
        followersVisibility: user.followersVisibility,
        followingVisibility: user.followingVisibility,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Public profile lookup error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
}
// Update the authenticated user's profile
async function updateProfile(req, res) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};

    if (Object.prototype.hasOwnProperty.call(body, "role")) {
      return res.status(403).json({
        success: false,
        message: "Role changes require administrator provisioning",
      });
    }

    const { name, email, username, bio } = body;

    if (typeof name !== "string" || typeof email !== "string") {
      return res.status(400).json({
        success: false,
        message: "Name and email are required",
      });
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedName) {
      return res.status(400).json({
        success: false,
        message: "Name cannot be empty",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    const data = { name: normalizedName, email: normalizedEmail };
    if (username !== undefined) {
      if (typeof username !== "string" || !/^[a-zA-Z0-9_]{3,30}$/.test(username.trim())) {
        return res.status(400).json({
          success: false,
          message: "Username must be 3 to 30 letters, numbers, or underscores",
        });
      }
      data.username = username.trim().toLowerCase();
      const existingUsername = await prisma.user.findUnique({ where: { username: data.username } });
      if (existingUsername && existingUsername.id !== req.user.id) {
        return res.status(409).json({ success: false, message: "This username is already in use" });
      }
    }
    if (bio !== undefined) {
      if (typeof bio !== "string" || bio.length > 500) {
        return res.status(400).json({ success: false, message: "Bio must be at most 500 characters" });
      }
      data.bio = bio.trim();
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser && existingUser.id !== req.user.id) {
      return res.status(409).json({
        success: false,
        message: "This email address is already in use",
      });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: {
        id: true,
        name: true,
        username: true,
        bio: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "This email address or username is already in use",
      });
    }

    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.error("Update profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

module.exports = {
  register,
  login,
  logout,
  getProfile,
  getPublicProfile,
  getPublicProfileByUsername,
  updateProfile,
};
