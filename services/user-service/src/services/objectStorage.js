const {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");

let client;

function getBucket() {
  if (!process.env.S3_BUCKET) throw new Error("Object storage is not configured");
  return process.env.S3_BUCKET;
}

function getClient() {
  if (client) return client;
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  if (endpoint && (!accessKeyId || !secretAccessKey)) {
    throw new Error("Object storage credentials are not configured");
  }
  client = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  });
  return client;
}

async function putObject(key, body, contentType) {
  await getClient().send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: "private, no-store",
    ServerSideEncryption: process.env.S3_SERVER_SIDE_ENCRYPTION || undefined,
  }));
}

async function getObject(key) {
  return getClient().send(new GetObjectCommand({ Bucket: getBucket(), Key: key }));
}

async function deleteObject(key) {
  await getClient().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}

module.exports = { putObject, getObject, deleteObject };
