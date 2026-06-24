import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createApp } from "../src/app.js";

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
