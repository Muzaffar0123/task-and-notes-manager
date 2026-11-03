const prisma = require("../config/prisma");

function parsePage(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (
    !Number.isInteger(page) || page < 1 || page > 1000000 ||
    !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50
  ) {
    return null;
  }
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

async function discoverUsers(req, res) {
  const pagination = parsePage(req.query);
  if (!pagination) {
    return res.status(400).json({
      success: false,
      message: "Page must be positive and pageSize must be between 1 and 50",
    });
  }

  const searchValue = req.query.search === undefined ? "" : req.query.search;
  if (typeof searchValue !== "string" || searchValue.length > 80) {
    return res.status(400).json({ success: false, message: "Search must be at most 80 characters" });
  }
  const search = searchValue.trim();
  const where = {
    status: "ACTIVE",
    id: { not: req.user.id },
    ...(search ? {
      OR: [
        { username: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  };

  try {
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          username: true,
          bio: true,
          profileImageContentType: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      prisma.user.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      data: users.map((user) => ({
        id: user.id,
        name: user.name,
        username: user.username,
        bio: user.bio,
        hasProfileImage: Boolean(user.profileImageContentType),
        createdAt: user.createdAt,
      })),
      pagination: { page: pagination.page, pageSize: pagination.pageSize, total },
    });
  } catch (error) {
    console.error("User discovery failed:", error);
    return res.status(500).json({ success: false, message: "Could not discover users" });
  }
}

module.exports = { discoverUsers };
