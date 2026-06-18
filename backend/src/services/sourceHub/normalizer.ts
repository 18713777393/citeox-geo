import { createHash } from "node:crypto";
import { CollectionItemStatus, type Prisma } from "@prisma/client";
import { HttpError } from "../../middleware/error.js";
import type { CollectionItemCreateInput, RawCollectionItem } from "./types.js";
import { assertSafePublicHttpUrl, safeDomainFromUrl } from "./safeUrl.js";

const maxTitleLength = 240;
const maxTextLength = 5_000;
const maxKeywordCount = 20;

export interface NormalizeContext {
  organizationId: string;
  projectId?: string | null;
  sourceId: string;
  jobId?: string | null;
}

export function normalizeRawCollectionItem(
  raw: RawCollectionItem,
  ctx: NormalizeContext
): CollectionItemCreateInput | null {
  const rawTitle = sanitizePlainText(raw.title).slice(0, maxTitleLength);

  if (!rawTitle) {
    return null;
  }

  const rawText = optionalSanitized(raw.text, maxTextLength);
  const url = normalizeOptionalUrl(raw.sourceUrl ?? raw.url);
  const keywords = normalizeKeywords(raw.keywords);
  const language = optionalSanitized(raw.language, 20) ?? "zh-CN";
  const contentHash = fingerprint([
    ctx.organizationId,
    ctx.sourceId,
    rawTitle.toLowerCase(),
    url ?? "",
    rawText?.slice(0, 800) ?? ""
  ].join("\n"));

  return {
    organizationId: ctx.organizationId,
    projectId: ctx.projectId ?? undefined,
    sourceId: ctx.sourceId,
    jobId: ctx.jobId ?? undefined,
    rawTitle,
    rawText,
    url,
    domain: optionalSanitized(raw.domain, 180) ?? safeDomainFromUrl(url),
    author: optionalSanitized(raw.author, 120),
    publishedAt: normalizeDate(raw.publishedAt),
    language,
    contentHash,
    intent: optionalSanitized(raw.intent, 80) ?? inferIntent(rawTitle),
    keywords: keywords.length ? keywords as Prisma.InputJsonArray : undefined,
    qualityScore: clampScore(raw.qualityScore ?? scoreTitle(rawTitle, rawText)),
    trustScore: clampScore(raw.trustScore ?? (url ? 70 : 55)),
    status: CollectionItemStatus.NEW,
    metadata: sanitizeMetadata(raw.metadata)
  };
}

export function sanitizePlainText(value: string | undefined): string {
  return (value ?? "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, " ")
    .replace(/javascript:/gi, "")
    .replace(/data:text\/html/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeConfig(config: Record<string, unknown> | undefined): Prisma.InputJsonObject | undefined {
  if (!config) {
    return undefined;
  }

  const cleaned = sanitizeObject(config, 0);
  return Object.keys(cleaned).length ? cleaned : undefined;
}

export function sanitizeMetadata(metadata: Record<string, unknown> | undefined): Prisma.InputJsonObject | undefined {
  if (!metadata) {
    return undefined;
  }

  const cleaned = sanitizeObject(metadata, 0);
  return Object.keys(cleaned).length ? cleaned : undefined;
}

function sanitizeObject(value: Record<string, unknown>, depth: number): Prisma.InputJsonObject {
  const result: Record<string, Prisma.InputJsonValue> = {};

  if (depth > 3) {
    return result;
  }

  for (const [key, rawValue] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      continue;
    }

    const cleanKey = key.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);

    if (!cleanKey) {
      continue;
    }

    const sanitized = sanitizeJsonValue(rawValue, depth + 1);

    if (sanitized !== undefined) {
      result[cleanKey] = sanitized;
    }
  }

  return result as Prisma.InputJsonObject;
}

function sanitizeJsonValue(value: unknown, depth: number): Prisma.InputJsonValue | undefined {
  if (value === null) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string") {
    return sanitizePlainText(value).slice(0, 1_000);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) => sanitizeJsonValue(item, depth + 1))
      .filter((item): item is Prisma.InputJsonValue => item !== undefined) as Prisma.InputJsonArray;
  }

  if (typeof value === "object" && value) {
    return sanitizeObject(value as Record<string, unknown>, depth + 1);
  }

  return undefined;
}

function normalizeOptionalUrl(value: string | undefined) {
  if (!value?.trim()) {
    return undefined;
  }

  return assertSafePublicHttpUrl(value);
}

function optionalSanitized(value: string | undefined, maxLength: number) {
  const sanitized = sanitizePlainText(value).slice(0, maxLength);
  return sanitized || undefined;
}

function normalizeKeywords(value: string[] | undefined) {
  if (!value) {
    return [];
  }

  return value
    .map((keyword) => sanitizePlainText(keyword).slice(0, 80))
    .filter(Boolean)
    .slice(0, maxKeywordCount);
}

function normalizeDate(value: string | Date | undefined) {
  if (!value) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, "INVALID_PUBLISHED_AT", "Published date is invalid.");
  }

  return date;
}

function inferIntent(title: string) {
  const normalized = title.toLowerCase();

  if (/compare|vs|versus|对比|比较/.test(normalized)) return "comparison";
  if (/price|pricing|成本|费用|价格/.test(normalized)) return "pricing";
  if (/how|教程|怎么|如何/.test(normalized)) return "how_to";
  if (/case|案例/.test(normalized)) return "case";
  return "faq";
}

function scoreTitle(title: string, text: string | undefined) {
  const lengthScore = title.length >= 12 && title.length <= 120 ? 50 : 35;
  const questionScore = /[?？]|how|what|why|which|如何|什么|为什么|哪/.test(title.toLowerCase()) ? 25 : 10;
  const contextScore = text && text.length > 20 ? 15 : 5;
  return lengthScore + questionScore + contextScore;
}

function clampScore(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function isSensitiveKey(key: string) {
  return /secret|token|password|cookie|api[-_]?key|authorization|credential/i.test(key);
}
