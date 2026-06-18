import "../config/env.js";
import { randomUUID } from "node:crypto";
import {
  ModelProviderStatus,
  SubscriptionStatus,
  type ModelProvider,
  type Prisma
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";
import type { AuthContext } from "../middleware/auth.js";
import {
  checkEntitlement,
  type EntitlementKey
} from "./entitlements.js";
import { recordAuditEvent } from "./audit.js";

type UsageIncrementKey =
  | "aiQuestions"
  | "aiMonitorRuns"
  | "contentGeneration"
  | "reportGeneration"
  | "modelDispatch"
  | "modelTokens";

export interface AiProviderInfo {
  code: string;
  name: string;
  configured: boolean;
  status: "active" | "disabled";
  features: string[];
}

export interface AiGatewayInput {
  auth: AuthContext;
  featureKey: EntitlementKey;
  providerCode?: string;
  model?: string;
  input?: string;
  projectId?: string;
  operation: string;
  metadata?: Record<string, unknown>;
}

export interface AiGatewayResult {
  requestId: string;
  provider: {
    id: string;
    code: string;
    name: string;
    configured: boolean;
  };
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    remaining: number | null;
  };
  output: {
    summary: string;
    mode: "placeholder";
  };
}

const providerRegistry = [
  { code: "openai", name: "OpenAI", envKey: "OPENAI_API_KEY", features: ["text", "report"] },
  { code: "deepseek", name: "DeepSeek", envKey: "DEEPSEEK_API_KEY", features: ["text", "analysis"] },
  { code: "kimi", name: "Kimi", envKey: "KIMI_API_KEY", features: ["text", "long_context"] },
  { code: "doubao", name: "Doubao", envKey: "DOUBAO_API_KEY", features: ["text", "content"] },
  { code: "gemini", name: "Gemini", envKey: "GEMINI_API_KEY", features: ["text", "monitor"] },
  { code: "claude", name: "Claude", envKey: "CLAUDE_API_KEY", features: ["text", "report"] },
  { code: "tongyi", name: "Tongyi", envKey: "TONGYI_API_KEY", features: ["text"] },
  { code: "xunfei", name: "Xunfei", envKey: "XUNFEI_API_KEY", features: ["text"] },
  { code: "qianfan", name: "Qianfan", envKey: "QIANFAN_API_KEY", features: ["text"] },
  { code: "zhipu", name: "Zhipu", envKey: "ZHIPU_API_KEY", features: ["text"] },
  { code: "perplexity", name: "Perplexity", envKey: "PERPLEXITY_API_KEY", features: ["monitor", "research"] }
] as const;

export function listAiProviders(): AiProviderInfo[] {
  return providerRegistry.map((provider) => {
    const configured = hasProviderKey(provider.envKey);

    return {
      code: provider.code,
      name: provider.name,
      configured,
      status: configured ? "active" : "disabled",
      features: [...provider.features]
    };
  });
}

export async function invokeAiGateway(input: AiGatewayInput): Promise<AiGatewayResult> {
  const decision = await checkEntitlement(input.auth.userId, input.featureKey);

  if (!decision.allowed) {
    throw new HttpError(
      403,
      "ENTITLEMENT_REQUIRED",
      decision.reason ?? "The current plan does not include this feature."
    );
  }

  const providerDefinition =
    providerRegistry.find((provider) => provider.code === input.providerCode) ??
    providerRegistry.find((provider) => hasProviderKey(provider.envKey)) ??
    providerRegistry[0];

  if (!providerDefinition) {
    throw new HttpError(500, "AI_PROVIDER_UNAVAILABLE", "No AI provider registry is available.");
  }

  const configured = hasProviderKey(providerDefinition.envKey);
  const provider = await upsertProvider(providerDefinition, configured);
  const requestId = randomUUID();
  const promptTokens = estimateTokens(input.input ?? input.operation);
  const completionTokens = Math.max(96, Math.min(512, Math.ceil(promptTokens * 0.45)));
  const totalTokens = promptTokens + completionTokens;
  const usageRemaining = decrementRemaining(decision.remaining, totalTokens);

  const usageLog = await prisma.aiUsageLog.create({
    data: {
      organizationId: input.auth.organizationId,
      projectId: input.projectId,
      userId: input.auth.userId,
      modelProviderId: provider.id,
      requestId,
      featureKey: input.featureKey,
      model: input.model ?? defaultModelFor(providerDefinition.code),
      promptTokens,
      completionTokens,
      totalTokens,
      costCents: 0,
      status: configured ? "succeeded" : "placeholder",
      metadata: {
        operation: input.operation,
        providerConfigured: configured,
        phase: "phase3",
        mode: "safe_placeholder",
        ...sanitizeMetadata(input.metadata)
      } as Prisma.InputJsonValue
    }
  });

  await incrementQuotaUsage(input.auth.organizationId, usageIncrements(input.featureKey, totalTokens));

  await recordAuditEvent({
    organizationId: input.auth.organizationId,
    actorUserId: input.auth.userId,
    action: "ai.call",
    resourceType: "ai_usage_log",
    resourceId: usageLog.id,
    severity: "info",
    metadata: {
      featureKey: input.featureKey,
      provider: providerDefinition.code,
      requestId,
      totalTokens,
      projectId: input.projectId
    }
  });

  return {
    requestId,
    provider: {
      id: provider.id,
      code: provider.code,
      name: provider.name,
      configured
    },
    model: input.model ?? defaultModelFor(providerDefinition.code),
    usage: {
      promptTokens,
      completionTokens,
      totalTokens,
      remaining: usageRemaining
    },
    output: {
      summary: `${input.operation} completed through the Phase 3 AI gateway.`,
      mode: "placeholder"
    }
  };
}

async function upsertProvider(
  definition: (typeof providerRegistry)[number],
  configured: boolean
): Promise<ModelProvider> {
  return prisma.modelProvider.upsert({
    where: { code: definition.code },
    create: {
      code: definition.code,
      name: definition.name,
      status: configured ? ModelProviderStatus.ACTIVE : ModelProviderStatus.DISABLED,
      priority: configured ? 10 : 100,
      config: {
        envKey: definition.envKey,
        keyConfigured: configured,
        keySource: ".env"
      }
    },
    update: {
      name: definition.name,
      status: configured ? ModelProviderStatus.ACTIVE : ModelProviderStatus.DISABLED,
      priority: configured ? 10 : 100,
      config: {
        envKey: definition.envKey,
        keyConfigured: configured,
        keySource: ".env"
      }
    }
  });
}

async function incrementQuotaUsage(
  organizationId: string,
  increments: Partial<Record<UsageIncrementKey, number>>
) {
  const subscription = await prisma.subscription.findFirst({
    where: {
      organizationId,
      status: { in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE] },
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }]
    },
    orderBy: { updatedAt: "desc" }
  });

  if (!subscription) {
    return;
  }

  const current = toNumberRecord(subscription.usageCounters);

  for (const [key, value] of Object.entries(increments)) {
    current[key] = (current[key] ?? 0) + value;
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      usageCounters: current as Prisma.InputJsonValue
    }
  });
}

function usageIncrements(featureKey: EntitlementKey, totalTokens: number): Partial<Record<UsageIncrementKey, number>> {
  const base: Partial<Record<UsageIncrementKey, number>> = {
    modelDispatch: 1,
    modelTokens: totalTokens
  };

  switch (featureKey) {
    case "questions.generate":
      return { ...base, aiQuestions: 1 };
    case "monitor.run":
      return { ...base, aiMonitorRuns: 1 };
    case "content.generate":
      return { ...base, contentGeneration: 1 };
    case "reports.generate":
      return { ...base, reportGeneration: 1 };
    case "models.dispatch":
      return base;
    default:
      return {};
  }
}

function estimateTokens(value: string) {
  const chars = value.trim().length;
  return Math.max(32, Math.min(4096, Math.ceil(chars / 3.5)));
}

function decrementRemaining(remaining: number | null | undefined, totalTokens: number) {
  if (remaining === null || remaining === undefined) {
    return remaining ?? null;
  }

  return Math.max(remaining - Math.max(1, Math.ceil(totalTokens / 500)), 0);
}

function hasProviderKey(envKey: string) {
  return Boolean((process.env[envKey] ?? "").trim());
}

function defaultModelFor(providerCode: string) {
  return `${providerCode}-phase3-placeholder`;
}

function sanitizeMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (/key|secret|token|prompt/i.test(key)) {
      continue;
    }

    if (typeof value === "string") {
      sanitized[key] = value.slice(0, 240);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      sanitized[key] = value;
    } else if (Array.isArray(value)) {
      sanitized[key] = value.slice(0, 20).map((item) => (typeof item === "string" ? item.slice(0, 120) : item));
    }
  }

  return sanitized;
}

function toNumberRecord(value: Prisma.JsonValue | null): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, number> = {};

  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      result[key] = raw;
    }
  }

  return result;
}
