const prisma = require("../config/prisma");
const AppError = require("../utils/appError");

async function requestNotes(req, method, suffix, body) {
  const serviceUrl = process.env.NOTES_SERVICE_URL;
  if (!serviceUrl) throw new AppError(503, "Notes Service is not configured");
  let response;
  try {
    response = await fetch(
      `${serviceUrl}/api/notes/${encodeURIComponent(req.params.noteId)}/${suffix}`,
      {
        method,
        headers: {
          Authorization: req.headers.authorization,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(5000),
      }
    );
  } catch {
    throw new AppError(503, "Notes Service is unavailable");
  }
  const result = await response.json();
  if (!response.ok) {
    const status = [400, 401, 403, 404, 409].includes(response.status) ? response.status : 503;
    throw new AppError(status, result.message || "Notes Service could not process engagement");
  }
  return result;
}

async function getLikes(req, res) {
  const result = await requestNotes(req, "GET", "likes");
  return res.status(200).json(result);
}

async function likeNote(req, res) {
  const result = await requestNotes(req, "POST", "likes");
  return res.status(201).json(result);
}

async function unlikeNote(req, res) {
  const result = await requestNotes(req, "DELETE", "likes");
  return res.status(200).json(result);
}

async function getRatings(req, res) {
  const result = await requestNotes(req, "GET", "ratings");
  return res.status(200).json(result);
}

async function rateNote(req, res) {
  const result = await requestNotes(req, "PUT", "ratings", req.body);
  return res.status(200).json(result);
}

async function getEngagement(req, res) {
  const result = await requestNotes(req, "GET", "engagement");
  const commentCount = await prisma.comment.count({
    where: { noteId: req.params.noteId, deletedAt: null },
  });
  return res.status(200).json({
    ...result,
    data: { ...result.data, commentCount },
  });
}

module.exports = { getLikes, likeNote, unlikeNote, getRatings, rateNote, getEngagement };
