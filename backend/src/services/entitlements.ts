import {
  PaymentProvider,
  PlanInterval,
  SubscriptionStatus,
  UserRole,
  type Plan,
  type Prisma,
  type Subscription
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export type EntitlementKey =
  | "projects.create"
  | "questions.generate"
  | "monitor.run"
  | "content.generate"
  | "reports.generate"
  | "distribution.publish"
  | "competitors.advanced"
  | "automation.run"
  | "team.manage"
  | "models.dispatch"
  | "admin.access";

export interface EntitlementDecision {
  allowed: boolean;
  featureKey: EntitlementKey;
  reason?: string;
  remaining?: number | null;
  planCode?: string;
}

export interface EntitlementSnapshot {
  plan: {
    code: string;
    name: string;
    priceCents: number;
    currency: string;
    interval: string;
  };
  subscription: {
    id: string;
    status: string;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
  } | null;
  limits: {
    projects: number | null;
    aiQuestions: number | null;
    aiMonitorRuns: number | null;
    contentGeneration: number | null;
    reportGeneration: number | null;
    teamMembers: number | null;
    modelTokens: number | null;
    modelDispatch: number | null;
    sourceConnectors: number | null;
  };
  features: {
    multiPlatformDistribution: boolean;
    advancedCompetitorAnalysis: boolean;
    autoOptimizationTasks: boolean;
  };
  extraTokenPrice: string;
  usage: Record<string, number>;
}

type SubscriptionWithPlan = Subscription & { plan: Plan };

const ACTIVE_SUBSCRIPTION_STATUSES = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE
];

const planSeeds: Prisma.PlanUpsertArgs["create"][] = [
  {
    code: "free_trial",
    name: "免费试用版",
    description: "用于注册后体验核心看板、问题库和少量报告预览。",
    priceCents: 0,
    currency: "CNY",
    interval: PlanInterval.MONTH,
    seatLimit: 1,
    projectLimit: 1,
    questionLimit: 10,
    aiMonitorLimit: 10,
    contentLimit: 3,
    reportLimit: 3,
    aiTokenLimit: 20_000,
    modelDispatchLimit: 80,
    teamMemberLimit: 1,
    distributionEnabled: false,
    advancedCompetitorAnalysisEnabled: false,
    autoOptimizationEnabled: false,
    featureFlags: {
      inviteBonusMonitorRuns: 30,
      sourceConnectors: 2
    },
    active: true
  },
  {
    code: "starter",
    name: "入门版",
    description: "适合个人创作者和小团队起步使用。",
    priceCents: 19_900,
    currency: "CNY",
    interval: PlanInterval.MONTH,
    seatLimit: 1,
    projectLimit: 1,
    questionLimit: 120,
    aiMonitorLimit: 120,
    contentLimit: 20,
    reportLimit: 30,
    aiTokenLimit: 200_000,
    modelDispatchLimit: 800,
    teamMemberLimit: 1,
    distributionEnabled: false,
    advancedCompetitorAnalysisEnabled: false,
    autoOptimizationEnabled: false,
    featureFlags: {
      sourceConnectors: 4,
      extraTokenPrice: "超额 10 元 / 10 万 Token"
    },
    active: true
  },
  {
    code: "professional",
    name: "专业版",
    description: "适合增长团队使用多平台监控、内容任务和自动优化。",
    priceCents: 69_900,
    currency: "CNY",
    interval: PlanInterval.MONTH,
    seatLimit: 5,
    projectLimit: 5,
    questionLimit: 800,
    aiMonitorLimit: 800,
    contentLimit: 120,
    reportLimit: 999,
    aiTokenLimit: 1_000_000,
    modelDispatchLimit: 5_000,
    teamMemberLimit: 5,
    distributionEnabled: true,
    advancedCompetitorAnalysisEnabled: true,
    autoOptimizationEnabled: true,
    featureFlags: {
      sourceConnectors: 8,
      extraTokenPrice: "超额 8 元 / 10 万 Token"
    },
    active: true
  },
  {
    code: "enterprise",
    name: "企业套餐",
    description: "适合企业和服务商管理多品牌、多成员和高额度任务。",
    priceCents: 199_900,
    currency: "CNY",
    interval: PlanInterval.MONTH,
    seatLimit: 50,
    projectLimit: 20,
    questionLimit: 2_000,
    aiMonitorLimit: 2_000,
    contentLimit: 500,
    reportLimit: 999,
    aiTokenLimit: 5_000_000,
    modelDispatchLimit: 30_000,
    teamMemberLimit: 50,
    distributionEnabled: true,
    advancedCompetitorAnalysisEnabled: true,
    autoOptimizationEnabled: true,
    featureFlags: {
      sourceConnectors: 20,
      extraTokenPrice: "超额可按企业合同加购"
    },
    active: true
  }
];

let seedPromise: Promise<void> | null = null;

export async function ensurePlansSeeded() {
  seedPromise ??= seedPlans();
  await seedPromise;
}

export async function seedPlans() {
  for (const plan of planSeeds) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      create: plan,
      update: {
        name: plan.name,
        description: plan.description,
        priceCents: plan.priceCents,
        currency: plan.currency,
        interval: plan.interval,
        seatLimit: plan.seatLimit,
        projectLimit: plan.projectLimit,
        questionLimit: plan.questionLimit,
        aiMonitorLimit: plan.aiMonitorLimit,
        contentLimit: plan.contentLimit,
        reportLimit: plan.reportLimit,
        aiTokenLimit: plan.aiTokenLimit,
        modelDispatchLimit: plan.modelDispatchLimit,
        teamMemberLimit: plan.teamMemberLimit,
        distributionEnabled: plan.distributionEnabled,
        advancedCompetitorAnalysisEnabled: plan.advancedCompetitorAnalysisEnabled,
        autoOptimizationEnabled: plan.autoOptimizationEnabled,
        featureFlags: plan.featureFlags,
        active: plan.active
      }
    });
  }
}

export async function listPlans() {
  await ensurePlansSeeded();
  return prisma.plan.findMany({
    where: { active: true },
    orderBy: { priceCents: "asc" }
  });
}

export function formatPlanForClient(plan: Plan) {
  const flags = toRecord(plan.featureFlags);

  return {
    code: plan.code,
    name: plan.name,
    description: plan.description,
    priceCents: plan.priceCents,
    price: plan.priceCents === 0 ? "0 元" : `${plan.priceCents / 100} 元/月`,
    currency: plan.currency,
    interval: plan.interval.toLowerCase(),
    brandProjects: plan.projectLimit,
    aiQuestions: plan.questionLimit,
    aiMonitorRuns: plan.aiMonitorLimit,
    contentTasks: plan.contentLimit,
    reports: plan.reportLimit,
    modelTokens: plan.aiTokenLimit,
    modelCalls: plan.modelDispatchLimit,
    teamMembers: plan.teamMemberLimit,
    sourceConnectors: numberFrom(flags.sourceConnectors, 0),
    multiPlatformDistribution: plan.distributionEnabled,
    advancedCompetitorAnalysis: plan.advancedCompetitorAnalysisEnabled,
    autoOptimizationTasks: plan.autoOptimizationEnabled,
    extraTokenPrice: stringFrom(flags.extraTokenPrice, "按套餐规则"),
    featureFlags: flags
  };
}

export async function ensureDefaultSubscription(organizationId: string) {
  await ensurePlansSeeded();
  const existing = await getCurrentSubscription(organizationId);

  if (existing) {
    return existing;
  }

  const freePlan = await prisma.plan.findUniqueOrThrow({
    where: { code: "free_trial" }
  });
  const now = new Date();
  const trialEndsAt = addDays(now, 14);

  return prisma.subscription.create({
    data: {
      organizationId,
      planId: freePlan.id,
      status: SubscriptionStatus.TRIALING,
      provider: PaymentProvider.MANUAL,
      currentPeriodStart: now,
      currentPeriodEnd: trialEndsAt,
      trialEndsAt,
      usageCounters: {}
    },
    include: { plan: true }
  });
}

export async function getCurrentSubscription(organizationId: string) {
  const now = new Date();

  return prisma.subscription.findFirst({
    where: {
      organizationId,
      status: { in: ACTIVE_SUBSCRIPTION_STATUSES },
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }]
    },
    include: { plan: true },
    orderBy: { updatedAt: "desc" }
  });
}

export async function getEntitlementSnapshotForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      organizationId: true
    }
  });

  if (!user?.organizationId) {
    return null;
  }

  if (isAdminRole(user.role)) {
    return adminEntitlementSnapshot();
  }

  if (isFullAccessTestUser(user.email)) {
    return fullAccessTestEntitlementSnapshot();
  }

  const subscription = await ensureDefaultSubscription(user.organizationId);
  return snapshotFromSubscription(subscription);
}

export async function checkEntitlement(
  userId: string,
  featureKey: EntitlementKey
): Promise<EntitlementDecision> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      role: true,
      organizationId: true
    }
  });

  if (!user?.organizationId) {
    return {
      allowed: false,
      featureKey,
      reason: "User does not belong to an organization."
    };
  }

  if (isAdminRole(user.role) || isFullAccessTestUser(user.email)) {
    return {
      allowed: true,
      featureKey,
      remaining: null,
      planCode: isAdminRole(user.role) ? "admin" : "enterprise"
    };
  }

  const subscription = await getCurrentSubscription(user.organizationId);

  if (!subscription) {
    return {
      allowed: false,
      featureKey,
      reason: "No active subscription was found."
    };
  }

  const snapshot = snapshotFromSubscription(subscription);
  const used = snapshot.usage;

  switch (featureKey) {
    case "projects.create":
      return limitDecision(featureKey, subscription.plan.code, snapshot.limits.projects, used.projects);
    case "questions.generate":
      return limitDecision(featureKey, subscription.plan.code, snapshot.limits.aiQuestions, used.aiQuestions);
    case "monitor.run":
      return limitDecision(featureKey, subscription.plan.code, snapshot.limits.aiMonitorRuns, used.aiMonitorRuns);
    case "content.generate":
      return limitDecision(featureKey, subscription.plan.code, snapshot.limits.contentGeneration, used.contentGeneration);
    case "reports.generate":
      return limitDecision(featureKey, subscription.plan.code, snapshot.limits.reportGeneration, used.reportGeneration);
    case "team.manage":
      return limitDecision(featureKey, subscription.plan.code, snapshot.limits.teamMembers, used.teamMembers);
    case "models.dispatch":
      return limitDecision(featureKey, subscription.plan.code, snapshot.limits.modelDispatch, used.modelDispatch);
    case "distribution.publish":
      return booleanDecision(
        featureKey,
        subscription.plan.code,
        snapshot.features.multiPlatformDistribution,
        "Multi-platform distribution is not included in the current plan."
      );
    case "competitors.advanced":
      return booleanDecision(
        featureKey,
        subscription.plan.code,
        snapshot.features.advancedCompetitorAnalysis,
        "Advanced competitor analysis is not included in the current plan."
      );
    case "automation.run":
      return booleanDecision(
        featureKey,
        subscription.plan.code,
        snapshot.features.autoOptimizationTasks,
        "Auto optimization tasks are not included in the current plan."
      );
    case "admin.access":
      return {
        allowed: false,
        featureKey,
        planCode: subscription.plan.code,
        reason: "Administrator role is required."
      };
  }
}

export function snapshotFromSubscription(subscription: SubscriptionWithPlan): EntitlementSnapshot {
  const plan = subscription.plan;
  const flags = toRecord(plan.featureFlags);
  const usage = normalizeUsage(subscription.usageCounters);

  return {
    plan: {
      code: plan.code,
      name: plan.name,
      priceCents: plan.priceCents,
      currency: plan.currency,
      interval: plan.interval.toLowerCase()
    },
    subscription: {
      id: subscription.id,
      status: subscription.status.toLowerCase(),
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null
    },
    limits: {
      projects: plan.projectLimit,
      aiQuestions: plan.questionLimit,
      aiMonitorRuns: plan.aiMonitorLimit,
      contentGeneration: plan.contentLimit,
      reportGeneration: plan.reportLimit,
      teamMembers: plan.teamMemberLimit,
      modelTokens: plan.aiTokenLimit,
      modelDispatch: plan.modelDispatchLimit,
      sourceConnectors: numberFrom(flags.sourceConnectors, 0)
    },
    features: {
      multiPlatformDistribution: plan.distributionEnabled,
      advancedCompetitorAnalysis: plan.advancedCompetitorAnalysisEnabled,
      autoOptimizationTasks: plan.autoOptimizationEnabled
    },
    extraTokenPrice: stringFrom(flags.extraTokenPrice, "按套餐规则"),
    usage
  };
}

export function formatEntitlementsForClient(snapshot: EntitlementSnapshot | null) {
  if (!snapshot) {
    return null;
  }

  return {
    plan: snapshot.plan.name,
    planCode: snapshot.plan.code,
    status: snapshot.subscription?.status ?? "active",
    statusText: snapshot.subscription?.status === "trialing" ? "试用中" : "已开通",
    brandProjects: snapshot.limits.projects,
    aiQuestions: snapshot.limits.aiQuestions,
    aiMonitorRuns: snapshot.limits.aiMonitorRuns,
    contentTasks: snapshot.limits.contentGeneration,
    reports: snapshot.limits.reportGeneration,
    modelTokens: snapshot.limits.modelTokens,
    modelCalls: snapshot.limits.modelDispatch,
    teamMembers: snapshot.limits.teamMembers,
    sourceConnectors: snapshot.limits.sourceConnectors,
    extraTokenPrice: snapshot.extraTokenPrice,
    multiPlatformDistribution: snapshot.features.multiPlatformDistribution,
    advancedCompetitorAnalysis: snapshot.features.advancedCompetitorAnalysis,
    autoOptimizationTasks: snapshot.features.autoOptimizationTasks,
    usage: snapshot.usage,
    subscription: snapshot.subscription,
    features: snapshot.features,
    limits: snapshot.limits
  };
}

function limitDecision(
  featureKey: EntitlementKey,
  planCode: string,
  limit: number | null,
  used = 0
): EntitlementDecision {
  if (limit === null) {
    return { allowed: true, featureKey, remaining: null, planCode };
  }

  const remaining = Math.max(limit - used, 0);

  if (remaining <= 0) {
    return {
      allowed: false,
      featureKey,
      remaining,
      planCode,
      reason: "The current plan quota has been exhausted."
    };
  }

  return {
    allowed: true,
    featureKey,
    remaining,
    planCode
  };
}

function booleanDecision(
  featureKey: EntitlementKey,
  planCode: string,
  allowed: boolean,
  reason: string
): EntitlementDecision {
  return allowed
    ? { allowed: true, featureKey, planCode }
    : { allowed: false, featureKey, planCode, reason };
}

function normalizeUsage(value: Prisma.JsonValue | null): Record<string, number> {
  const raw = toRecord(value);
  const result: Record<string, number> = {};

  for (const [key, val] of Object.entries(raw)) {
    result[key] = numberFrom(val, 0);
  }

  return result;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function numberFrom(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringFrom(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

function isAdminRole(role: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}

function isFullAccessTestUser(email: string | null | undefined) {
  const allowList = (process.env.FULL_ACCESS_TEST_EMAILS || "test@citeox.com")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return Boolean(email && allowList.includes(email.toLowerCase()));
}

function adminEntitlementSnapshot(): EntitlementSnapshot {
  return {
    plan: {
      code: "admin",
      name: "管理员全功能版",
      priceCents: 0,
      currency: "CNY",
      interval: "month"
    },
    subscription: null,
    limits: {
      projects: null,
      aiQuestions: null,
      aiMonitorRuns: null,
      contentGeneration: null,
      reportGeneration: null,
      teamMembers: null,
      modelTokens: null,
      modelDispatch: null,
      sourceConnectors: null
    },
    features: {
      multiPlatformDistribution: true,
      advancedCompetitorAnalysis: true,
      autoOptimizationTasks: true
    },
    extraTokenPrice: "管理员不限额",
    usage: {}
  };
}

function fullAccessTestEntitlementSnapshot(): EntitlementSnapshot {
  return {
    ...adminEntitlementSnapshot(),
    plan: {
      code: "enterprise",
      name: "测试全权益版",
      priceCents: 0,
      currency: "CNY",
      interval: "month"
    },
    extraTokenPrice: "测试账号不限额"
  };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
