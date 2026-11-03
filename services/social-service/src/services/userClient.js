const AppError = require("../utils/appError");

async function getPublicProfile(userId, authorization) {
  const serviceUrl = process.env.USER_SERVICE_URL;
  if (!serviceUrl) throw new AppError(503, "User Service is not configured");

  let response;
  try {
    response = await fetch(
      `${serviceUrl}/api/users/${encodeURIComponent(userId)}/public-profile`,
      { headers: { Authorization: authorization }, signal: AbortSignal.timeout(3000) }
    );
  } catch {
    throw new AppError(503, "User Service is unavailable");
  }

  if (response.status === 404) return null;
  if (response.status === 401) throw new AppError(401, "Authentication is no longer valid");
  if (!response.ok) throw new AppError(503, "User Service could not verify the user");

  const result = await response.json();
  return result.user || null;
}

async function getPublicProfileByUsername(username, authorization) {
  const serviceUrl = process.env.USER_SERVICE_URL;
  if (!serviceUrl) throw new AppError(503, "User Service is not configured");

  let response;
  try {
    response = await fetch(
      `${serviceUrl}/api/users/public-profile/username/${encodeURIComponent(username)}`,
      { headers: { Authorization: authorization }, signal: AbortSignal.timeout(3000) }
    );
  } catch {
    throw new AppError(503, "User Service is unavailable");
  }

  if (response.status === 404) return null;
  if (response.status === 401) throw new AppError(401, "Authentication is no longer valid");
  if (!response.ok) throw new AppError(503, "User Service could not verify the user");

  const result = await response.json();
  return result.user || null;
}

async function discoverUsers({ search, page, pageSize, authorization }) {
  const serviceUrl = process.env.USER_SERVICE_URL;
  if (!serviceUrl) throw new AppError(503, "User Service is not configured");

  let response;
  try {
    const url = new URL(`${serviceUrl}/api/users/discover`);
    if (search) url.searchParams.set("search", search);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(pageSize));
    response = await fetch(url, {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    throw new AppError(503, "User Service is unavailable");
  }

  if (response.status === 401) throw new AppError(401, "Authentication is no longer valid");
  if (response.status === 400) throw new AppError(400, "Invalid user discovery request");
  if (!response.ok) throw new AppError(503, "User Service could not discover users");
  return response.json();
}

module.exports = { getPublicProfile, getPublicProfileByUsername, discoverUsers };