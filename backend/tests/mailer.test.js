import test from "node:test";
import assert from "node:assert/strict";
import { sendMail } from "../mailer.js";

const envKeys = ["EMAIL_PROVIDER", "SMTP2GO_API_KEY", "SMTP2GO_FROM", "SMTP2GO_API_URL"];

function withSmtp2goEnv(run) {
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  process.env.EMAIL_PROVIDER = "smtp2go";
  process.env.SMTP2GO_API_KEY = "api-test-key";
  process.env.SMTP2GO_FROM = "JibuSales <jibusales00@gmail.com>";
  delete process.env.SMTP2GO_API_URL;
  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const key of envKeys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
      globalThis.fetch = previousFetch;
    });
}

test("SMTP2GO provider sends through HTTPS with the verified sender", async () => {
  await withSmtp2goEnv(async () => {
    let request;
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ data: { succeeded: 1, failed: 0, email_id: "email-1" } }) };
    };

    const result = await sendMail("owner@example.com", "Reset code", "<p>Code</p>");
    assert.equal(result.messageId, "email-1");
    assert.equal(request.url, "https://eu-api.smtp2go.com/v3/email/send");
    assert.equal(request.options.headers["X-Smtp2go-Api-Key"], "api-test-key");
    assert.deepEqual(JSON.parse(request.options.body), {
      sender: "JibuSales <jibusales00@gmail.com>",
      to: ["owner@example.com"],
      subject: "Reset code",
      html_body: "<p>Code</p>",
      fastaccept: true,
    });
  });
});

test("SMTP2GO HTTP 200 with per-message failure is reported as a failed send", async () => {
  await withSmtp2goEnv(async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { succeeded: 0, failed: 1, failures: [{ error: "Sender not verified" }] } }),
    });

    await assert.rejects(sendMail("owner@example.com", "Reset code", "<p>Code</p>"), /Sender not verified/);
  });
});
