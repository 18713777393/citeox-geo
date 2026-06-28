import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { createApp } from "../src/app.js";

const rateLimitSource = readFileSync(resolve(process.cwd(), "src/middleware/rateLimit.ts"), "utf8");
const envSource = readFileSync(resolve(process.cwd(), "src/config/env.ts"), "utf8");
const authRouteSource = readFileSync(resolve(process.cwd(), "src/routes/auth.ts"), "utf8");
const authServiceSource = readFileSync(resolve(process.cwd(), "src/services/auth.ts"), "utf8");
const authSecuritySource = readFileSync(resolve(process.cwd(), "src/services/authSecurity.ts"), "utf8");
const prismaSchemaSource = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

assert.match(
  rateLimitSource,
  /export const registerRateLimit[\s\S]*?windowMs:\s*60_000[\s\S]*?limit:\s*5\b/,
  "DOC-01 register limit must be 5/min/IP."
);
assert.match(
  rateLimitSource,
  /export const loginRateLimit[\s\S]*?windowMs:\s*60_000[\s\S]*?limit:\s*10\b/,
  "DOC-01 login limit must be 10/min/IP."
);
assert.match(
  rateLimitSource,
  /export const passwordResetRateLimit[\s\S]*?windowMs:\s*30\s*\*\s*60_000[\s\S]*?limit:\s*3\b/,
  "DOC-01 forgot-password limit must be 3 per 30 minutes."
);
assert.match(
  envSource,
  /AUTH_CODE_TTL_MINUTES:\s*z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.default\(5\)/,
  "DOC-01 email code TTL must default to 5 minutes."
);
assert.match(
  envSource,
  /AUTH_CODE_RESEND_SECONDS:\s*z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.default\(60\)/,
  "DOC-01 email resend cooldown must default to 60 seconds."
);
assert.match(
  authServiceSource,
  /loginFailureStore/,
  "DOC-01 login failure lock must use loginFailureStore instead of a service-local Map only."
);
assert.match(
  authServiceSource,
  /REDIS_URL/,
  "DOC-01 login failure lock must use Redis when REDIS_URL is configured."
);
assert.match(
  authSecuritySource,
  /createCipheriv\("aes-256-gcm"/,
  "DOC-01 requires AES-256-GCM encryption for sensitive contact data."
);
assert.match(
  authSecuritySource,
  /createDecipheriv\("aes-256-gcm"/,
  "DOC-01 requires AES-256-GCM decryption for sensitive contact data."
);
assert.match(authSecuritySource, /hashEmail/, "DOC-01 requires email hash lookup.");
assert.match(authSecuritySource, /hashPhone/, "DOC-01 requires phone hash lookup.");
assert.match(authSecuritySource, /publicEmail/, "DOC-01 API responses must return masked email.");
assert.match(authSecuritySource, /publicPhone/, "DOC-01 API responses must return masked phone.");
assert.match(
  envSource,
  /NODE_ENV === "production" && !env\.ENCRYPTION_KEY/,
  "DOC-01 production must refuse to start without ENCRYPTION_KEY."
);
assert.match(
  authServiceSource,
  /passwordHash = await bcrypt\.hash/,
  "DOC-01 passwords must be stored as bcrypt hashes."
);
assert.match(prismaSchemaSource, /emailHash\s+String\?/, "DOC-01 user table must include emailHash.");
assert.match(prismaSchemaSource, /phoneHash\s+String\?/, "DOC-01 user table must include phoneHash.");
assert.match(
  authRouteSource,
  /token:\s*z\.string\(\)\.trim\(\)\.min\(12\)\.optional\(\)/,
  "DOC-01 reset-password API must accept token from /reset-password?token=..."
);
assert.match(
  authRouteSource,
  /value\.resetToken \|\| value\.token/,
  "DOC-01 reset-password API must normalize token and resetToken."
);
assert.match(
  authServiceSource,
  /findUserByResetToken/,
  "DOC-01 reset-password service must resolve the user from a reset token without asking for account."
);

const server = createServer(createApp());

await new Promise<void>((resolve) => {
  server.listen(0, "127.0.0.1", resolve);
});

try {
  const address = server.address();
  assert.ok(address && typeof address === "object", "Expected local test server address.");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const publicResponse = await fetch(`${baseUrl}/api/v1/auth/validate-industry`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ industry: "SaaS" })
  });
  assert.notEqual(publicResponse.status, 401, "DOC-01 public auth endpoint must not return 401.");
  assert.equal(publicResponse.status, 200, "DOC-01 public auth endpoint should be reachable without login.");

  const protectedResponse = await fetch(`${baseUrl}/api/v1/auth/me`);
  assert.equal(protectedResponse.status, 401, "DOC-01 protected auth endpoint /me should require login.");

  console.log("DOC-01 auth HTTP contract checks passed.");
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
