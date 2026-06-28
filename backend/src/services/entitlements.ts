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
import { hashEmail } from "./authSecurity.js";

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

const activeSubscriptionStatuses = [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE];

const planSeeds: Prisma.PlanCreateInput[] = [
  {
    code: "free",
    name: "免费版",
    description: "适合首次体验品牌创建、基础看板和 AI 问题库。",
    priceCents: 0,
    currency: "CNY",
    interval: PlanInterval.MONTH,
    seatLimit: 1,
    projectLimit: 1,
    questionLimit: 20,
    aiMonitorLimit: 20,
    contentLimit: 0,
    reportLimit: 0,
    aiTokenLimit: null,
    modelDispatchLimit: 1,
    teamMemberLimit: 1,
    distributionEnabled: false,
    advancedCompetitorAnalysisEnabled: false,
    autoOptimizationEnabled: false,
    featureFlags: {
      displayName: "免费版",
      billingCycle: "monthly",
      modelLimit: 1,
      brandLimit: 1,
      dailyRefreshLimit: 1,
      materialLimit: 0,
      recommended: false,
      modelProviders: ["deepseek"],
      enabledModules: ["dashboard", "project", "questions"],
      support: "在线文档"
    },
    active: true
  },
  {
    code: "personal_month",
    name: "个人版",
    description: "适合个人品牌和小型商家，开放更多 AI 模型、回答监控和基础内容能力。",
    priceCents: 49_900,
    currency: "CNY",
    interval: PlanInterval.MONTH,
    seatLimit: 1,
    projectLimit: 2,
    questionLimit: 120,
    aiMonitorLimit: 120,
    contentLimit: 10,
    reportLimit: 0,
    aiTokenLimit: null,
    modelDispatchLimit: 2,
    teamMemberLimit: 1,
    distributionEnabled: false,
    advancedCompetitorAnalysisEnabled: false,
    autoOptimizationEnabled: false,
    featureFlags: {
      displayName: "个人版",
      billingCycle: "monthly",
      monthlyPriceCents: 49_900,
      yearlyPriceCents: 499_900,
      modelLimit: 2,
      brandLimit: 2,
      dailyRefreshLimit: 2,
      materialLimit: 50,
      modelProviders: ["deepseek", "doubao"],
      enabledModules: ["dashboard", "project", "questions", "monitor", "strategy", "assets", "factory"],
      support: "邮件工单（48h）",
      extraTokenPrice: "AI 调用费用由用户余额按次扣除"
    },
    active: true
  },
  {
    code: "personal_year",
    name: "个人版",
    description: "个人版年付，适合稳定运营个人品牌，年付约省17%。",
    priceCents: 499_900,
    currency: "CNY",
    interval: PlanInterval.YEAR,
    seatLimit: 1,
    projectLimit: 2,
    questionLimit: 120,
    aiMonitorLimit: 120,
    contentLimit: 10,
    reportLimit: 0,
    aiTokenLimit: null,
    modelDispatchLimit: 2,
    teamMemberLimit: 1,
    distributionEnabled: false,
    advancedCompetitorAnalysisEnabled: false,
    autoOptimizationEnabled: false,
    featureFlags: {
      displayName: "个人版",
      billingCycle: "yearly",
      monthlyPriceCents: 49_900,
      yearlyPriceCents: 499_900,
      discountLabel: "省17%",
      modelLimit: 2,
      brandLimit: 2,
      dailyRefreshLimit: 2,
      materialLimit: 50,
      modelProviders: ["deepseek", "doubao"],
      enabledModules: ["dashboard", "project", "questions", "monitor", "strategy", "assets", "factory"],
      support: "邮件工单（48h）",
      extraTokenPrice: "AI 调用费用由用户余额按次扣除"
    },
    active: true
  },
  {
    code: "pro_month",
    name: "专业版",
    description: "主推套餐，适合希望系统化提升 AI 搜索可见度的品牌和公司。",
    priceCents: 89_900,
    currency: "CNY",
    interval: PlanInterval.MONTH,
    seatLimit: 5,
    projectLimit: 5,
    questionLimit: 800,
    aiMonitorLimit: 800,
    contentLimit: 50,
    reportLimit: 999,
    aiTokenLimit: null,
    modelDispatchLimit: 4,
    teamMemberLimit: 5,
    distributionEnabled: true,
    advancedCompetitorAnalysisEnabled: true,
    autoOptimizationEnabled: true,
    featureFlags: {
      displayName: "专业版",
      billingCycle: "monthly",
      monthlyPriceCents: 89_900,
      yearlyPriceCents: 899_900,
      modelLimit: 4,
      brandLimit: 5,
      dailyRefreshLimit: 4,
      materialLimit: 200,
      recommended: true,
      modelProviders: ["doubao", "yuanbao", "deepseek", "tongyi"],
      enabledModules: [
        "dashboard",
        "project",
        "questions",
        "monitor",
        "scoring",
        "gap",
        "strategy",
        "assets",
        "factory",
        "distribution",
        "recheck",
        "automation",
        "report"
      ],
      support: "优先工单（24h）",
      extraTokenPrice: "AI 调用费用由用户余额按次扣除"
    },
    active: true
  },
  {
    code: "pro_year",
    name: "专业版",
    description: "专业版年付，适合持续投放内容和复盘优化的品牌团队，年付约省17%。",
    priceCents: 899_900,
    currency: "CNY",
    interval: PlanInterval.YEAR,
    seatLimit: 5,
    projectLimit: 5,
    questionLimit: 800,
    aiMonitorLimit: 800,
    contentLimit: 50,
    reportLimit: 999,
    aiTokenLimit: null,
    modelDispatchLimit: 4,
    teamMemberLimit: 5,
    distributionEnabled: true,
    advancedCompetitorAnalysisEnabled: true,
    autoOptimizationEnabled: true,
    featureFlags: {
      displayName: "专业版",
      billingCycle: "yearly",
      monthlyPriceCents: 89_900,
      yearlyPriceCents: 899_900,
      discountLabel: "省17%",
      modelLimit: 4,
      brandLimit: 5,
      dailyRefreshLimit: 4,
      materialLimit: 200,
      recommended: true,
      modelProviders: ["doubao", "yuanbao", "deepseek", "tongyi"],
      enabledModules: [
        "dashboard",
        "project",
        "questions",
        "monitor",
        "scoring",
        "gap",
        "strategy",
        "assets",
        "factory",
        "distribution",
        "recheck",
        "automation",
        "report"
      ],
      support: "优先工单（24h）",
      extraTokenPrice: "AI 调用费用由用户余额按次扣除"
    },
    active: true
  },
  {
    code: "enterprise_month",
    name: "企业版",
    description: "适合集团、多品牌、服务商和高频自动化使用场景。",
    priceCents: 399_900,
    currency: "CNY",
    interval: PlanInterval.MONTH,
    seatLimit: 50,
    projectLimit: null,
    questionLimit: null,
    aiMonitorLimit: null,
    contentLimit: null,
    reportLimit: null,
    aiTokenLimit: null,
    modelDispatchLimit: null,
    teamMemberLimit: 50,
    distributionEnabled: true,
    advancedCompetitorAnalysisEnabled: true,
    autoOptimizationEnabled: true,
    featureFlags: {
      displayName: "企业版",
      billingCycle: "monthly",
      monthlyPriceCents: 399_900,
      yearlyPriceCents: 3_999_900,
      modelLimit: null,
      brandLimit: null,
      dailyRefreshLimit: null,
      materialLimit: null,
      modelProviders: ["doubao", "yuanbao", "deepseek", "tongyi", "wenxin", "zhipu", "kimi", "metaso", "ai360", "xinghuo"],
      enabledModules: ["all"],
      support: "专属经理（2h 内响应）",
      extraTokenPrice: "AI 调用费用由用户余额按次扣除，可按企业合同结算"
    },
    active: true
  },
  {
    code: "enterprise_year",
    name: "企业版",
    description: "企业版年付，适合多品牌团队长期托管和高频自动化。",
    priceCents: 3_999_900,
    currency: "CNY",
    interval: PlanInterval.YEAR,
    seatLimit: 50,
    projectLimit: null,
    questionLimit: null,
    aiMonitorLimit: null,
    contentLimit: null,
    reportLimit: null,
    aiTokenLimit: null,
    modelDispatchLimit: null,
    teamMemberLimit: 50,
    distributionEnabled: true,
    advancedCompetitorAnalysisEnabled: true,
    autoOptimizationEnabled: true,
    featureFlags: {
      displayName: "企业版",
      billingCycle: "yearly",
      monthlyPriceCents: 399_900,
      yearlyPriceCents: 3_999_900,
      discountLabel: "省17%",
      modelLimit: null,
      brandLimit: null,
      dailyRefreshLimit: null,
      materialLimit: null,
      modelProviders: ["doubao", "yuanbao", "deepseek", "tongyi", "wenxin", "zhipu", "kimi", "metaso", "ai360", "xinghuo"],
      enabledModules: ["all"],
      support: "专属经理（2h 内响应）",
      extraTokenPrice: "AI 调用费用由用户余额按次扣除，可按企业合同结算"
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
  const interval = plan.interval.toLowerCase();
  const priceYuan = plan.priceCents / 100;
  const priceSuffix = interval === "year" ? "年" : "月";

  return {
    code: plan.code,
    name: plan.name,
    displayName: stringFrom(flags.displayName, plan.name),
    description: plan.description,
    priceCents: plan.priceCents,
    monthlyPriceCents: nullableNumber(flags.monthlyPriceCents, plan.interval === PlanInterval.MONTH ? plan.priceCents : null),
    yearlyPriceCents: nullableNumber(flags.yearlyPriceCents, plan.interval === PlanInterval.YEAR ? plan.priceCents : null),
    price: plan.priceCents === 0 ? "¥0/月" : `¥${priceYuan.toLocaleString("zh-CN")}/${priceSuffix}`,
    currency: plan.currency,
    interval,
    billingCycle: stringFrom(flags.billingCycle, interval === "year" ? "yearly" : "monthly"),
    recommended: Boolean(flags.recommended),
    discountLabel: stringFrom(flags.discountLabel, ""),
    brandProjects: plan.projectLimit,
    aiQuestions: plan.questionLimit,
    aiMonitorRuns: plan.aiMonitorLimit,
    contentTasks: plan.contentLimit,
    reports: plan.reportLimit,
    modelTokens: plan.aiTokenLimit,
    modelCalls: plan.modelDispatchLimit,
    teamMembers: plan.teamMemberLimit,
    sourceConnectors: numberFrom(flags.sourceConnectors, 0),
    modelLimit: nullableNumber(flags.modelLimit, plan.modelDispatchLimit),
    brandLimit: nullableNumber(flags.brandLimit, plan.projectLimit),
    dailyRefreshLimit: nullableNumber(flags.dailyRefreshLimit, plan.aiMonitorLimit),
    materialLimit: nullableNumber(flags.materialLimit, null),
    modelProviders: Array.isArray(flags.modelProviders) ? flags.modelProviders : [],
    enabledModules: Array.isArray(flags.enabledModules) ? flags.enabledModules : [],
    multiPlatformDistribution: plan.distributionEnabled,
    advancedCompetitorAnalysis: plan.advancedCompetitorAnalysisEnabled,
    autoOptimizationTasks: plan.autoOptimizationEnabled,
    support: stringFrom(flags.support, "在线支持"),
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

  const freePlan = await prisma.plan.findUniqueOrThrow({ where: { code: "free" } });
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
      status: { in: activeSubscriptionStatuses },
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
      emailHash: true,
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

  if (isFullAccessTestUser(user.email, user.emailHash)) {
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
      emailHash: true,
      role: true,
      organizationId: true
    }
  });

  if (!user?.organizationId) {
    return {
      allowed: false,
      featureKey,
      reason: "账号组织信息缺失，请重新登录。"
    };
  }

  if (isAdminRole(user.role) || isFullAccessTestUser(user.email, user.emailHash)) {
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
      reason: "当前账号还没有有效套餐，请先开通套餐。"
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
        "当前套餐暂未包含多平台分发能力。"
      );
    case "competitors.advanced":
      return booleanDecision(
        featureKey,
        subscription.plan.code,
        snapshot.features.advancedCompetitorAnalysis,
        "当前套餐暂未包含高级竞品分析能力。"
      );
    case "automation.run":
      return booleanDecision(
        featureKey,
        subscription.plan.code,
        snapshot.features.autoOptimizationTasks,
        "当前套餐暂未包含自动优化任务。"
      );
    case "admin.access":
      return {
        allowed: false,
        featureKey,
        planCode: subscription.plan.code,
        reason: "该功能仅管理员可用。"
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
      reason: "当前套餐额度已经用完，请升级套餐或等待下个周期重置。"
    };
  }

  return { allowed: true, featureKey, remaining, planCode };
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

function nullableNumber(value: unknown, fallback: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringFrom(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

function isAdminRole(role: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}

function isFullAccessTestUser(email: string | null | undefined, emailHash: string | null | undefined) {
  const allowList = (process.env.FULL_ACCESS_TEST_EMAILS || "test@citeox.com")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return allowList.some((allowed) => email === allowed || emailHash === hashEmail(allowed));
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
    extraTokenPrice: "管理员不限制额度",
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
    extraTokenPrice: "测试账号不限制额度"
  };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
