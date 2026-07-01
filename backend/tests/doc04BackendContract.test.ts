import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { createApp } from "../src/app.js";

const appSource = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
const serverSource = readFileSync(resolve(process.cwd(), "src/server.ts"), "utf8");
const routePath = resolve(process.cwd(), "src/routes/dashboard.ts");
const servicePath = resolve(process.cwd(), "src/services/dashboard.ts");
const realtimePath = resolve(process.cwd(), "src/services/dashboardRealtime.ts");

assert.ok(appSource.includes('app.use("/api/v1/dashboard"'), "DOC-04 app must mount /api/v1/dashboard.");
assert.ok(existsSync(routePath), "DOC-04 must include backend dashboard routes.");
assert.ok(existsSync(servicePath), "DOC-04 must include a backend dashboard aggregation service.");
assert.ok(existsSync(realtimePath), "DOC-04 must include dashboard WebSocket progress push service.");

const routeSource = existsSync(routePath) ? readFileSync(routePath, "utf8") : "";
const serviceSource = existsSync(servicePath) ? readFileSync(servicePath, "utf8") : "";
const realtimeSource = existsSync(realtimePath) ? readFileSync(realtimePath, "utf8") : "";

for (const route of ['"/overview"', '"/refresh"', '"/refresh/:taskId"']) {
  assert.ok(routeSource.includes(route), `DOC-04 dashboard route must include ${route}.`);
}

assert.ok(routeSource.includes("requireAuth"), "DOC-04 dashboard APIs must require login.");
assert.ok(serviceSource.includes("getDashboardOverview"), "DOC-04 service must aggregate overview data.");
assert.ok(serviceSource.includes("startDashboardRefresh"), "DOC-04 service must create refresh tasks.");
assert.ok(serviceSource.includes("getDashboardRefreshStatus"), "DOC-04 service must expose refresh progress status.");
assert.ok(serviceSource.includes("Redis") || serviceSource.includes("getRedis"), "DOC-04 overview must use Redis cache.");
assert.ok(serviceSource.includes("300") && serviceSource.includes("setex"), "DOC-04 Redis overview cache TTL must be 5 minutes.");
assert.ok(serviceSource.includes("del(") || serviceSource.includes(".del"), "DOC-04 refresh must clear dashboard cache.");
assert.ok(serviceSource.includes("BullMQ") && serviceSource.includes("dashboard-refresh-queue"), "DOC-04 refresh must be wired for BullMQ.");
assert.ok(serviceSource.includes("estimateCost") && serviceSource.includes("checkBalance"), "DOC-04 refresh must estimate cost and check balance.");
assert.ok(serviceSource.includes("deductCredits"), "DOC-04 refresh must deduct credits after refresh work.");
assert.ok(serviceSource.includes("dailyRefreshLimit"), "DOC-04 refresh must enforce package daily refresh limits.");
assert.ok(realtimeSource.includes("WebSocketServer") && realtimeSource.includes("/api/v1/dashboard/ws"), "DOC-04 must expose WebSocket progress at /api/v1/dashboard/ws.");
assert.ok(realtimeSource.includes("dashboard.refresh.progress"), "DOC-04 WebSocket payload must identify dashboard refresh progress events.");
assert.ok(serverSource.includes("attachDashboardRefreshServer"), "DOC-04 server must attach dashboard WebSocket service.");

const server = createServer(createApp());
await new Promise<void>((resolveListen) => {
  server.listen(0, "127.0.0.1", resolveListen);
});

try {
  const address = server.address();
  assert.ok(address && typeof address === "object", "Expected local test server address.");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const overview = await fetch(`${baseUrl}/api/v1/dashboard/overview`);
  assert.equal(overview.status, 401, "GET /api/v1/dashboard/overview must require login.");

  const refresh = await fetch(`${baseUrl}/api/v1/dashboard/refresh`, { method: "POST" });
  assert.equal(refresh.status, 401, "POST /api/v1/dashboard/refresh must require login.");

  const status = await fetch(`${baseUrl}/api/v1/dashboard/refresh/test-task`);
  assert.equal(status.status, 401, "GET /api/v1/dashboard/refresh/:taskId must require login.");
} finally {
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}

console.log("DOC-04 backend dashboard contract checks passed.");
