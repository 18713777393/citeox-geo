import { CollectionSourceType, type Prisma } from "@prisma/client";
import { HttpError } from "../../middleware/error.js";
import { assertSafePublicHttpUrl } from "./safeUrl.js";

type ConfigFieldKind =
  | "string"
  | "number"
  | "boolean"
  | "stringArray"
  | "url"
  | "urlArray";

type ConfigPolicy = Partial<Record<string, ConfigFieldKind>>;

export const allowedSecretRefs = [
  "BING_SEARCH_API_KEY",
  "BRAVE_SEARCH_API_KEY",
  "TAVILY_API_KEY",
  "SERPAPI_API_KEY"
] as const;

const sourceConfigPolicies: Record<CollectionSourceType, ConfigPolicy> = {
  [CollectionSourceType.MANUAL_IMPORT]: {
    mode: "string",
    defaultLanguage: "string",
    labels: "stringArray"
  },
  [CollectionSourceType.SEARCH_API]: {
    query: "string",
    keywords: "stringArray",
    language: "string",
    region: "string",
    safeSearch: "boolean",
    resultLimit: "number"
  },
  [CollectionSourceType.SITEMAP]: {
    sitemapUrl: "url",
    urls: "urlArray",
    domain: "string",
    includePatterns: "stringArray",
    excludePatterns: "stringArray",
    respectRobots: "boolean"
  },
  [CollectionSourceType.RSS]: {
    feedUrl: "url",
    urls: "urlArray",
    language: "string",
    category: "string"
  },
  [CollectionSourceType.WEBSITE]: {
    url: "url",
    urls: "urlArray",
    allowedDomains: "stringArray",
    includePatterns: "stringArray",
    excludePatterns: "stringArray",
    respectRobots: "boolean"
  },
  [CollectionSourceType.SOCIAL_PUBLIC]: {
    platform: "string",
    publicUrl: "url",
    keywords: "stringArray",
    complianceNote: "string"
  },
  [CollectionSourceType.AI_PLATFORM]: {
    provider: "string",
    language: "string",
    keywords: "stringArray"
  }
};

const redlineKeyPattern = /(secret|token|cookie|authorization|password|credential|api[-_]?key)/i;
const redlineValuePattern = /\bsk-[a-z0-9_-]{6,}|authorization|cookie|token/i;

export function sanitizeSourceConfigForStorage(
  type: CollectionSourceType,
  config: Record<string, unknown> | undefined
): Prisma.InputJsonObject | undefined {
  if (!config) {
    return undefined;
  }

  assertNoRedlineValues(config);
  return pickAllowedConfig(type, config, "store");
}

export function redactSourceConfigForResponse(
  type: CollectionSourceType,
  config: Prisma.JsonValue | null | undefined
): Prisma.InputJsonObject {
  const record = toRecord(config);

  if (!record) {
    return {};
  }

  return pickAllowedConfig(type, record, "response") ?? {};
}

export function sanitizeSecretRefForSourceType(
  type: CollectionSourceType,
  secretRef: string | undefined
): string | undefined {
  if (!secretRef) {
    return undefined;
  }

  const normalized = secretRef.trim().toUpperCase();

  if (type !== CollectionSourceType.SEARCH_API) {
    throw new HttpError(400, "SECRET_REF_NOT_ALLOWED", "This source type cannot reference a secret.");
  }

  if (!allowedSecretRefs.includes(normalized as (typeof allowedSecretRefs)[number])) {
    throw new HttpError(400, "SECRET_REF_NOT_ALLOWED", "Secret reference is not allowed for Source Hub.");
  }

  return normalized;
}

export function assertConfigHasNoRedlineValues(value: unknown): void {
  assertNoRedlineValues(value);
}

function pickAllowedConfig(
  type: CollectionSourceType,
  config: Record<string, unknown>,
  mode: "store" | "response"
): Prisma.InputJsonObject | undefined {
  const policy = sourceConfigPolicies[type];
  const cleaned: Record<string, Prisma.InputJsonValue> = {};

  for (const [key, kind] of Object.entries(policy)) {
    if (!kind) {
      continue;
    }

    if (!(key in config)) {
      continue;
    }

    try {
      assertNoRedlineValues(config[key], [key]);
      const value = sanitizeAllowedValue(config[key], kind);

      if (value !== undefined) {
        cleaned[key] = value;
      }
    } catch (error) {
      if (mode === "store") {
        throw error;
      }
    }
  }

  return Object.keys(cleaned).length ? cleaned as Prisma.InputJsonObject : undefined;
}

function sanitizeAllowedValue(value: unknown, kind: ConfigFieldKind): Prisma.InputJsonValue | undefined {
  switch (kind) {
    case "string":
      return sanitizeString(value, 500);
    case "number":
      return sanitizeNumber(value);
    case "boolean":
      return typeof value === "boolean" ? value : undefined;
    case "stringArray":
      return sanitizeStringArray(value);
    case "url": {
      const url = sanitizeString(value, 2_000);
      return url ? assertSafePublicHttpUrl(url) : undefined;
    }
    case "urlArray":
      return sanitizeUrlArray(value);
  }
}

function sanitizeString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const cleaned = value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, " ")
    .replace(/javascript:/gi, "")
    .replace(/data:text\/html/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

  return cleaned || undefined;
}

function sanitizeNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(10_000, Math.round(value)));
}

function sanitizeStringArray(value: unknown): Prisma.InputJsonArray | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((item) => sanitizeString(item, 120))
    .filter((item): item is string => Boolean(item))
    .slice(0, 50);

  return items.length ? items : undefined;
}

function sanitizeUrlArray(value: unknown): Prisma.InputJsonArray | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((item) => typeof item === "string" ? item : undefined)
    .filter((item): item is string => Boolean(item))
    .slice(0, 20)
    .flatMap((item) => {
      try {
        return [assertSafePublicHttpUrl(item)];
      } catch {
        return [];
      }
    });

  return items.length ? items : undefined;
}

function assertNoRedlineValues(value: unknown, path: string[] = []): void {
  if (typeof value === "string") {
    if (redlineValuePattern.test(value)) {
      throw new HttpError(400, "CONFIG_CONTAINS_SECRET", "Source config cannot contain secrets or credential-like values.");
    }

    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRedlineValues(item, [...path, String(index)]));
    return;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (redlineKeyPattern.test(key)) {
      throw new HttpError(400, "CONFIG_CONTAINS_SECRET", "Source config cannot contain secrets or credential-like fields.");
    }

    assertNoRedlineValues(child, [...path, key]);
  }
}

function toRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}
