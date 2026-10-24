import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_TTL_SECONDS, createSessionTokens } from "../src/utils/sessionTokens.js";

test("session tokens provide an eight-hour access token and a rolling 30-day refresh token", () => {
  const secret = "test-session-secret-with-enough-entropy";
  const tokens = createSessionTokens({ id: "user-1", tenantId: "tenant-1" }, secret);
  const access = jwt.verify(tokens.accessToken, secret);
  const refresh = jwt.verify(tokens.refreshToken, secret);

  assert.equal(tokens.expiresIn, ACCESS_TOKEN_TTL_SECONDS);
  assert.equal(access.exp - access.iat, 8 * 60 * 60);
  assert.equal(refresh.exp - refresh.iat, 30 * 24 * 60 * 60);
  assert.equal(refresh.type, "refresh");
  assert.equal(refresh.id, "user-1");
});
