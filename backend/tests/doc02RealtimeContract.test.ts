import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
};
const serverSource = readFileSync(resolve(process.cwd(), "src/server.ts"), "utf8");
const diagnosisQueueSource = readFileSync(resolve(process.cwd(), "src/services/diagnosisQueue.ts"), "utf8");
const realtimePath = resolve(process.cwd(), "src/services/diagnosisRealtime.ts");

assert.ok(packageJson.dependencies?.bullmq, "DOC-02 production diagnosis queue must depend on BullMQ.");
assert.ok(packageJson.dependencies?.ws, "DOC-02 progress push must depend on ws WebSocket server.");
assert.ok(existsSync(realtimePath), "DOC-02 must include a diagnosisRealtime WebSocket service.");

const realtimeSource = readFileSync(realtimePath, "utf8");

for (const token of [
  "createServer",
  "attachDiagnosisProgressServer",
  "startDiagnosisWorker",
  "httpServer.listen"
]) {
  assert.ok(serverSource.includes(token), `DOC-02 server boot must include ${token}.`);
}

for (const token of [
  "Queue",
  "Worker",
  "QueueEvents",
  "REDIS_URL",
  "createRedisConnection",
  "processDiagnosisJob",
  "publishDiagnosisProgress",
  "runInlineDiagnosisTask"
]) {
  assert.ok(diagnosisQueueSource.includes(token), `DOC-02 diagnosis queue must include ${token}.`);
}

for (const token of [
  "WebSocketServer",
  "attachDiagnosisProgressServer",
  "broadcastDiagnosisProgress",
  "diagnosisTaskId",
  "progress",
  "currentStep"
]) {
  assert.ok(realtimeSource.includes(token), `DOC-02 realtime service must include ${token}.`);
}

console.log("DOC-02 realtime BullMQ/WebSocket contract checks passed.");
