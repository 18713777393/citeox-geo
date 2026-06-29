import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { createApp } from "../src/app.js";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const appSource = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
const brandsRoutePath = resolve(process.cwd(), "src/routes/brands.ts");
const industryRoutePath = resolve(process.cwd(), "src/routes/industry.ts");
const diagnosisRoutePath = resolve(process.cwd(), "src/routes/diagnosis.ts");
const brandServicePath = resolve(process.cwd(), "src/services/brands.ts");
const industryServicePath = resolve(process.cwd(), "src/services/industry.ts");
const diagnosisServicePath = resolve(process.cwd(), "src/services/diagnosisQueue.ts");

for (const model of ["BrandProject", "Competitor", "Keyword", "DiagnosisTask"]) {
  assert.ok(schema.includes(`model ${model}`), `DOC-02 Prisma schema must define ${model}.`);
}

for (const table of ["brand_projects", "competitors", "keywords", "diagnosis_tasks"]) {
  assert.ok(schema.includes(`@@map("${table}")`), `DOC-02 schema must map ${table}.`);
}

for (const index of [
  "@@index([userId])",
  "@@index([brandProjectId])",
  "@@index([status])"
]) {
  assert.ok(schema.includes(index), `DOC-02 schema must include index ${index}.`);
}

for (const route of [
  'app.use("/api/v1/brands"',
  'app.use("/api/v1/industry"',
  'app.use("/api/v1/diagnosis/tasks"'
]) {
  assert.ok(appSource.includes(route), `DOC-02 app must mount ${route}.`);
}

for (const file of [brandsRoutePath, industryRoutePath, diagnosisRoutePath, brandServicePath, industryServicePath, diagnosisServicePath]) {
  assert.ok(existsSync(file), `DOC-02 must include ${file}.`);
}

const brandsRoute = readFileSync(brandsRoutePath, "utf8");
const industryRoute = readFileSync(industryRoutePath, "utf8");
const diagnosisRoute = readFileSync(diagnosisRoutePath, "utf8");
const brandService = readFileSync(brandServicePath, "utf8");
const industryService = readFileSync(industryServicePath, "utf8");
const diagnosisService = readFileSync(diagnosisServicePath, "utf8");

for (const route of ['"/"', '"/check-limit"', '"/:id"']) {
  assert.ok(brandsRoute.includes(route), `DOC-02 brands route must include ${route}.`);
}
assert.ok(brandsRoute.includes("requireAuth"), "DOC-02 brand routes must require login.");
assert.ok(diagnosisRoute.includes("requireAuth"), "DOC-02 diagnosis status route must require login.");
assert.ok(industryRoute.includes('"/categories"'), "DOC-02 industry routes must include /categories.");
assert.ok(industryRoute.includes('"/search"'), "DOC-02 industry routes must include /search.");

for (const behavior of [
  "createBrandProject",
  "getBrandProject",
  "checkBrandCreateLimit",
  "validateBrandCreateInput",
  "platformLimitForPlan",
  "estimateCost",
  "checkBalance",
  "deductCredits",
  "$transaction",
  "brandProject.create",
  "competitor.createMany",
  "keyword.createMany",
  "diagnosisTask.create",
  "hasBrand: true",
  "INSUFFICIENT_BALANCE",
  "BRAND_LIMIT_EXCEEDED",
  "PLATFORM_LIMIT_EXCEEDED"
]) {
  assert.ok(brandService.includes(behavior), `DOC-02 brand service must include ${behavior}.`);
}

assert.ok(brandService.includes("brand_diagnosis"), "DOC-02 creation must bill diagnosis as brand_diagnosis.");
assert.ok(brandService.includes("estimatedDuration: 300"), "DOC-02 create response must include estimatedDuration: 300.");
assert.ok(diagnosisService.includes("diagnosis-queue"), "DOC-02 diagnosis queue must be named diagnosis-queue.");
assert.ok(diagnosisService.includes("BullMQ"), "DOC-02 diagnosis queue service must document BullMQ production integration.");
assert.ok(diagnosisService.includes("WebSocket"), "DOC-02 diagnosis queue service must document WebSocket progress push.");
assert.ok(diagnosisService.includes("progress") && diagnosisService.includes("currentStep"), "DOC-02 diagnosis status must expose progress/currentStep.");

const industryCount = (industryService.match(/primary:/g) ?? []).length;
assert.ok(industryCount >= 50, `DOC-02 industry dictionary must include at least 50 primary industries, found ${industryCount}.`);
assert.ok(industryService.includes("餐饮美食"), "DOC-02 industry dictionary must include 餐饮美食.");
assert.ok(industryService.includes("零售电商"), "DOC-02 industry dictionary must include 零售电商.");
assert.ok(industryService.includes("教育培训"), "DOC-02 industry dictionary must include 教育培训.");
assert.ok(industryService.includes("医疗健康"), "DOC-02 industry dictionary must include 医疗健康.");

const server = createServer(createApp());
await new Promise<void>((resolveListen) => {
  server.listen(0, "127.0.0.1", resolveListen);
});

try {
  const address = server.address();
  assert.ok(address && typeof address === "object", "Expected local test server address.");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const publicCategories = await fetch(`${baseUrl}/api/v1/industry/categories?industry=${encodeURIComponent("餐饮美食")}`);
  assert.equal(publicCategories.status, 200, "GET /api/v1/industry/categories should be reachable.");
  const categoriesBody = await publicCategories.json() as { data?: { categories?: unknown[] } };
  assert.ok((categoriesBody.data?.categories?.length ?? 0) >= 5, "Industry categories should return at least 5 options.");

  const protectedCreate = await fetch(`${baseUrl}/api/v1/brands`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(protectedCreate.status, 401, "POST /api/v1/brands must require login.");

  const protectedLimit = await fetch(`${baseUrl}/api/v1/brands/check-limit`);
  assert.equal(protectedLimit.status, 401, "GET /api/v1/brands/check-limit must require login.");

  const protectedDiagnosis = await fetch(`${baseUrl}/api/v1/diagnosis/tasks/test/status`);
  assert.equal(protectedDiagnosis.status, 401, "GET /api/v1/diagnosis/tasks/:id/status must require login.");
} finally {
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}

console.log("DOC-02 backend brand-create contract checks passed.");
