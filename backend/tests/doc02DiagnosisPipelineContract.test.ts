import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const diagnosisQueueSource = readFileSync(resolve(process.cwd(), "src/services/diagnosisQueue.ts"), "utf8");

for (const token of [
  "invokeAiGateway",
  "Promise.allSettled",
  "monitorResult.create",
  "gap.create",
  "strategy.create",
  "providerModes",
  "safe_placeholder",
  "diagnosis_pipeline",
  "promptHidden: true"
]) {
  assert.ok(
    diagnosisQueueSource.includes(token),
    `DOC-02 diagnosis pipeline must include ${token}.`
  );
}

for (const step of [
  "正在调用 AI 平台采集回答",
  "正在清洗并保存 AI 回答",
  "正在生成差距诊断",
  "正在生成初始优化策略",
  "诊断已完成"
]) {
  assert.ok(
    diagnosisQueueSource.includes(step),
    `DOC-02 diagnosis progress must expose user-facing step: ${step}.`
  );
}

console.log("DOC-02 diagnosis pipeline contract checks passed.");
