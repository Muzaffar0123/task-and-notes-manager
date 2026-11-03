const assert = require("node:assert/strict");
const { test } = require("node:test");
const { sendEmail } = require("../src/services/emailProvider");

test("email provider sends authenticated idempotent requests when configured", async () => {
  const previous = {
    url: process.env.EMAIL_PROVIDER_URL,
    key: process.env.EMAIL_PROVIDER_API_KEY,
    from: process.env.EMAIL_FROM,
    fetch: global.fetch,
  };
  process.env.EMAIL_PROVIDER_URL = "https://mail.example.test/send";
  process.env.EMAIL_PROVIDER_API_KEY = "provider-test-key";
  process.env.EMAIL_FROM = "TaskFlow <noreply@example.test>";
  let captured;
  global.fetch = async (url, options) => {
    captured = { url, options };
    return { ok: true };
  };

  try {
    const result = await sendEmail({
      to: "user@example.test",
      subject: "Welcome",
      text: "Your account is ready.",
      idempotencyKey: "event-1:user-1",
    });
    assert.deepEqual(result, { skipped: false });
    assert.equal(captured.url, process.env.EMAIL_PROVIDER_URL);
    assert.equal(captured.options.headers.Authorization, "Bearer provider-test-key");
    assert.equal(captured.options.headers["Idempotency-Key"], "event-1:user-1");
    assert.equal(JSON.parse(captured.options.body).to, "user@example.test");
  } finally {
    if (previous.url === undefined) delete process.env.EMAIL_PROVIDER_URL;
    else process.env.EMAIL_PROVIDER_URL = previous.url;
    if (previous.key === undefined) delete process.env.EMAIL_PROVIDER_API_KEY;
    else process.env.EMAIL_PROVIDER_API_KEY = previous.key;
    if (previous.from === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previous.from;
    global.fetch = previous.fetch;
  }
});

test("email provider exposes provider failures for event retry handling", async () => {
  const previous = {
    url: process.env.EMAIL_PROVIDER_URL,
    key: process.env.EMAIL_PROVIDER_API_KEY,
    from: process.env.EMAIL_FROM,
    fetch: global.fetch,
  };
  process.env.EMAIL_PROVIDER_URL = "https://mail.example.test/send";
  process.env.EMAIL_PROVIDER_API_KEY = "provider-test-key";
  process.env.EMAIL_FROM = "TaskFlow <noreply@example.test>";
  global.fetch = async () => ({ ok: false, status: 503 });

  try {
    await assert.rejects(sendEmail({ to: "user@example.test", subject: "Hello", text: "Hi", idempotencyKey: "e1" }), /HTTP 503/);
  } finally {
    if (previous.url === undefined) delete process.env.EMAIL_PROVIDER_URL;
    else process.env.EMAIL_PROVIDER_URL = previous.url;
    if (previous.key === undefined) delete process.env.EMAIL_PROVIDER_API_KEY;
    else process.env.EMAIL_PROVIDER_API_KEY = previous.key;
    if (previous.from === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previous.from;
    global.fetch = previous.fetch;
  }
});