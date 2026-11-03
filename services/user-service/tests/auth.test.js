const assert = require("node:assert/strict");
const Module = require("node:module");
const { test } = require("node:test");
const bcrypt = require("bcrypt");
const express = require("express");
const jwt = require("jsonwebtoken");
const requireAdmin = require("../src/middleware/requireAdmin");

process.env.JWT_SECRET = "taskflow-auth-test-secret";

let storedUser;
let registeredEvents = [];
const profileObjects = new Map();
let discoveryUsers = [];

function projectUser(user, select) {
  if (!select) return { ...user };

  return Object.fromEntries(
    Object.keys(select)
      .filter((key) => select[key])
      .map((key) => [key, user[key]])
  );
}

const prismaStub = {
  user: {
    async findUnique({ where, select }) {
      if (
        !storedUser ||
        (where.id && where.id !== storedUser.id) ||
        (where.email && where.email !== storedUser.email) ||
        (where.username && where.username !== storedUser.username)
      ) {
        return null;
      }

      return projectUser(storedUser, select);
    },
    async findMany({ where, select, skip = 0, take }) {
      let users = discoveryUsers.filter((user) =>
        user.id !== where.id?.not &&
        user.status === where.status &&
        (!where.OR || where.OR.some((condition) => {
          const [field, filter] = Object.entries(condition)[0];
          return user[field].toLowerCase().includes(filter.contains.toLowerCase());
        }))
      );
      users = users.slice(skip, skip + take);
      return users.map((user) => projectUser(user, select));
    },
    async count({ where }) {
      return discoveryUsers.filter((user) =>
        user.id !== where.id?.not &&
        user.status === where.status &&
        (!where.OR || where.OR.some((condition) => {
          const [field, filter] = Object.entries(condition)[0];
          return user[field].toLowerCase().includes(filter.contains.toLowerCase());
        }))
      ).length;
    },
    async create({ data, select }) {
      storedUser = {
        id: "user-1",
        role: "USER",
        bio: "",
        followersVisibility: "EVERYONE",
        followingVisibility: "EVERYONE",
        ...data,
        tokenVersion: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return projectUser(storedUser, select);
    },
    async update({ where, data, select }) {
      if (!storedUser || where.id !== storedUser.id) {
        const error = new Error("Record not found");
        error.code = "P2025";
        throw error;
      }

      if (data.tokenVersion?.increment) storedUser.tokenVersion += data.tokenVersion.increment;
      else Object.assign(storedUser, data);
      return projectUser(storedUser, select);
    },
  },
  userEventOutbox: {
    async create({ data }) {
      registeredEvents.push(data);
      return { id: "user-event-1", ...data };
    },
  },
};
prismaStub.$transaction = (callback) => callback(prismaStub);

const prismaPath = require.resolve("../src/config/prisma");
const prismaModule = new Module(prismaPath);
prismaModule.filename = prismaPath;
prismaModule.loaded = true;
prismaModule.exports = prismaStub;
require.cache[prismaPath] = prismaModule;

const storagePath = require.resolve("../src/services/objectStorage");
const storageModule = new Module(storagePath);
storageModule.filename = storagePath;
storageModule.loaded = true;
storageModule.exports = {
  async putObject(key, body, contentType) { profileObjects.set(key, { body: Buffer.from(body), contentType }); },
  async getObject(key) { const object = profileObjects.get(key); if (!object) throw new Error("Missing"); return { Body: object.body }; },
  async deleteObject(key) { profileObjects.delete(key); },
};
require.cache[storagePath] = storageModule;

const authenticateToken = require("../src/middleware/authMiddleware");
const userRoutes = require("../src/routes/userRoutes");

test("registration and login work, and logout invalidates current and legacy tokens", async (context) => {
  storedUser = null;
  discoveryUsers = [];
  registeredEvents = [];
  const app = express();
  app.use(express.json());
  app.use("/api/users", userRoutes);

  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));

  const baseUrl = `http://127.0.0.1:${server.address().port}/api/users`;
  const registerResponse = await fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test User",
      email: "test@example.com",
      password: "secure-password",
      role: "ADMIN",
    }),
  });
  const registered = await registerResponse.json();

  assert.equal(registerResponse.status, 201);
  assert.match(registered.user.username, /^[a-z0-9_]{3,30}$/);
  assert.equal(registered.user.role, "USER");
  assert.equal(storedUser.role, "USER");
  assert.equal("passwordHash" in registered.user, false);
  assert.equal(await bcrypt.compare("secure-password", storedUser.passwordHash), true);
  assert.equal(registeredEvents.length, 1);
  assert.equal(registeredEvents[0].eventType, "UserRegistered");
  assert.equal(registeredEvents[0].payload.email, "test@example.com");
  assert.equal("passwordHash" in registeredEvents[0].payload, false);

  const loginResponse = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "test@example.com",
      password: "secure-password",
    }),
  });
  const login = await loginResponse.json();

  assert.equal(loginResponse.status, 200);
  assert.equal("passwordHash" in login.user, false);
  assert.equal(login.user.role, "USER");
  assert.equal(jwt.verify(login.token, process.env.JWT_SECRET).role, "USER");
  assert.equal(login.user.username, registered.user.username);

  discoveryUsers = [
    { id: "user-2", name: "Riley Author", username: "riley_notes", bio: "Writing notes", profileImageContentType: "image/png", status: "ACTIVE", createdAt: new Date("2026-01-02") },
    { id: "user-3", name: "Sam Author", username: "sam_tasks", bio: "", profileImageContentType: null, status: "ACTIVE", createdAt: new Date("2026-01-01") },
    { id: "user-4", name: "Frozen Person", username: "frozen_user", status: "FROZEN", createdAt: new Date() },
  ];
  const userDiscovery = await fetch(`${baseUrl}/discover?search=RILEY&page=1&pageSize=1`, {
    headers: { Authorization: `Bearer ${login.token}` },
  });
  const discoveredUsers = await userDiscovery.json();
  assert.equal(userDiscovery.status, 200);
  assert.equal(discoveredUsers.pagination.total, 1);
  assert.equal(discoveredUsers.data.length, 1);
  assert.deepEqual(Object.keys(discoveredUsers.data[0]).sort(), [
    "bio", "createdAt", "hasProfileImage", "id", "name", "username",
  ]);
  assert.equal(discoveredUsers.data[0].username, "riley_notes");
  const secondDiscoveryPage = await fetch(`${baseUrl}/discover?page=2&pageSize=1`, {
    headers: { Authorization: `Bearer ${login.token}` },
  });
  const secondDiscoveryResult = await secondDiscoveryPage.json();
  assert.equal(secondDiscoveryResult.pagination.total, 2);
  assert.equal(secondDiscoveryResult.data[0].username, "sam_tasks");
  assert.equal((await fetch(`${baseUrl}/discover?page=0`, {
    headers: { Authorization: `Bearer ${login.token}` },
  })).status, 400);

  const anonymousPrivacyUpdate = await fetch(`${baseUrl}/profile/privacy`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ followersVisibility: "ONLY_ME" }),
  });
  assert.equal(anonymousPrivacyUpdate.status, 401);

  const profileUpdate = await fetch(`${baseUrl}/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` },
    body: JSON.stringify({
      name: "Test User",
      email: "test@example.com",
      username: "test_user_public",
      bio: "A public profile bio",
    }),
  });
  assert.equal(profileUpdate.status, 200);
  assert.equal((await profileUpdate.json()).user.username, "test_user_public");

  const privacyUpdate = await fetch(`${baseUrl}/profile/privacy`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` },
    body: JSON.stringify({ followersVisibility: "ONLY_ME", followingVisibility: "FOLLOWERS_ONLY" }),
  });
  assert.equal(privacyUpdate.status, 200);
  assert.deepEqual((await privacyUpdate.json()).settings, {
    followersVisibility: "ONLY_ME",
    followingVisibility: "FOLLOWERS_ONLY",
  });
  const privacyRead = await fetch(`${baseUrl}/profile/privacy`, {
    headers: { Authorization: `Bearer ${login.token}` },
  });
  assert.deepEqual((await privacyRead.json()).settings, {
    followersVisibility: "ONLY_ME",
    followingVisibility: "FOLLOWERS_ONLY",
  });
  const invalidPrivacyUpdate = await fetch(`${baseUrl}/profile/privacy`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` },
    body: JSON.stringify({ followersVisibility: "INVALID", userId: "another-user" }),
  });
  assert.equal(invalidPrivacyUpdate.status, 400);

  const appAdminCheck = express();
  appAdminCheck.get("/admin-check", authenticateToken, requireAdmin, (_req, res) => res.sendStatus(200));
  const adminCheckServer = appAdminCheck.listen(0);
  context.after(() => new Promise((resolve) => adminCheckServer.close(resolve)));
  await new Promise((resolve) => adminCheckServer.once("listening", resolve));
  const adminCheckUrl = `http://127.0.0.1:${adminCheckServer.address().port}/admin-check`;
  const unauthenticatedAdminResponse = await fetch(adminCheckUrl);
  assert.equal(unauthenticatedAdminResponse.status, 401);
  const userAdminResponse = await fetch(adminCheckUrl, {
    headers: { Authorization: `Bearer ${login.token}` },
  });
  assert.equal(userAdminResponse.status, 403);

  const roleChangeResponse = await fetch(`${baseUrl}/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` },
    body: JSON.stringify({ name: "Test User", email: "test@example.com", role: "ADMIN" }),
  });
  assert.equal(roleChangeResponse.status, 403);

  storedUser.role = "ADMIN"; // Represents the trusted provisioning process in this isolated test.
  const adminLoginResponse = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "test@example.com", password: "secure-password" }),
  });
  const adminLogin = await adminLoginResponse.json();
  assert.equal(adminLoginResponse.status, 200);
  assert.equal(adminLogin.user.role, "ADMIN");
  assert.equal(jwt.verify(adminLogin.token, process.env.JWT_SECRET).role, "ADMIN");
  const adminResponse = await fetch(adminCheckUrl, {
    headers: { Authorization: `Bearer ${adminLogin.token}` },
  });
  assert.equal(adminResponse.status, 200);

  const publicProfileResponse = await fetch(
    `${baseUrl}/${storedUser.id}/public-profile`,
    { headers: { Authorization: `Bearer ${login.token}` } }
  );
  const publicProfile = await publicProfileResponse.json();
  assert.equal(publicProfileResponse.status, 200);
  assert.equal(publicProfile.user.id, storedUser.id);
  assert.equal(publicProfile.user.username, "test_user_public");
  assert.equal(publicProfile.user.bio, "A public profile bio");
  assert.equal(publicProfile.user.followersVisibility, "ONLY_ME");
  assert.equal("email" in publicProfile.user, false);
  assert.equal("passwordHash" in publicProfile.user, false);
  assert.equal("role" in publicProfile.user, false);
  assert.equal("tokenVersion" in publicProfile.user, false);
  assert.equal("profileImageKey" in publicProfile.user, false);
  assert.equal("profileImageContentType" in publicProfile.user, false);

  const usernameProfileResponse = await fetch(
    `${baseUrl}/public-profile/username/test_user_public`,
    { headers: { Authorization: `Bearer ${login.token}` } }
  );
  assert.equal(usernameProfileResponse.status, 200);
  assert.equal((await usernameProfileResponse.json()).user.id, storedUser.id);

  const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const unauthenticatedImage = new FormData();
  unauthenticatedImage.append("file", new Blob([imageBytes]), "profile.png");
  assert.equal((await fetch(`${baseUrl}/profile/image`, { method: "POST", body: unauthenticatedImage })).status, 401);

  const invalidImage = new FormData();
  invalidImage.append("file", new Blob(["MZ" + "x".repeat(64)]), "payload.exe");
  assert.equal((await fetch(`${baseUrl}/profile/image`, {
    method: "POST", headers: { Authorization: `Bearer ${login.token}` }, body: invalidImage,
  })).status, 415);

  const oversizedImage = new FormData();
  oversizedImage.append("file", new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)]), "large.png");
  assert.equal((await fetch(`${baseUrl}/profile/image`, {
    method: "POST", headers: { Authorization: `Bearer ${login.token}` }, body: oversizedImage,
  })).status, 413);

  const uploadImage = new FormData();
  uploadImage.append("file", new Blob([imageBytes]), "profile.png");
  const imageResponse = await fetch(`${baseUrl}/profile/image`, {
    method: "POST", headers: { Authorization: `Bearer ${login.token}` }, body: uploadImage,
  });
  assert.equal(imageResponse.status, 201);
  const publicImageResponse = await fetch(
    `${baseUrl}/${storedUser.id}/public-profile/image`,
    { headers: { Authorization: `Bearer ${login.token}` } }
  );
  assert.equal(publicImageResponse.status, 200);
  assert.equal(publicImageResponse.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await publicImageResponse.arrayBuffer()), imageBytes);
  const imageKey = storedUser.profileImageKey;
  assert.match(imageKey, /^profiles\/user-1\/[0-9a-f-]+\.png$/i);
  assert.equal(profileObjects.size, 1);

  const ownImage = await fetch(`${baseUrl}/profile/image`, { headers: { Authorization: `Bearer ${login.token}` } });
  assert.equal(ownImage.status, 200);
  assert.equal(ownImage.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(Buffer.from(await ownImage.arrayBuffer()), imageBytes);
  assert.equal((await fetch(`${baseUrl}/profile/image`)).status, 401);

  const profileResponse = await fetch(`${baseUrl}/profile`, { headers: { Authorization: `Bearer ${login.token}` } });
  const profile = await profileResponse.json();
  assert.equal(profile.user.hasProfileImage, true);
  assert.equal("profileImageKey" in profile.user, false);
  assert.equal("profileImageContentType" in profile.user, false);

  const deleteImage = await fetch(`${baseUrl}/profile/image`, { method: "DELETE", headers: { Authorization: `Bearer ${login.token}` } });
  assert.equal(deleteImage.status, 200);
  assert.equal(profileObjects.size, 0);
  assert.equal(storedUser.profileImageKey, null);

  const missingProfileResponse = await fetch(
    `${baseUrl}/missing-user/public-profile`,
    { headers: { Authorization: `Bearer ${login.token}` } }
  );
  assert.equal(missingProfileResponse.status, 404);

  const legacyToken = jwt.sign(
    { sub: storedUser.id },
    process.env.JWT_SECRET,
    { issuer: "taskflow-user-service" }
  );

  for (const token of [login.token, legacyToken]) {
    const profileResponse = await fetch(`${baseUrl}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(profileResponse.status, 200);
  }

  const logoutResponse = await fetch(`${baseUrl}/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.token}` },
  });

  assert.equal(logoutResponse.status, 200);

  for (const token of [login.token, legacyToken]) {
    const profileResponse = await fetch(`${baseUrl}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(profileResponse.status, 401);
  }
});
