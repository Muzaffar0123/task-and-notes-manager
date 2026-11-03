const prisma = require("../config/prisma");

const permittedUserFields = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};
const statuses = new Set(["ACTIVE", "DEACTIVATED", "FROZEN"]);

function parseInteger(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed > 0 && parsed <= maximum ? parsed : null;
}

async function listUsers(req, res) {
  const page = parseInteger(req.query.page, 1, 1000000);
  const pageSize = parseInteger(req.query.pageSize, 20, 100);
  const { search = "" } = req.query;

  if (!page || !pageSize) {
    return res.status(400).json({ success: false, message: "Page and pageSize must be positive integers within the supported range" });
  }
  if (typeof search !== "string" || search.length > 200) {
    return res.status(400).json({ success: false, message: "Search must be 200 characters or fewer" });
  }

  const normalizedSearch = search.trim();
  const where = normalizedSearch
    ? { OR: [
      { name: { contains: normalizedSearch, mode: "insensitive" } },
      { email: { contains: normalizedSearch, mode: "insensitive" } },
    ] }
    : {};

  try {
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: permittedUserFields,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      data: users,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error("Admin user list failed:", error);
    return res.status(500).json({ success: false, message: "Could not retrieve users" });
  }
}

async function getUser(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: permittedUserFields,
    });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    return res.status(200).json({ success: true, data: user });
  } catch (error) {
    console.error("Admin user lookup failed:", error);
    return res.status(500).json({ success: false, message: "Could not retrieve user" });
  }
}

async function setUserStatus(req, res) {
  const { status, reason } = req.body || {};
  const suppliedKeys = Object.keys(req.body || {});
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "role")) {
    return res.status(403).json({ success: false, message: "Administrator APIs cannot change user roles" });
  }
  if (suppliedKeys.some((key) => !["status", "reason"].includes(key))) {
    return res.status(400).json({ success: false, message: "Only status and reason may be supplied" });
  }
  if (!statuses.has(status)) {
    return res.status(400).json({ success: false, message: "Status must be ACTIVE, DEACTIVATED, or FROZEN" });
  }
  if (reason !== undefined && (typeof reason !== "string" || reason.length > 500)) {
    return res.status(400).json({ success: false, message: "Reason must be 500 characters or fewer" });
  }
  if (req.params.userId === req.user.id && status !== "ACTIVE") {
    return res.status(403).json({ success: false, message: "Administrators cannot deactivate or freeze their own account" });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const current = await transaction.user.findUnique({
        where: { id: req.params.userId },
        select: { id: true, status: true },
      });
      if (!current) return null;

      if (current.status !== status) {
        const updated = await transaction.user.update({
          where: { id: current.id },
          data: { status, tokenVersion: { increment: 1 } },
          select: permittedUserFields,
        });
        await transaction.adminAuditLog.create({
          data: {
            adminId: req.user.id,
            action: "USER_STATUS_CHANGED",
            targetUserId: current.id,
            details: {
              from: current.status,
              to: status,
              ...(reason?.trim() ? { reason: reason.trim() } : {}),
            },
          },
        });
        return updated;
      }

      return transaction.user.findUnique({ where: { id: current.id }, select: permittedUserFields });
    });

    if (!result) return res.status(404).json({ success: false, message: "User not found" });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("Admin user status update failed:", error);
    return res.status(500).json({ success: false, message: "Could not update user status" });
  }
}

module.exports = { listUsers, getUser, setUserStatus };
