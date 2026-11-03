const assert = require("node:assert/strict");
const Module = require("node:module");
const { test } = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "social-service-test-secret";

const state = {
  follows: [],
  eligibleNotes: [],
  likes: [],
  comments: [],
  ratings: [],
  bookmarks: [],
  collections: [],
  collectionItems: [],
  events: [],
  noteAvailability: new Map(),
};
let idSequence = 1;
let failSocialEventOutboxInsert = false;
let profileVisibility = {};

function resetState() {
  for (const list of Object.values(state)) list.length = 0;
  idSequence = 1;
  failSocialEventOutboxInsert = false;
  profileVisibility = {};
}

function matches(record, where = {}) {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return condition.some((item) => matches(record, item));
    if (key === "AND") return condition.every((item) => matches(record, item));
    if (key === "userId_noteId" || key === "followerId_followeeId") return matches(record, condition);
    if (key === "collection" && condition?.is) {
      const collection = state.collections.find((item) => item.id === record.collectionId);
      return collection ? matches(collection, condition.is) : false;
    }
    const value = record[key];
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("in" in condition) return condition.in.includes(value);
      if ("not" in condition) return value !== condition.not;
      if ("gt" in condition) return value > condition.gt;
      return true;
    }
    return value === condition;
  });
}

function duplicateError() {
  const error = new Error("Unique constraint failed");
  error.code = "P2002";
  return error;
}

function makeRecord(data) {
  return { id: `row-${idSequence++}`, createdAt: new Date(), updatedAt: new Date(), ...data };
}

function makeModel(name, list) {
  return {
    async create({ data }) {
      if (name === "follows" && list.some((item) =>
        item.followerId === data.followerId && item.followeeId === data.followeeId)) {
        throw duplicateError();
      }
      if (["likes", "ratings", "bookmarks"].includes(name) &&
        list.some((item) => item.userId === data.userId && item.noteId === data.noteId)) {
        throw duplicateError();
      }
      const record = makeRecord(name === "comments" ? { deletedAt: null, ...data } : data);
      list.push(record);
      return structuredClone(record);
    },
    async findUnique({ where }) {
      const record = list.find((item) => matches(item, where));
      return record ? structuredClone(record) : null;
    },
    async findFirst({ where }) {
      const record = list.find((item) => matches(item, where));
      return record ? structuredClone(record) : null;
    },
    async findMany({ where, orderBy, skip = 0, take, select, include }) {
      let records = list.filter((item) => matches(item, where));
      if (orderBy) {
        const orderings = Array.isArray(orderBy) ? orderBy : [orderBy];
        records = [...records].sort((left, right) => {
          for (const ordering of orderings) {
            const [field, direction] = Object.entries(ordering)[0];
            const result = left[field] < right[field] ? -1 : left[field] > right[field] ? 1 : 0;
            if (result) return direction === "asc" ? result : -result;
          }
          return 0;
        });
      }
      records = records.slice(skip, take === undefined ? undefined : skip + take);
      return records.map((record) => {
        const result = structuredClone(record);
        if (include?.bookmark) result.bookmark = structuredClone(state.bookmarks.find((item) => item.id === record.bookmarkId));
        if (select?.replies) {
          result.replies = state.comments
            .filter((comment) => comment.parentId === record.id && comment.deletedAt === null)
            .map((comment) => structuredClone(comment));
        }
        return result;
      });
    },
    async count({ where } = {}) {
      return list.filter((item) => matches(item, where)).length;
    },
    async deleteMany({ where }) {
      const before = list.length;
      const keep = list.filter((item) => !matches(item, where));
      list.splice(0, list.length, ...keep);
      return { count: before - list.length };
    },
    async update({ where, data }) {
      const record = list.find((item) => matches(item, where));
      if (!record) throw new Error("Record not found");
      Object.assign(record, data, { updatedAt: new Date() });
      return structuredClone(record);
    },
    async updateMany({ where, data }) {
      const records = list.filter((item) => matches(item, where));
      records.forEach((item) => Object.assign(item, data, { updatedAt: new Date() }));
      return { count: records.length };
    },
    async upsert({ where, create, update }) {
      let record = list.find((item) => matches(item, where));
      if (record) Object.assign(record, update, { updatedAt: new Date() });
      else {
        record = makeRecord(create);
        list.push(record);
      }
      return structuredClone(record);
    },
    async aggregate({ where }) {
      const records = list.filter((item) => matches(item, where));
      return {
        _avg: { value: records.length ? records.reduce((sum, item) => sum + item.value, 0) / records.length : null },
        _count: { _all: records.length },
      };
    },
    async groupBy({ by, where, _sum, _count, orderBy, skip = 0, take }) {
      const groups = new Map();
      for (const record of list.filter((item) => matches(item, where))) {
        const key = record[by[0]];
        const group = groups.get(key) || { record, count: 0 };
        group.count += 1;
        groups.set(key, group);
      }
      let results = [...groups].map(([key, group]) => ({
        [by[0]]: key,
        ...(_count ? { _count: { _all: group.count } } : {}),
        ...(_sum ? {
          _sum: Object.fromEntries(Object.keys(_sum).map((field) => [
            field,
            list.filter((item) => matches(item, where) && item[by[0]] === key)
              .reduce((sum, item) => sum + (item[field] || 0), 0),
          ])),
        } : {}),
      }));
      if (orderBy) {
        results.sort((left, right) => {
          const direction = orderBy[0]?._sum?.popularityScore || orderBy._sum?.popularityScore || "asc";
          const comparison = (left._sum?.popularityScore || 0) - (right._sum?.popularityScore || 0);
          return direction === "desc" ? -comparison : comparison;
        });
      }
      return results.slice(skip, take === undefined ? undefined : skip + take);
    },
  };
}

const prismaStub = {
  follow: makeModel("follows", state.follows),
  eligibleNote: makeModel("eligibleNotes", state.eligibleNotes),
  like: makeModel("likes", state.likes),
  comment: makeModel("comments", state.comments),
  rating: makeModel("ratings", state.ratings),
  bookmark: makeModel("bookmarks", state.bookmarks),
  collection: makeModel("collections", state.collections),
  collectionItem: makeModel("collectionItems", state.collectionItems),
  socialEventOutbox: {
    async create({ data }) {
      if (failSocialEventOutboxInsert) {
        const error = new Error("Simulated SocialEventOutbox insert failure");
        error.code = "P2011";
        throw error;
      }
      const event = makeRecord(data);
      state.events.push(event);
      return structuredClone(event);
    },
  },
};
prismaStub.$transaction = async (callback) => {
  const snapshot = Object.fromEntries(Object.entries(state)
    .filter(([, value]) => Array.isArray(value))
    .map(([key, value]) => [key, structuredClone(value)]));
  const sequenceBefore = idSequence;
  try {
    return await callback(prismaStub);
  } catch (error) {
    for (const [key, value] of Object.entries(snapshot)) {
      state[key].splice(0, state[key].length, ...value);
    }
    idSequence = sequenceBefore;
    throw error;
  }
};

const prismaPath = require.resolve("../src/config/prisma");
const prismaModule = new Module(prismaPath);
prismaModule.filename = prismaPath;
prismaModule.loaded = true;
prismaModule.exports = prismaStub;
require.cache[prismaPath] = prismaModule;

const notesPath = require.resolve("../src/services/notesClient");
const notesModule = new Module(notesPath);
notesModule.filename = notesPath;
notesModule.loaded = true;
notesModule.exports = {
  async getEligiblePublicNote(noteId) {
      const note = state.noteAvailability.get(noteId);
      return note?.visibility === "PUBLIC" && note.status === "PUBLISHED" ? note : null;
  },
};
require.cache[notesPath] = notesModule;

const userPath = require.resolve("../src/services/userClient");
const userModule = new Module(userPath);
userModule.filename = userPath;
userModule.loaded = true;
function mockPublicProfile(userId) {
  return ["user-1", "user-2", "user-3"].includes(userId)
    ? {
      id: userId,
      name: userId,
      username: userId,
      followersVisibility: "EVERYONE",
      followingVisibility: "EVERYONE",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      ...profileVisibility[userId],
    }
    : null;
}
userModule.exports = {
  async getPublicProfile(userId) {
    return mockPublicProfile(userId);
  },
  async getPublicProfileByUsername(username) {
    return mockPublicProfile(username);
  },
  async discoverUsers({ search, page, pageSize }) {
    let users = ["user-1", "user-2", "user-3"]
      .filter((userId) => userId !== "user-1")
      .map((userId) => ({
        ...mockPublicProfile(userId),
        bio: `Bio for ${userId}`,
        hasProfileImage: false,
      }))
      .filter((user) => !search || user.username.includes(search.toLowerCase()) || user.name.toLowerCase().includes(search.toLowerCase()));
    const total = users.length;
    users = users.slice((page - 1) * pageSize, page * pageSize);
    return {
      data: users,
      pagination: { page, pageSize, total },
    };
  },
};
require.cache[userPath] = userModule;

const { createApp } = require("../src/app");

function makeToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    issuer: "taskflow-user-service",
    expiresIn: "5m",
  });
}

test("Social APIs enforce ownership and reject private/restricted note interactions", async (context) => {
  resetState();
  const publicNote = {
    noteId: "note-public",
    ownerId: "user-2",
    publishedAt: new Date(),
    likeCount: 3,
    ratingCount: 2,
    ratingAverage: 4.5,
  };
  state.eligibleNotes.push(publicNote);
  state.noteAvailability.set("note-public", {
    id: "note-public", ownerId: "user-2", visibility: "PUBLIC", status: "PUBLISHED",
  });

  const app = createApp();
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));

  const baseUrl = `http://127.0.0.1:${server.address().port}/api/social`;
  const internalBaseUrl = baseUrl.replace("/api/social", "/internal/social");
  process.env.INTERNAL_SERVICE_TOKEN = "social-internal-test-token";
  const ownerToken = makeToken("user-1");
  const otherToken = makeToken("user-2");
  const thirdToken = makeToken("user-3");
  const request = (path, token = ownerToken, options = {}) => fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  assert.equal((await request("/users/discover", null)).status, 401);
  assert.equal((await request("/notes/discover", null)).status, 401);
  assert.equal((await request("/follows", ownerToken, {
    method: "POST",
    body: JSON.stringify({ followeeId: "user-1" }),
  })).status, 400);
  assert.equal((await request("/follows", ownerToken, {
    method: "POST",
    body: JSON.stringify({ followeeId: "missing-user" }),
  })).status, 404);
  const followResponse = await request("/follows", ownerToken, {
    method: "POST",
    body: JSON.stringify({ followeeId: "user-2", followerId: "user-3" }),
  });
  assert.equal(followResponse.status, 201);
  assert.equal(state.follows[0].followerId, "user-1");
  assert.equal(state.follows[0].followeeId, "user-2");
  assert.equal(state.events[0].eventType, "FollowCreated");
  assert.equal(state.events[0].noteId, null);
  assert.deepEqual(state.events[0].payload, { followerId: "user-1", followeeId: "user-2" });
  assert.equal((await fetch(`${internalBaseUrl}/users/user-2/followers`)).status, 401);
  const internalFollowers = await fetch(`${internalBaseUrl}/users/user-2/followers`, {
    headers: { "x-internal-service-token": process.env.INTERNAL_SERVICE_TOKEN },
  });
  const followerIds = await internalFollowers.json();
  assert.equal(internalFollowers.status, 200);
  assert.deepEqual(followerIds.userIds, ["user-1"]);
  assert.equal((await fetch(`${internalBaseUrl}/engagement/export?page=1&pageSize=10`)).status, 401);
  const legacyEngagement = await fetch(`${internalBaseUrl}/engagement/export?page=1&pageSize=10`, {
    headers: { "x-internal-service-token": process.env.INTERNAL_SERVICE_TOKEN },
  });
  const legacyEngagementResult = await legacyEngagement.json();
  assert.equal(legacyEngagement.status, 200);
  assert.deepEqual(legacyEngagementResult.data.totals, { likes: 0, ratings: 0 });
  assert.equal((await request("/follows", ownerToken, {
    method: "POST",
    body: JSON.stringify({ followeeId: "user-2" }),
  })).status, 409);
  const following = await (await request("/follows/following?page=1&pageSize=1", ownerToken)).json();
  assert.equal(following.data.length, 1);
  assert.equal(following.data[0].user.id, "user-2");
  assert.equal((await request("/users/user-2/follow-status", ownerToken)).status, 200);
  assert.equal((await (await request("/users/user-2/follow-status", ownerToken)).json()).following, true);
  assert.equal((await request("/users/user-1/follow-status", ownerToken)).status, 200);

  const discovery = await (await request("/users/discover?page=1&pageSize=1", ownerToken)).json();
  assert.equal(discovery.data.length, 1);
  assert.equal(discovery.pagination.total, 2);
  assert.equal(discovery.data[0].following, true);
  assert.equal(discovery.data[0].followerCount, 1);
  assert.equal((await request("/users/discover?page=1&pageSize=51", ownerToken)).status, 400);
  const searchResults = await (await request("/users/discover?search=3", ownerToken)).json();
  assert.deepEqual(searchResults.data.map((user) => user.id), ["user-3"]);

  profileVisibility["user-2"] = {
    followersVisibility: "ONLY_ME",
    followingVisibility: "FOLLOWERS_ONLY",
  };
  const publicProfile = await (await request("/profiles/user-2", ownerToken)).json();
  assert.equal(publicProfile.data.followerCount, 1);
  assert.equal(publicProfile.data.publicNotesCount, 1);
  assert.equal(publicProfile.data.totalLikesReceived, 3);
  assert.equal(publicProfile.data.averageRating, 4.5);
  assert.equal(publicProfile.data.creatorLevel, "New Creator");
  state.eligibleNotes.push(
    {
      noteId: "creator-popular",
      ownerId: "user-2",
      publishedAt: new Date(),
      likeCount: 500,
      commentCount: 0,
      ratingCount: 100,
      ratingAverage: 4,
      ratingTotal: 400,
      popularityScore: 900,
    },
    {
      noteId: "creator-bronze",
      ownerId: "user-3",
      publishedAt: new Date(),
      likeCount: 50,
      commentCount: 0,
      ratingCount: 0,
      ratingAverage: 0,
      ratingTotal: 0,
      popularityScore: 50,
    }
  );
  const creators = await (await request("/creators/popular?page=1&pageSize=1", ownerToken)).json();
  assert.equal(creators.pagination.total, 2);
  assert.equal(creators.data[0].id, "user-2");
  assert.equal(creators.data[0].popularityScore, 900);
  assert.equal(creators.data[0].creatorLevel, "Gold");
  assert.equal(creators.data[0].averageRating, 4);
  assert.equal((await request("/follows/followers?userId=user-2", ownerToken)).status, 403);
  assert.equal((await request("/follows/following?userId=user-2", ownerToken)).status, 200);
  assert.equal((await request("/follows/following?userId=user-2", thirdToken)).status, 403);

  profileVisibility["user-2"].followersVisibility = "FOLLOWERS_ONLY";
  assert.equal((await request("/follows/followers?userId=user-2", ownerToken)).status, 200);
  assert.equal((await request("/follows/followers?userId=user-2", thirdToken)).status, 403);

  process.env.NOTES_SERVICE_URL = "http://notes-discovery.test";
  const originalFetch = global.fetch;
  global.fetch = async (input, options) => {
    const url = new URL(input);
    if (url.hostname === "notes-discovery.test") {
      assert.equal(url.pathname, "/api/notes/search");
      assert.equal(url.searchParams.get("visibility"), "PUBLIC");
      assert.equal(url.searchParams.get("page"), "1");
      assert.equal(url.searchParams.get("pageSize"), "1");
      return new Response(JSON.stringify({
        data: [{
          id: "note-public",
          ownerId: "user-2",
          title: "Public note",
          visibility: "PUBLIC",
          status: "PUBLISHED",
          files: [{ originalFilename: "public.pdf", storageKey: "should-not-leak" }],
        }, {
          id: "note-private",
          ownerId: "user-2",
          title: "Private note",
          visibility: "PRIVATE",
          status: "PUBLISHED",
          files: [{ originalFilename: "private.pdf", storageKey: "private-secret" }],
        }, {
          id: "note-restricted",
          ownerId: "user-2",
          title: "Restricted note",
          visibility: "PUBLIC",
          status: "RESTRICTED",
        }],
        pagination: { page: 1, pageSize: 1, total: 1 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return originalFetch(input, options);
  };
  const publicNotes = await request("/notes/discover?page=1&pageSize=1&sortBy=createdAt", ownerToken);
  global.fetch = originalFetch;
  const publicNotesResponse = await publicNotes.json();
  assert.equal(publicNotes.status, 200);
  assert.equal(publicNotesResponse.data.length, 1);
  assert.equal(publicNotesResponse.data[0].id, "note-public");
  assert.equal("files" in publicNotesResponse.data[0], false);
  assert.equal((await request("/notes/discover?page=0", ownerToken)).status, 400);

  state.eligibleNotes.push(
    { noteId: "note-private", ownerId: "user-2", publishedAt: new Date() },
    { noteId: "note-restricted", ownerId: "user-2", publishedAt: new Date() },
  );
  state.noteAvailability.set("note-private", {
    id: "note-private", ownerId: "user-2", visibility: "PRIVATE", status: "PUBLISHED",
  });
  state.noteAvailability.set("note-restricted", {
    id: "note-restricted", ownerId: "user-2", visibility: "PUBLIC", status: "RESTRICTED",
  });

  const feed = await (await request("/feed", ownerToken)).json();
  assert.deepEqual(feed.data.map((item) => item.note.id), ["note-public"]);
  assert.equal(state.eligibleNotes.some((item) => item.noteId === "note-private"), false);
  const trending = await (await request("/trending", ownerToken)).json();
  assert.deepEqual(trending.data.map((item) => item.note.id), ["note-public"]);

  const socialFetch = global.fetch;
  const previousNotesUrl = process.env.NOTES_SERVICE_URL;
  process.env.NOTES_SERVICE_URL = "http://notes-engagement.test";
  const proxyCalls = [];
  global.fetch = async (input, options) => {
    const url = new URL(input);
    if (url.hostname !== "notes-engagement.test") return socialFetch(input, options);
    proxyCalls.push({ pathname: url.pathname, method: options.method, authorization: options.headers.Authorization });
    if (url.pathname.includes("note-private") || url.pathname.includes("note-restricted")) {
      return new Response(JSON.stringify({ message: "Public note not found" }), { status: 404 });
    }
    if (url.pathname.endsWith("/likes") && options.method === "POST") {
      return new Response(JSON.stringify({ success: true, data: { likeCount: 1 } }), { status: 201 });
    }
    if (url.pathname.endsWith("/likes") && options.method === "DELETE") {
      return new Response(JSON.stringify({ success: true, data: { likeCount: 0 } }), { status: 200 });
    }
    if (url.pathname.endsWith("/likes") && options.method === "GET") {
      return new Response(JSON.stringify({ success: true, data: { count: 1, likedByMe: true } }), { status: 200 });
    }
    if (url.pathname.endsWith("/ratings") && options.method === "PUT") {
      const { value } = JSON.parse(options.body);
      return new Response(JSON.stringify(value === 6
        ? { message: "Rating must be an integer from 1 to 5" }
        : { success: true, data: { ratingCount: 1, ratingAverage: value } }), { status: value === 6 ? 400 : 200 });
    }
    return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
  };

  assert.equal((await request("/notes/note-private/likes", ownerToken, { method: "POST" })).status, 404);
  assert.equal((await request("/notes/note-restricted/comments", ownerToken, {
    method: "POST",
    body: JSON.stringify({ content: "Not allowed" }),
  })).status, 404);
  assert.equal((await request("/notes/note-private/ratings", ownerToken, {
    method: "PUT",
    body: JSON.stringify({ value: 4 }),
  })).status, 404);
  assert.equal((await request("/notes/note-restricted/bookmark", ownerToken, { method: "POST" })).status, 404);
  assert.equal(state.likes.length, 0);
  assert.equal(state.comments.length, 0);
  assert.equal(state.ratings.length, 0);
  assert.equal(state.bookmarks.length, 0);

  assert.equal((await request("/notes/note-public/likes", ownerToken, { method: "POST" })).status, 201);
  assert.equal((await request("/notes/note-public/likes", ownerToken)).status, 200);
  assert.equal((await request("/notes/note-public/likes", ownerToken, { method: "DELETE" })).status, 200);
  assert.equal(proxyCalls[0].pathname, "/api/notes/note-private/likes");
  assert.equal(proxyCalls.find((call) => call.pathname.endsWith("/note-public/likes")).authorization, `Bearer ${ownerToken}`);

  const commentResponse = await request("/notes/note-public/comments", ownerToken, {
    method: "POST",
    body: JSON.stringify({ content: "A root comment", userId: "user-3" }),
  });
  const comment = (await commentResponse.json()).data;
  assert.equal(commentResponse.status, 201);
  assert.equal(comment.userId, "user-1");

  const replyResponse = await request("/notes/note-public/comments", otherToken, {
    method: "POST",
    body: JSON.stringify({ content: "A reply", parentId: comment.id }),
  });
  assert.equal(replyResponse.status, 201);
  const commentsPage = await (await request("/notes/note-public/comments?page=1&pageSize=1", ownerToken)).json();
  assert.equal(commentsPage.data.length, 1);
  assert.equal(commentsPage.data[0].replies.length, 1);
  assert.equal(commentsPage.pagination.total, 1);
  assert.equal((await request(`/notes/note-public/comments/${comment.id}`, otherToken, {
    method: "PATCH",
    body: JSON.stringify({ content: "Tamper" }),
  })).status, 404);
  assert.equal((await request(`/notes/note-public/comments/${comment.id}`, ownerToken, {
    method: "PATCH",
    body: JSON.stringify({ content: "Edited" }),
  })).status, 200);
  assert.equal((await request(`/notes/note-public/comments/${comment.id}`, ownerToken, {
    method: "DELETE",
  })).status, 200);

  assert.equal((await request("/notes/note-public/ratings", ownerToken, {
    method: "PUT",
    body: JSON.stringify({ value: 6 }),
  })).status, 400);
  assert.equal((await request("/notes/note-public/ratings", ownerToken, {
    method: "PUT",
    body: JSON.stringify({ value: 4 }),
  })).status, 200);
  assert.equal((await request("/notes/note-public/ratings", ownerToken, {
    method: "PUT",
    body: JSON.stringify({ value: 5 }),
  })).status, 200);
  assert.equal(state.ratings.length, 0);

  const bookmarkResponse = await request("/notes/note-public/bookmark", ownerToken, { method: "POST" });
  assert.equal(bookmarkResponse.status, 201);
  assert.equal(state.bookmarks[0].userId, "user-1");
  const savedBookmarks = await (await request("/bookmarks", ownerToken)).json();
  assert.equal(savedBookmarks.data.length, 1);
  const collectionResponse = await request("/collections", ownerToken, {
    method: "POST",
    body: JSON.stringify({ name: "Reading list" }),
  });
  const collection = (await collectionResponse.json()).data;
  assert.equal(collectionResponse.status, 201);
  const otherCollections = await (await request("/collections", otherToken)).json();
  assert.equal(otherCollections.data.length, 0);
  assert.equal((await request(`/collections/${collection.id}`, otherToken, {
    method: "PATCH",
    body: JSON.stringify({ name: "Stolen collection" }),
  })).status, 404);
  assert.equal((await request(`/collections/${collection.id}/items`, ownerToken, {
    method: "POST",
    body: JSON.stringify({ bookmarkId: state.bookmarks[0].id }),
  })).status, 201);
  const collectionItems = await (await request(`/collections/${collection.id}/items`, ownerToken)).json();
  assert.equal(collectionItems.data.length, 1);
  assert.equal((await request(`/collections/${collection.id}/items/${state.bookmarks[0].id}`, otherToken, {
    method: "DELETE",
  })).status, 404);
  assert.equal((await request(`/collections/${collection.id}`, ownerToken, {
    method: "PATCH",
    body: JSON.stringify({ name: "Updated list" }),
  })).status, 200);
  assert.equal((await request(`/collections/${collection.id}/items/${state.bookmarks[0].id}`, ownerToken, {
    method: "DELETE",
  })).status, 200);

  assert.deepEqual(
    state.events.map((event) => event.eventType).sort(),
    ["FollowCreated", "CommentCreated", "CommentCreated", "CommentDeleted", "BookmarkCreated"].sort()
  );
  assert.equal(state.events.every((event) => !("content" in event.payload)), true);
  assert.equal(state.likes.length, 0);
  assert.equal(state.ratings.length, 0);
  global.fetch = socialFetch;
  if (previousNotesUrl === undefined) delete process.env.NOTES_SERVICE_URL;
  else process.env.NOTES_SERVICE_URL = previousNotesUrl;

  assert.equal((await request("/follows/user-2", ownerToken, { method: "DELETE" })).status, 200);
  assert.equal(state.follows.length, 0);
  const updatedProfile = await (await request("/profiles/user-2", ownerToken)).json();
  assert.equal(updatedProfile.data.followerCount, 0);
  assert.equal((await (await request("/users/user-2/follow-status", ownerToken)).json()).following, false);
  assert.equal((await request("/follows/user-2", ownerToken, { method: "DELETE" })).status, 404);

  failSocialEventOutboxInsert = true;
  const previousEventCount = state.events.length;
  const failedFollow = await request("/follows", ownerToken, {
    method: "POST",
    body: JSON.stringify({ followeeId: "user-3" }),
  });
  failSocialEventOutboxInsert = false;
  assert.equal(failedFollow.status, 500);
  assert.equal(state.follows.some((follow) => follow.followerId === "user-1" && follow.followeeId === "user-3"), false);
  assert.equal(state.events.length, previousEventCount);
});
