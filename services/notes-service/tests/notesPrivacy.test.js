const assert = require("node:assert/strict");
const Module = require("node:module");
const { test } = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "notes-service-test-secret";

let notes = [];
let outbox = [];
let nextNoteId = 1;
let nextEventId = 1;
let noteFiles = [];
let nextFileId = 1;
let storedObjects = new Map();
let storageReadCount = 0;
let reports = [];
let moderationRecords = [];
let noteLikes = [];
let noteRatings = [];

function copy(value) {
  return structuredClone(value);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeDocx() {
  const entries = [
    ["[Content_Types].xml", "<Types><Override ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>"],
    ["word/document.xml", "<document><body>sample</body></document>"],
  ];
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const filename = Buffer.from(name);
    const data = Buffer.from(content);
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(0, 6);
    header.writeUInt32LE(0, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, data);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(0, 10);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(0, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    offset += header.length + filename.length + data.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}

function matches(note, where) {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return condition.some((item) => matches(note, item));
    if (key === "AND") return condition.every((item) => matches(note, item));
    if (key === "noteId_userId") return matches(note, condition);

    const value = note[key];
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("in" in condition) return condition.in.includes(value);
      if ("contains" in condition) {
        return String(value || "").toLowerCase().includes(condition.contains.toLowerCase());
      }
      if ("equals" in condition) {
        return String(value || "").toLowerCase() === condition.equals.toLowerCase();
      }
      if ("some" in condition) {
        return Array.isArray(value) && value.some((item) => matches(item, condition.some));
      }
      return true;
    }
    return value === condition;
  });
}

const prismaStub = {
  note: {
    async create({ data }) {
      const now = new Date();
      const note = {
        id: `note-${nextNoteId++}`,
        ownerId: data.ownerId,
        title: data.title,
        description: data.description,
        visibility: data.visibility,
        status: "DRAFT",
        publishedAt: null,
        viewCount: 0,
        downloadCount: 0,
        popularityScore: 0,
        createdAt: now,
        updatedAt: now,
        categories: [],
        tags: [],
        files: [],
      };
      notes.push(note);
      return copy(note);
    },
    async findUnique({ where }) {
      const note = notes.find((item) => matches(item, where));
      return note ? copy(note) : null;
    },
    async findFirst({ where }) {
      const note = notes.find((item) => matches(item, where));
      return note ? copy(note) : null;
    },
    async findMany({ where, orderBy, skip = 0, take }) {
      const results = notes.filter((note) => matches(note, where));
      if (orderBy) {
        const [field, direction] = Object.entries(orderBy)[0];
        results.sort((left, right) => {
          const comparison = left[field] < right[field] ? -1 : left[field] > right[field] ? 1 : 0;
          return direction === "asc" ? comparison : -comparison;
        });
      }
      return results.slice(skip, take === undefined ? undefined : skip + take).map(copy);
    },
    async count({ where }) {
      return notes.filter((note) => matches(note, where)).length;
    },
    async update({ where, data }) {
      const note = notes.find((item) => item.id === where.id);
      if (!note) throw new Error("Note not found");
      for (const [field, value] of Object.entries(data)) {
        if (value && typeof value === "object" && "increment" in value) {
          note[field] += value.increment;
        } else if (field !== "categories" && field !== "tags") {
          note[field] = value;
        }
      }
      note.updatedAt = new Date();
      return copy(note);
    },
    async updateMany({ where, data }) {
      const note = notes.find((item) => matches(item, where));
      if (!note) return { count: 0 };
      Object.assign(note, data, { updatedAt: new Date() });
      return { count: 1 };
    },
    async delete({ where }) {
      const index = notes.findIndex((item) => item.id === where.id);
      if (index < 0) throw new Error("Note not found");
      return copy(notes.splice(index, 1)[0]);
    },
  },
  noteEventOutbox: {
    async create({ data }) {
      const event = { id: `event-${nextEventId++}`, createdAt: new Date(), ...data };
      outbox.push(event);
      return copy(event);
    },
  },
  noteLike: {
      async create({ data }) {
        if (noteLikes.some((item) => item.noteId === data.noteId && item.userId === data.userId)) {
          const error = new Error("Unique constraint failed");
          error.code = "P2002";
          throw error;
        }
        const like = { id: `like-${noteLikes.length + 1}`, createdAt: new Date(), ...data };
        noteLikes.push(like);
        return copy(like);
      },
      async count({ where }) {
        return noteLikes.filter((item) => matches(item, where)).length;
      },
      async findUnique({ where }) {
        const result = noteLikes.find((item) => matches(item, where));
        return result ? copy(result) : null;
      },
      async deleteMany({ where }) {
        const keep = noteLikes.filter((item) => !matches(item, where));
        const count = noteLikes.length - keep.length;
        noteLikes = keep;
        return { count };
      },
  },
  noteRating: {
      async create({ data }) {
        if (noteRatings.some((item) => item.noteId === data.noteId && item.userId === data.userId)) {
          const error = new Error("Unique constraint failed");
          error.code = "P2002";
          throw error;
        }
        const now = new Date();
        const rating = { id: `rating-${noteRatings.length + 1}`, createdAt: now, updatedAt: now, ...data };
        noteRatings.push(rating);
        return copy(rating);
      },
      async update({ where, data }) {
        const rating = noteRatings.find((item) => matches(item, where));
        if (!rating) throw new Error("Rating not found");
        Object.assign(rating, data, { updatedAt: new Date() });
        return copy(rating);
      },
      async aggregate({ where }) {
        const rows = noteRatings.filter((item) => matches(item, where));
        const total = rows.reduce((sum, item) => sum + item.value, 0);
        return {
          _avg: { value: rows.length ? total / rows.length : null },
          _sum: { value: rows.length ? total : null },
          _count: { _all: rows.length },
        };
      },
      async findUnique({ where }) {
        const result = noteRatings.find((item) => matches(item, where));
        return result ? copy(result) : null;
    },
  },
  noteFile: {
    async create({ data }) {
      const file = { id: `file-${nextFileId++}`, createdAt: new Date(), ...data };
      noteFiles.push(file);
      notes.find((note) => note.id === data.noteId)?.files.push(file);
      return copy(file);
    },
    async findMany({ where }) {
      return noteFiles.filter((file) => file.noteId === where.noteId).map(copy);
    },
    async findFirst({ where }) {
      const file = noteFiles.find((item) => item.id === where.id && item.noteId === where.noteId);
      const note = notes.find((item) => item.id === where.noteId && matches(item, where.note.is));
      return file && note ? { ...copy(file), note: copy(note) } : null;
    },
    async delete({ where }) {
      const index = noteFiles.findIndex((file) => file.id === where.id);
      if (index < 0) throw new Error("File not found");
      const [file] = noteFiles.splice(index, 1);
      const note = notes.find((item) => item.id === file.noteId);
      if (note) note.files = note.files.filter((item) => item.id !== file.id);
      return copy(file);
    },
  },
  noteReport: {
    async create({ data }) {
      const report = {
        id: `report-${reports.length + 1}`,
        status: "OPEN",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      reports.push(report);
      return copy(report);
    },
    async findMany({ where }) {
      return reports.filter((report) => {
        const note = notes.find((item) => item.id === report.noteId);
        return (!where.status || report.status === where.status) && note && matches(note, where.note.is);
      }).map((report) => ({
        ...copy(report),
        note: copy(notes.find((item) => item.id === report.noteId)),
      }));
    },
    async count({ where }) {
      return reports.filter((report) => {
        const note = notes.find((item) => item.id === report.noteId);
        return (!where.status || report.status === where.status) && note && matches(note, where.note.is);
      }).length;
    },
    async findFirst({ where }) {
      const report = reports.find((item) => {
        const note = notes.find((candidate) => candidate.id === item.noteId);
        return item.id === where.id && note && matches(note, where.note.is);
      });
      return report ? copy(report) : null;
    },
    async update({ where, data }) {
      const report = reports.find((item) => item.id === where.id);
      Object.assign(report, data, { updatedAt: new Date() });
      return copy(report);
    },
  },
  moderationRecord: {
    async create({ data }) {
      const record = { id: `moderation-${moderationRecords.length + 1}`, createdAt: new Date(), ...data };
      moderationRecords.push(record);
      return copy(record);
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
  async putObject(key, body) {
    storedObjects.set(key, Buffer.from(body));
  },
  async getObject(key) {
    storageReadCount += 1;
    const body = storedObjects.get(key);
    if (!body) throw new Error("Object not found");
    return { Body: body };
  },
  async deleteObject(key) {
    storedObjects.delete(key);
  },
};
require.cache[storagePath] = storageModule;

const { createApp } = require("../src/app");

function makeToken(userId, role = "USER") {
  return jwt.sign({ sub: userId, role }, process.env.JWT_SECRET, {
    issuer: "taskflow-user-service",
    expiresIn: "5m",
  });
}

test("private note access is owner-only and public discovery excludes private content", async (context) => {
  notes = [];
  outbox = [];
  nextNoteId = 1;
  nextEventId = 1;
  noteFiles = [];
  nextFileId = 1;
  storedObjects = new Map();
  storageReadCount = 0;
  reports = [];
  moderationRecords = [];
  noteLikes = [];
  noteRatings = [];

  const app = createApp();
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));

  const baseUrl = `http://127.0.0.1:${server.address().port}/api/notes`;
  const ownerToken = makeToken("owner-1");
  const otherToken = makeToken("other-1");
  const adminToken = makeToken("admin-1", "ADMIN");
  const request = (path, token, options = {}) => fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  assert.equal((await request("", null)).status, 401);

  const privateResponse = await request("", ownerToken, {
    method: "POST",
    body: JSON.stringify({
      title: "Private planning secret",
      description: "Only the owner may read this text.",
      visibility: "PRIVATE",
    }),
  });
  const privateNote = (await privateResponse.json()).data;
  assert.equal(privateResponse.status, 201);

  const privateOwnerRead = await request(`/${privateNote.id}`, ownerToken);
  assert.equal(privateOwnerRead.status, 200);
  assert.equal((await privateOwnerRead.json()).data.description, "Only the owner may read this text.");
  assert.equal((await request(`/${privateNote.id}`, otherToken)).status, 404);
  assert.equal((await request(`/${privateNote.id}`, adminToken)).status, 404);
  assert.equal((await request(`/${privateNote.id}/statistics`, adminToken)).status, 404);

  const unauthenticatedUpload = new FormData();
  unauthenticatedUpload.append("file", new Blob(["%PDF-1.7"]), "private.pdf");
  assert.equal((await fetch(`${baseUrl}/${privateNote.id}/files`, { method: "POST", body: unauthenticatedUpload })).status, 401);

  assert.equal((await request(`/${privateNote.id}`, otherToken, {
    method: "PATCH",
    body: JSON.stringify({ title: "Steal private content" }),
  })).status, 404);
  assert.equal((await request(`/${privateNote.id}`, adminToken, {
    method: "PATCH",
    body: JSON.stringify({ title: "Admin edit" }),
  })).status, 404);
  assert.equal((await request(`/${privateNote.id}`, otherToken, { method: "DELETE" })).status, 404);
  assert.equal((await request(`/${privateNote.id}`, adminToken, { method: "DELETE" })).status, 404);

  const publishPrivate = await request(`/${privateNote.id}/publish`, ownerToken, { method: "POST" });
  assert.equal(publishPrivate.status, 200);
  assert.equal(outbox.length, 0);

  const publicDraftResponse = await request("", ownerToken, {
    method: "POST",
    body: JSON.stringify({
      title: "Public note",
      description: "Searchable public text.",
      visibility: "PUBLIC",
    }),
  });
  const publicDraft = (await publicDraftResponse.json()).data;
  const publishPublic = await request(`/${publicDraft.id}/publish`, ownerToken, { method: "POST" });
  assert.equal(publishPublic.status, 200);
  assert.equal(outbox.length, 1);
  assert.equal("description" in outbox[0].payload, false);

  assert.equal((await request(`/${privateNote.id}/reports`, otherToken, {
    method: "POST",
    body: JSON.stringify({ reason: "Private note report attempt" }),
  })).status, 404);
  const reportResponse = await request(`/${publicDraft.id}/reports`, otherToken, {
    method: "POST",
    body: JSON.stringify({ reason: "Please review this public note" }),
  });
  assert.equal(reportResponse.status, 201);
  const report = (await reportResponse.json()).data;

  const adminPublicNotes = await (await request("/admin/public", adminToken)).json();
  assert.equal(adminPublicNotes.data.some((note) => note.visibility !== "PUBLIC"), false);
  assert.equal(adminPublicNotes.data.some((note) => note.id === privateNote.id), false);
  const adminReports = await (await request("/admin/reports", adminToken)).json();
  assert.equal(adminReports.data.length, 1);
  assert.equal(adminReports.data[0].note.visibility, "PUBLIC");
  assert.equal((await request("/admin/reports", ownerToken)).status, 403);
  assert.equal((await request(`/admin/reports/${report.id}`, adminToken, {
    method: "PATCH",
    body: JSON.stringify({ status: "REVIEWED" }),
  })).status, 200);

  const restrictResponse = await request(`/admin/${publicDraft.id}/restrict`, adminToken, {
    method: "POST",
    body: JSON.stringify({ reason: "Under moderation review" }),
  });
  assert.equal(restrictResponse.status, 200);
  const restrictedFeed = await (await request("", otherToken)).json();
  assert.equal(restrictedFeed.data.length, 0);
  assert.equal((await request(`/${publicDraft.id}`, otherToken)).status, 404);
  assert.equal((await request(`/${publicDraft.id}/reports`, otherToken, {
    method: "POST",
    body: JSON.stringify({ reason: "Report a restricted note" }),
  })).status, 404);
  const restrictedAdminList = await (await request("/admin/public?status=RESTRICTED", adminToken)).json();
  assert.equal(restrictedAdminList.data.some((note) => note.id === publicDraft.id), true);
  assert.equal(moderationRecords[0].action, "RESTRICTED");
  const restrictedEvent = outbox.find((event) => event.eventType === "NoteRestricted");
  assert.equal("title" in restrictedEvent.payload, false);
  assert.equal("description" in restrictedEvent.payload, false);
  assert.equal((await request(`/admin/${privateNote.id}/restrict`, adminToken, {
    method: "POST",
    body: JSON.stringify({ reason: "Private must not enter moderation" }),
  })).status, 404);
  assert.equal((await request(`/admin/${publicDraft.id}/restore`, adminToken, {
    method: "POST",
    body: JSON.stringify({ reason: "Review complete" }),
  })).status, 200);
  assert.equal(moderationRecords[1].action, "RESTORED");

  const publicFeed = await (await request("", otherToken)).json();
  assert.deepEqual(publicFeed.data.map((note) => note.id), [publicDraft.id]);

  const privateSearch = await (await request("/search?search=planning", otherToken)).json();
  assert.equal(privateSearch.data.length, 0);
  const publicSearch = await (await request("/search?search=searchable", otherToken)).json();
  assert.equal(publicSearch.data.length, 1);
  const paginatedPublicSearch = await (await request("/search?page=1&pageSize=1", otherToken)).json();
  assert.equal(paginatedPublicSearch.pagination.page, 1);
  assert.equal(paginatedPublicSearch.pagination.pageSize, 1);
  assert.equal(paginatedPublicSearch.pagination.total, 1);
  assert.equal(paginatedPublicSearch.data[0].visibility, "PUBLIC");
  const authorPublicNotes = await (await request(`/search?ownerId=owner-1`, otherToken)).json();
  assert.deepEqual(authorPublicNotes.data.map((note) => note.id), [publicDraft.id]);
  assert.equal((await request("/search?ownerId=", otherToken)).status, 400);

  const adminMyNotes = await (await request("/mine", adminToken)).json();
  assert.equal(adminMyNotes.data.some((note) => note.visibility === "PRIVATE"), false);
  const adminPrivateList = await request("/mine?visibility=PRIVATE", adminToken);
  assert.equal(adminPrivateList.status, 200);
  assert.equal((await adminPrivateList.json()).data.length, 0);

  const adminPrivateCreate = await request("", adminToken, {
    method: "POST",
    body: JSON.stringify({
      title: "Administrator-owned private note",
      description: "Private to its owner, including when that owner is an administrator.",
      visibility: "PRIVATE",
    }),
  });
  assert.equal(adminPrivateCreate.status, 201);
  const adminPrivateNote = (await adminPrivateCreate.json()).data;
  assert.equal((await request(`/${adminPrivateNote.id}`, adminToken)).status, 200);
  assert.equal((await request(`/${adminPrivateNote.id}`, otherToken)).status, 404);
  const adminPrivateNotes = await (await request("/mine?visibility=PRIVATE", adminToken)).json();
  assert.deepEqual(adminPrivateNotes.data.map((note) => note.id), [adminPrivateNote.id]);
  const adminPrivateFileContent = Buffer.from("%PDF-1.7\nadmin private file bytes");
  const adminPrivateUpload = new FormData();
  adminPrivateUpload.append("file", new Blob([adminPrivateFileContent]), "admin-private.pdf");
  const adminPrivateUploadResponse = await fetch(`${baseUrl}/${adminPrivateNote.id}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: adminPrivateUpload,
  });
  assert.equal(adminPrivateUploadResponse.status, 201);
  const adminPrivateFile = (await adminPrivateUploadResponse.json()).data;
  const adminPrivateFilePath = `/${adminPrivateNote.id}/files/${adminPrivateFile.id}/download`;
  assert.equal((await request(adminPrivateFilePath, otherToken)).status, 404);
  const adminPrivateDownload = await request(adminPrivateFilePath, adminToken);
  assert.equal(adminPrivateDownload.status, 200);
  assert.equal(Buffer.from(await adminPrivateDownload.arrayBuffer()).toString(), adminPrivateFileContent.toString());
  assert.equal((await request(`/${adminPrivateNote.id}/files/${adminPrivateFile.id}`, adminToken, { method: "DELETE" })).status, 200);

  const publicFileContent = Buffer.from("%PDF-1.7\npublic document bytes");
  const publicAttachment = new FormData();
  publicAttachment.append("file", new Blob([publicFileContent]), "public handout.pdf");
  const publicUploadResponse = await fetch(`${baseUrl}/${publicDraft.id}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: publicAttachment,
  });
  assert.equal(publicUploadResponse.status, 201);
  const publicFile = (await publicUploadResponse.json()).data;
  const publicNoteResponse = await request(`/${publicDraft.id}`, otherToken);
  assert.equal(publicNoteResponse.status, 200);
  assert.equal((await publicNoteResponse.json()).data.files[0].id, publicFile.id);

  const publicFilePath = `/${publicDraft.id}/files/${publicFile.id}/download`;
  assert.equal((await request(publicFilePath, null)).status, 401);
  for (const token of [otherToken, adminToken]) {
    const response = await request(publicFilePath, token);
    assert.equal(response.status, 200);
    assert.equal(Buffer.from(await response.arrayBuffer()).toString(), publicFileContent.toString());
  }
  assert.equal(storageReadCount, 3);

  const madePrivate = await request(`/${publicDraft.id}`, ownerToken, {
    method: "PATCH",
    body: JSON.stringify({ visibility: "PRIVATE" }),
  });
  assert.equal(madePrivate.status, 200);
  assert.equal((await request(publicFilePath, otherToken)).status, 404);
  assert.equal((await request(publicFilePath, adminToken)).status, 404);
  assert.equal(storageReadCount, 3);
  assert.equal((await request(`/${publicDraft.id}/files/${publicFile.id}`, ownerToken, { method: "DELETE" })).status, 200);
  const visibilityEvent = outbox.filter((event) => event.eventType === "NoteVisibilityChanged").at(-1);
  assert.equal(visibilityEvent.payload.visibility, "PRIVATE");
  assert.equal("title" in visibilityEvent.payload, false);
  assert.equal("description" in visibilityEvent.payload, false);
  assert.equal((await request(`/${publicDraft.id}`, otherToken)).status, 404);
  assert.equal((await request(`/${publicDraft.id}`, adminToken)).status, 404);
  const noLongerSearchable = await (await request("/search?search=searchable", otherToken)).json();
  assert.equal(noLongerSearchable.data.length, 0);

  const ownerUpdated = await request(`/${privateNote.id}`, ownerToken, {
    method: "PATCH",
    body: JSON.stringify({ title: "Updated private title" }),
  });
  assert.equal(ownerUpdated.status, 200);

  assert.equal((await request(`/${privateNote.id}/statistics`, ownerToken)).status, 200);

  const invalidUpload = new FormData();
  invalidUpload.append("file", new Blob(["not a PDF"]), "spoofed.pdf");
  const rejectedUpload = await fetch(`${baseUrl}/${privateNote.id}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: invalidUpload,
  });
  assert.equal(rejectedUpload.status, 415);
  assert.equal(storedObjects.size, 0);

  const validUpload = new FormData();
  const pdfContent = Buffer.from("%PDF-1.7\nprivate document bytes");
  validUpload.append("file", new Blob([pdfContent]), "private plan.pdf");
  const uploaded = await fetch(`${baseUrl}/${privateNote.id}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: validUpload,
  });
  assert.equal(uploaded.status, 201);
  const file = (await uploaded.json()).data;
  assert.equal("storageKey" in file, false);
  const storageKey = [...storedObjects.keys()][0];
  assert.match(storageKey, /^notes\/note-1\/[0-9a-f-]+\.pdf$/i);
  assert.equal(storageKey.includes("private plan"), false);

  const publicDiscoveryResponse = await request("/", otherToken);
  const publicDiscoveryBody = await publicDiscoveryResponse.text();
  assert.equal(publicDiscoveryResponse.status, 200);
  assert.equal(publicDiscoveryBody.includes(privateNote.id), false);
  assert.equal(publicDiscoveryBody.includes("Private planning secret"), false);
  assert.equal(publicDiscoveryBody.includes("Only the owner may read this text."), false);
  assert.equal(publicDiscoveryBody.includes("private plan.pdf"), false);

  const adminNotesResponse = await request("/admin/public", adminToken);
  const adminNotesBody = await adminNotesResponse.text();
  assert.equal(adminNotesResponse.status, 200);
  assert.equal(adminNotesBody.includes(privateNote.id), false);
  assert.equal(adminNotesBody.includes("Private planning secret"), false);
  assert.equal(adminNotesBody.includes("private plan.pdf"), false);

  const adminReportsResponse = await request("/admin/reports", adminToken);
  const adminReportsBody = await adminReportsResponse.text();
  assert.equal(adminReportsResponse.status, 200);
  assert.equal(adminReportsBody.includes("Only the owner may read this text."), false);
  assert.equal(adminReportsBody.includes("private plan.pdf"), false);

  const filePath = `/${privateNote.id}/files/${file.id}/download`;
  assert.equal((await request(filePath, otherToken)).status, 404);
  assert.equal((await request(filePath, adminToken)).status, 404);
  assert.equal(storageReadCount, 3);

  const ownerDownload = await request(filePath, ownerToken);
  assert.equal(ownerDownload.status, 200);
  assert.equal(ownerDownload.headers.get("cache-control"), "private, no-store");
  assert.equal(Buffer.from(await ownerDownload.arrayBuffer()).toString(), pdfContent.toString());
  assert.equal(storageReadCount, 4);

  const docxUpload = new FormData();
  docxUpload.append("file", new Blob([makeDocx()]), "notes.docx");
  const docxResponse = await fetch(`${baseUrl}/${privateNote.id}/files`, {
    method: "POST", headers: { Authorization: `Bearer ${ownerToken}` }, body: docxUpload,
  });
  assert.equal(docxResponse.status, 201);
  const docxFile = (await docxResponse.json()).data;
  assert.equal(docxFile.contentType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

  const executableUpload = new FormData();
  executableUpload.append("file", new Blob(["MZ" + "x".repeat(64)]), "malware.exe");
  assert.equal((await fetch(`${baseUrl}/${privateNote.id}/files`, {
    method: "POST", headers: { Authorization: `Bearer ${ownerToken}` }, body: executableUpload,
  })).status, 415);

  const oversizedUpload = new FormData();
  oversizedUpload.append("file", new Blob([Buffer.alloc(10 * 1024 * 1024 + 1)]), "oversized.pdf");
  assert.equal((await fetch(`${baseUrl}/${privateNote.id}/files`, {
    method: "POST", headers: { Authorization: `Bearer ${ownerToken}` }, body: oversizedUpload,
  })).status, 413);

  const deleteFileResponse = await request(`/${privateNote.id}/files/${docxFile.id}`, ownerToken, { method: "DELETE" });
  assert.equal(deleteFileResponse.status, 200);
  assert.equal(storedObjects.size, 1);

  assert.equal((await request(`/${privateNote.id}`, ownerToken, { method: "DELETE" })).status, 200);
  assert.equal(storedObjects.size, 0);
  const eventPayloads = JSON.stringify(outbox);
  assert.equal(eventPayloads.includes(privateNote.id), false);
  assert.equal(eventPayloads.includes("Only the owner may read this text."), false);
  assert.equal(eventPayloads.includes("private plan.pdf"), false);
});

test("public note likes and ratings are unique, validated, aggregated, and evented", async (context) => {
  notes = [];
  outbox = [];
  nextNoteId = 1;
  nextEventId = 1;
  noteLikes = [];
  noteRatings = [];

  const app = createApp();
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/notes`;
  const ownerToken = makeToken("creator-1");
  const actorToken = makeToken("actor-1");
  const secondActorToken = makeToken("actor-2");
  const request = (path, token, options = {}) => fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const createResponse = await request("", ownerToken, {
    method: "POST",
    body: JSON.stringify({ title: "Public engagement", description: "A public note", visibility: "PUBLIC" }),
  });
  const note = (await createResponse.json()).data;
  assert.equal(createResponse.status, 201);
  assert.equal((await request(`/${note.id}/publish`, ownerToken, { method: "POST" })).status, 200);

  assert.equal((await request(`/${note.id}/likes`, ownerToken, { method: "POST" })).status, 400);
  assert.equal((await request(`/${note.id}/likes`, actorToken, { method: "POST" })).status, 201);
  assert.equal((await request(`/${note.id}/likes`, actorToken, { method: "POST" })).status, 409);
  let likes = await (await request(`/${note.id}/likes`, actorToken)).json();
  assert.deepEqual(likes.data, { count: 1, likedByMe: true });
  assert.equal((await request(`/${note.id}/likes`, actorToken, { method: "DELETE" })).status, 200);
  assert.equal((await request(`/${note.id}/likes`, actorToken, { method: "DELETE" })).status, 404);
  likes = await (await request(`/${note.id}/likes`, actorToken)).json();
  assert.deepEqual(likes.data, { count: 0, likedByMe: false });

  for (const value of [0, 6, 2.5, "4", null]) {
    assert.equal((await request(`/${note.id}/ratings`, actorToken, {
      method: "PUT",
      body: JSON.stringify({ value }),
    })).status, 400);
  }
  assert.equal((await request(`/${note.id}/ratings`, ownerToken, {
    method: "PUT",
    body: JSON.stringify({ value: 4 }),
  })).status, 400);
  await request(`/${note.id}/ratings`, actorToken, {
    method: "PUT",
    body: JSON.stringify({ value: 4 }),
  });
  await request(`/${note.id}/ratings`, secondActorToken, {
    method: "PUT",
    body: JSON.stringify({ value: 2 }),
  });
  let ratings = await (await request(`/${note.id}/ratings`, actorToken)).json();
  assert.deepEqual(ratings.data, { average: 3, count: 2, myRating: 4 });
  await request(`/${note.id}/ratings`, actorToken, {
    method: "PUT",
    body: JSON.stringify({ value: 5 }),
  });
  ratings = await (await request(`/${note.id}/ratings`, actorToken)).json();
  assert.deepEqual(ratings.data, { average: 3.5, count: 2, myRating: 5 });
  assert.equal(noteRatings.length, 2);

  const emittedTypes = outbox.map((event) => event.eventType);
  assert.deepEqual(emittedTypes, [
    "NotePublished",
    "NoteLiked",
    "NoteUnliked",
    "NoteRated",
    "NoteRated",
    "NoteRatingUpdated",
  ]);
  assert.equal(outbox.at(-1).payload.ratingTotal, 7);
  assert.equal(outbox.at(-1).payload.ratingCount, 2);
  assert.equal(outbox.at(-1).payload.likeCount, 0);

  await request(`/${note.id}`, ownerToken, {
    method: "PATCH",
    body: JSON.stringify({ visibility: "PRIVATE" }),
  });
  assert.equal((await request(`/${note.id}/likes`, actorToken)).status, 404);
  assert.equal(outbox.at(-1).eventType, "NoteVisibilityChanged");
});
