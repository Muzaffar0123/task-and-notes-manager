const AppError = require("../utils/appError");

async function getEligiblePublicNote(noteId, authorization) {
  const serviceUrl = process.env.NOTES_SERVICE_URL;
  if (!serviceUrl) throw new AppError(503, "Notes Service is not configured");

  let response;
  try {
    response = await fetch(`${serviceUrl}/api/notes/${encodeURIComponent(noteId)}`, {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    throw new AppError(503, "Notes Service is unavailable");
  }

  if (response.status === 404) return null;
  if (response.status === 401) throw new AppError(401, "Authentication is no longer valid");
  if (!response.ok) throw new AppError(503, "Notes Service could not verify the note");

  const result = await response.json();
  const note = result.data;
  if (!note || note.visibility !== "PUBLIC" || note.status !== "PUBLISHED") return null;
  return note;
}

module.exports = { getEligiblePublicNote };