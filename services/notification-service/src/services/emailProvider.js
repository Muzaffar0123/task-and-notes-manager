async function sendEmail({ to, subject, text, idempotencyKey }) {
  const endpoint = process.env.EMAIL_PROVIDER_URL;
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!endpoint || !apiKey || !from) return { skipped: true };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ from, to, subject, text }),
    signal: AbortSignal.timeout(Number(process.env.EMAIL_TIMEOUT_MS || 5000)),
  });
  if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}`);
  return { skipped: false };
}

module.exports = { sendEmail };