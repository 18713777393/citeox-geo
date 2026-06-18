import assert from "node:assert/strict";
import {
  CollectionHealthStatus,
  CollectionSourceStatus,
  CollectionSourceType,
  type CollectionSource
} from "@prisma/client";
import { HttpError } from "../src/middleware/error.js";
import {
  redactSourceConfigForResponse,
  sanitizeSecretRefForSourceType,
  sanitizeSourceConfigForStorage
} from "../src/services/sourceHub/configPolicy.js";
import { formatSource } from "../src/services/sourceHub/sourceHub.js";

const manualConfig = sanitizeSourceConfigForStorage(CollectionSourceType.MANUAL_IMPORT, {
  mode: "user_supplied",
  labels: ["faq", "support"],
  ignoredInternalField: "not-public"
});

assert.deepEqual(Object.keys(manualConfig ?? {}).sort(), ["labels", "mode"]);

assertHttpCode(
  () => sanitizeSourceConfigForStorage(CollectionSourceType.SEARCH_API, {
    query: "geo keywords",
    accessToken: "hidden"
  }),
  "CONFIG_CONTAINS_SECRET"
);

assertHttpCode(
  () => sanitizeSourceConfigForStorage(CollectionSourceType.SEARCH_API, {
    query: "sk-test-secret-value"
  }),
  "CONFIG_CONTAINS_SECRET"
);

assert.equal(
  sanitizeSecretRefForSourceType(CollectionSourceType.SEARCH_API, "bing_search_api_key"),
  "BING_SEARCH_API_KEY"
);

assertHttpCode(
  () => sanitizeSecretRefForSourceType(CollectionSourceType.SEARCH_API, "OPENAI_API_KEY"),
  "SECRET_REF_NOT_ALLOWED"
);

assertHttpCode(
  () => sanitizeSecretRefForSourceType(CollectionSourceType.MANUAL_IMPORT, "BING_SEARCH_API_KEY"),
  "SECRET_REF_NOT_ALLOWED"
);

const redacted = redactSourceConfigForResponse(CollectionSourceType.SEARCH_API, {
  query: "sk-history-secret",
  region: "cn",
  authorization: "Bearer should-not-return",
  resultLimit: 5,
  ignored: "hidden"
});

assert.deepEqual(redacted, {
  region: "cn",
  resultLimit: 5
});

const fakeSource: CollectionSource = {
  id: "00000000-0000-0000-0000-000000000001",
  organizationId: "00000000-0000-0000-0000-000000000002",
  projectId: null,
  name: "Bing",
  code: "bing_search",
  type: CollectionSourceType.SEARCH_API,
  status: CollectionSourceStatus.ACTIVE,
  config: {
    query: "sk-legacy-secret",
    region: "cn",
    cookie: "session=hidden"
  },
  secretRef: "BING_SEARCH_API_KEY",
  rateLimitPerHour: null,
  scheduleCron: null,
  lastRunAt: null,
  nextRunAt: null,
  healthStatus: CollectionHealthStatus.UNKNOWN,
  lastError: null,
  createdAt: new Date("2026-06-17T00:00:00Z"),
  updatedAt: new Date("2026-06-17T00:00:00Z")
};

const formatted = formatSource(fakeSource);
const formattedJson = JSON.stringify(formatted);

assert.equal("secretRef" in formatted, false);
assert.equal(formatted.secretConfigured, true);
assert.equal(formattedJson.includes("BING_SEARCH_API_KEY"), false);
assert.equal(formattedJson.includes("sk-legacy-secret"), false);
assert.equal(formattedJson.includes("cookie"), false);
assert.deepEqual(formatted.config, { region: "cn" });

console.log("Source Hub config policy regression tests passed.");

function assertHttpCode(fn: () => unknown, code: string) {
  assert.throws(
    fn,
    (error) => error instanceof HttpError && error.code === code
  );
}
