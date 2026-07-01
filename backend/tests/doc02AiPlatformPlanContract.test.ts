import assert from "node:assert/strict";
import {
  allowedProvidersForPlan,
  filterProviderCodesForPlan,
  listAiProviders
} from "../src/services/aiGateway.js";

const selectableProviders = [
  "deepseek",
  "doubao",
  "tongyi",
  "zhipu",
  "qianfan",
  "yuanbao",
  "kimi",
  "perplexity",
  "xunfei",
  "ai360"
];

const registered = listAiProviders().map((provider) => provider.code);
for (const provider of selectableProviders) {
  assert.ok(registered.includes(provider), `DOC-02 AI gateway must register provider ${provider}.`);
}

assert.deepEqual(
  filterProviderCodesForPlan(["yuanbao", "kimi", "tongyi"], "free", "monitor.run"),
  ["yuanbao"],
  "Free plan should allow the user to self-select any one supported AI platform."
);

assert.deepEqual(
  filterProviderCodesForPlan(["yuanbao", "kimi", "tongyi"], "personal_month", "monitor.run"),
  ["yuanbao", "kimi"],
  "Personal plan should allow the user to self-select any two supported AI platforms."
);

assert.deepEqual(
  allowedProvidersForPlan("pro_month"),
  ["doubao", "yuanbao", "deepseek", "tongyi"],
  "Professional plan should expose the DOC-03 fixed four-model bundle."
);

assert.deepEqual(
  filterProviderCodesForPlan(selectableProviders, "enterprise_month", "monitor.run"),
  selectableProviders,
  "Enterprise plan should allow all supported AI platforms."
);

console.log("DOC-02 AI platform plan contract checks passed.");
