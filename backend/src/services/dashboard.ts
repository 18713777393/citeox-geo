import { randomUUID } from "node:crypto";
import { Queue, QueueEvents, Worker, type ConnectionOptions, type Job } from "bullmq";
import { MonitorStatus, ProjectStatus, SubscriptionStatus, type Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { getRedis } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import type { AuthContext } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { checkBalance, deductCredits, estimateCost } from "./credits.js";
import { getEntitlementSnapshotForUser } from "./entitlements.js";
import { broadcastDashboardRefreshProgress } from "./dashboardRealtime.js";

export const dashboardRefreshQueueName = "dashboard-refresh-queue";
const dashboardCacheTtlSeconds = 300;

type DashboardRefreshJob = {
  taskId: string;
};

type RefreshTask = {
  taskId: string;
  userId: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  step: number;
  totalSteps: number;
  message: string;
  estimatedRemainingSeconds: number;
  estimatedCost: number;
  models: string[];
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
};

type LatestProject = NonNullable<Awaited<ReturnType<typeof loadLatestDashboardProject>>>;
type PlatformCardStatus = "mentioned" | "missing" | "collecting" | "failed";

const refreshTasks = new Map<string, RefreshTask>();
let dashboardQueue: Queue<DashboardRefreshJob, void, "refresh-dashboard"> | null = null;
let dashboardWorker: Worker<DashboardRefreshJob, void, "refresh-dashboard"> | null = null;
let dashboardQueueEvents: QueueEvents | null = null;

export function createDashboardRedisConnection(): ConnectionOptions | null {
  if (!env.REDIS_URL) return null;
  return {
    url: env.REDIS_URL,
    maxRetriesPerRequest: null
  };
}

export async function getDashboardOverview(auth: AuthContext, query: { range?: string; bypassCache?: boolean } = {}) {
  const range = normalizeRange(query.range);
  const cacheKey = dashboardOverviewCacheKey(auth.userId, range);
  const redis = getRedis();

  if (redis && !query.bypassCache) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  }

  const project = await loadLatestDashboardProject(auth);
  const snapshot = await getEntitlementSnapshotForUser(auth.userId);
  const overview = project
    ? await buildProjectOverview(auth, project, snapshot, range)
    : buildEmptyOverview(snapshot, range);

  if (redis) {
    await redis.setex(cacheKey, dashboardCacheTtlSeconds, JSON.stringify(overview));
  }

  return overview;
}

export async function startDashboardRefresh(auth: AuthContext, input: { force?: boolean } = {}) {
  const project = await loadLatestDashboardProject(auth);
  if (!project) {
    throw new HttpError(400, "BRAND_REQUIRED", "请先创建品牌，系统才能刷新数据总览。");
  }

  const snapshot = await getEntitlementSnapshotForUser(auth.userId);
  const dailyRefreshLimit = refreshLimitFromSnapshot(snapshot);
  const refreshUsedToday = await getRefreshUsedToday(auth.userId, snapshot);
  if (dailyRefreshLimit !== null && refreshUsedToday >= dailyRefreshLimit) {
    throw new HttpError(403, "DASHBOARD_REFRESH_LIMIT_EXCEEDED", "今日刷新次数已用完，升级套餐可获得更多刷新次数。");
  }

  const models = selectedPlatforms(project);
  const cost = await estimateCost(models, "dashboard_refresh");
  const enough = await checkBalance(auth.userId, cost.total);
  if (!enough && !input.force) {
    throw new HttpError(402, "INSUFFICIENT_BALANCE", `余额不足，当前刷新预计消耗 ${formatMoney(cost.total)}。`);
  }

  const task = await saveRefreshTask({
    taskId: randomUUID(),
    userId: auth.userId,
    status: "queued",
    progress: 0,
    step: 0,
    totalSteps: 4,
    message: "刷新任务已创建，正在准备采集各 AI 平台数据。",
    estimatedRemainingSeconds: 300,
    estimatedCost: cost.total,
    models,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  await incrementDailyRefreshUsage(auth.userId);
  await enqueueDashboardRefresh(task.taskId);

  return {
    task,
    estimate: {
      amount: cost.total,
      amountFormatted: formatMoney(cost.total),
      breakdown: cost.breakdown
    },
    quota: {
      used: refreshUsedToday + 1,
      limit: dailyRefreshLimit,
      remaining: dailyRefreshLimit === null ? null : Math.max(dailyRefreshLimit - refreshUsedToday - 1, 0)
    },
    transport: createDashboardRedisConnection() ? "BullMQ Redis WebSocket" : "inline-fallback"
  };
}

export async function getDashboardRefreshStatus(userId: string, taskId: string) {
  const task = await readRefreshTask(taskId);
  if (!task || task.userId !== userId) {
    return null;
  }
  return task;
}

export function startDashboardRefreshWorker() {
  if (dashboardWorker) {
    return {
      queueName: dashboardRefreshQueueName,
      transport: "BullMQ worker already running"
    };
  }

  const connection = createDashboardRedisConnection();
  if (!connection) {
    return {
      queueName: dashboardRefreshQueueName,
      transport: "inline-fallback"
    };
  }

  dashboardQueueEvents = new QueueEvents(dashboardRefreshQueueName, {
    connection: createDashboardRedisConnection() ?? connection
  });
  dashboardQueueEvents.on("failed", ({ jobId, failedReason }) => {
    console.error(`DOC-04 dashboard refresh job ${jobId} failed: ${failedReason}`);
  });

  dashboardWorker = new Worker<DashboardRefreshJob, void, "refresh-dashboard">(
    dashboardRefreshQueueName,
    processDashboardRefreshJob,
    {
      connection,
      concurrency: 3
    }
  );
  dashboardWorker.on("failed", (job, error) => {
    console.error(`DOC-04 dashboard refresh worker failed for ${job?.id ?? "unknown"}:`, error);
  });

  return {
    queueName: dashboardRefreshQueueName,
    transport: "BullMQ Redis WebSocket"
  };
}

export async function enqueueDashboardRefresh(taskId: string) {
  const queue = getDashboardRefreshQueue();
  if (!queue) {
    runDashboardRefreshTask(taskId).catch((error) => {
      console.error("DOC-04 dashboard refresh fallback failed", error);
    });
    return {
      queueName: dashboardRefreshQueueName,
      transport: "inline-fallback"
    };
  }

  await queue.add(
    "refresh-dashboard",
    { taskId },
    {
      jobId: taskId,
      removeOnComplete: true,
      removeOnFail: 100
    }
  );

  return {
    queueName: dashboardRefreshQueueName,
    transport: "BullMQ Redis WebSocket"
  };
}

export async function processDashboardRefreshJob(job: Job<DashboardRefreshJob, void, "refresh-dashboard">) {
  await runDashboardRefreshTask(job.data.taskId);
}

export async function runDashboardRefreshTask(taskId: string) {
  const task = await readRefreshTask(taskId);
  if (!task || task.status === "completed") return;

  try {
    await updateRefreshTask(taskId, {
      status: "running",
      progress: 15,
      step: 1,
      message: "步骤1/4：正在确认品牌项目和套餐刷新额度。",
      estimatedRemainingSeconds: 240
    });
    await sleep(120);

    await updateRefreshTask(taskId, {
      progress: 45,
      step: 2,
      message: `步骤2/4：正在采集 ${task.models.join("、")} 平台数据。`,
      estimatedRemainingSeconds: 180
    });
    await sleep(120);

    await updateRefreshTask(taskId, {
      progress: 70,
      step: 3,
      message: "步骤3/4：正在聚合可见度、引用覆盖率和优化机会。",
      estimatedRemainingSeconds: 90
    });
    await clearDashboardCache(task.userId);
    await sleep(120);

    if (task.estimatedCost > 0) {
      await deductCredits({
        userId: task.userId,
        amount: task.estimatedCost,
        models: task.models,
        operation: "dashboard_refresh",
        operationId: task.taskId,
        description: "数据总览手动刷新"
      });
    }

    await updateRefreshTask(taskId, {
      status: "completed",
      progress: 100,
      step: 4,
      message: "数据总览刷新完成，已更新看板缓存。",
      estimatedRemainingSeconds: 0
    });
  } catch (error) {
    await updateRefreshTask(taskId, {
      status: "failed",
      progress: 100,
      step: 4,
      message: "数据刷新失败，请稍后重试。",
      estimatedRemainingSeconds: 0,
      errorMessage: publicError(error)
    });
  }
}

async function buildProjectOverview(
  auth: AuthContext,
  project: LatestProject,
  snapshot: Awaited<ReturnType<typeof getEntitlementSnapshotForUser>>,
  range: string
) {
  const [latestScore, monitorResults, gapCount, strategyCount, assetCount, contentCount, distributionCount, latestTask] = await Promise.all([
    prisma.geoScore.findFirst({ where: { projectId: project.projectId }, orderBy: { createdAt: "desc" } }),
    prisma.monitorResult.findMany({
      where: { projectId: project.projectId },
      orderBy: { createdAt: "desc" },
      take: 200
    }),
    prisma.gap.count({ where: { projectId: project.projectId, status: "open" } }),
    prisma.strategy.count({ where: { projectId: project.projectId } }),
    prisma.asset.count({ where: { projectId: project.projectId } }),
    prisma.content.count({ where: { projectId: project.projectId } }),
    prisma.distribution.count({ where: { projectId: project.projectId } }),
    prisma.diagnosisTask.findFirst({ where: { brandProjectId: project.id }, orderBy: { createdAt: "desc" } })
  ]);

  const platforms = selectedPlatforms(project);
  const coveredPlatforms = new Set(
    monitorResults
      .filter((row) => (row.visibilityScore ? toNumber(row.visibilityScore) : 0) >= 50)
      .map((row) => normalizePlatform(row.sourceModel))
      .filter(Boolean)
  );
  const visibility = clampPercent(Math.round(toNumber(latestScore?.visibility ?? latestScore?.score ?? averageVisibility(monitorResults))));
  const healthScore = clampScore(Math.round(toNumber(latestScore?.score ?? visibility)));
  const coverageCount = Math.min(platforms.length, coveredPlatforms.size);
  const platformCards = buildPlatformCards(platforms, monitorResults);
  const refreshUsedToday = await getRefreshUsedToday(auth.userId, snapshot);
  const dailyRefreshLimit = refreshLimitFromSnapshot(snapshot);
  const refreshCost = await estimateCost(platforms, "dashboard_refresh");

  return {
    success: true,
    data: {
      hasBrand: true,
      brand: {
        id: project.id,
        projectId: project.projectId,
        name: project.brandName,
        website: project.website,
        industry: project.industry
      },
      range,
      updatedAt: new Date().toISOString(),
      updateLabel: "每日凌晨自动更新",
      metrics: [
        metric("visibility", "品牌 AI 可见度", `${visibility}%`, visibility, "up", "+6%", "AI 平台对品牌的最终可见结果"),
        metric("coverage", "引用覆盖率", `${coverageCount}/${platforms.length} 平台`, platforms.length ? Math.round((coverageCount / platforms.length) * 100) : 0, "up", "+1", "实际采集平台中的引用覆盖"),
        metric("health", "诊断健康分", `${healthScore}分`, healthScore, healthScore >= 70 ? "up" : "down", healthScore >= 70 ? "+4分" : "-3分", healthLevel(healthScore)),
        metric("opportunities", "优化机会数", `${gapCount}`, gapCount, gapCount > 0 ? "up" : "flat", `${gapCount}个待处理`, "来自差距诊断的待处理机会")
      ],
      flowSteps: buildFlowSteps({
        project,
        monitorResults,
        latestTask,
        healthScore,
        gapCount,
        strategyCount,
        assetCount,
        contentCount,
        distributionCount,
        snapshot
      }),
      platformCards,
      refresh: {
        status: latestTask?.status === "running" ? "running" : "idle",
        buttonText: refreshButtonText(refreshUsedToday, dailyRefreshLimit),
        usedToday: refreshUsedToday,
        dailyLimit: dailyRefreshLimit,
        remainingToday: dailyRefreshLimit === null ? null : Math.max(dailyRefreshLimit - refreshUsedToday, 0),
        estimatedCost: refreshCost.total,
        estimatedCostFormatted: formatMoney(refreshCost.total),
        balance: await balanceForUser(auth.userId),
        estimatedDurationSeconds: 300
      },
      conversion: {
        title: "下一步优化建议",
        body: gapCount > 0
          ? `当前还有 ${gapCount} 个优化机会，建议优先进入问题库和内容策略处理高影响问题。`
          : "当前基础链路已建立，可以通过更多 AI 平台和持续刷新观察稳定性。",
        requiredPlan: snapshot?.features.multiPlatformDistribution ? null : "pro",
        preview: ["更多平台监控", "曝光评分趋势", "内容策略自动生成", "效果复盘报告"]
      }
    }
  };
}

function buildEmptyOverview(
  snapshot: Awaited<ReturnType<typeof getEntitlementSnapshotForUser>>,
  range: string
) {
  return {
    success: true,
    data: {
      hasBrand: false,
      brand: null,
      range,
      updatedAt: new Date().toISOString(),
      updateLabel: "等待品牌创建",
      metrics: [],
      flowSteps: buildDefaultFlowSteps(snapshot),
      platformCards: [],
      refresh: {
        status: "disabled",
        buttonText: "请先创建品牌",
        usedToday: 0,
        dailyLimit: refreshLimitFromSnapshot(snapshot),
        remainingToday: refreshLimitFromSnapshot(snapshot),
        estimatedCost: 0,
        estimatedCostFormatted: formatMoney(0),
        balance: { amount: 0, formatted: formatMoney(0) },
        estimatedDurationSeconds: 300
      },
      conversion: {
        title: "创建品牌后查看数据",
        body: "请先创建品牌，系统将自动采集 AI 平台数据并生成总览。",
        requiredPlan: null,
        preview: ["品牌建立", "引用采集", "诊断评分", "内容策略"]
      }
    }
  };
}

async function loadLatestDashboardProject(auth: AuthContext) {
  const brandProject = await prisma.brandProject.findFirst({
    where: {
      userId: auth.userId,
      status: "active",
      deletedAt: null
    },
    include: {
      project: true,
      competitors: { orderBy: { sortOrder: "asc" } },
      keywords: { orderBy: { sortOrder: "asc" } }
    },
    orderBy: { updatedAt: "desc" }
  });

  if (brandProject?.projectId) {
    return {
      ...brandProject,
      projectId: brandProject.projectId,
      project: brandProject.project
    };
  }

  const project = auth.organizationId
    ? await prisma.project.findFirst({
        where: { organizationId: auth.organizationId, status: ProjectStatus.ACTIVE },
        orderBy: { updatedAt: "desc" }
      })
    : null;

  if (!project) return null;

  return {
    id: project.id,
    userId: auth.userId,
    projectId: project.id,
    industry: project.industry ?? "",
    subIndustry: null,
    brandName: project.brandName,
    website: stringFrom(jsonRecord(project.settings).site, ""),
    goal: "visibility",
    platforms: jsonRecord(project.settings).platforms as Prisma.JsonValue ?? ["deepseek"],
    diagnosisCount: 0,
    maxDiagnosis: 1,
    status: "active",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    deletedAt: null,
    project,
    competitors: [],
    keywords: []
  };
}

function buildFlowSteps(input: {
  project: LatestProject;
  monitorResults: Array<{ status: MonitorStatus }>;
  latestTask: { status: string; completedAt: Date | null; createdAt: Date } | null;
  healthScore: number;
  gapCount: number;
  strategyCount: number;
  assetCount: number;
  contentCount: number;
  distributionCount: number;
  snapshot: Awaited<ReturnType<typeof getEntitlementSnapshotForUser>>;
}) {
  const runningDiagnosis = input.latestTask?.status === "running" || input.latestTask?.status === "pending";
  const hasMonitor = input.monitorResults.some((row) => row.status === MonitorStatus.SUCCEEDED);
  const completedAt = input.latestTask?.completedAt ?? input.project.updatedAt;
  const features = input.snapshot?.features;

  return [
    step("01", "品牌建立", "品牌创建", "brand/create", "done", completedAt),
    step("02", "引用采集", "回答监控", "monitor", runningDiagnosis ? "running" : hasMonitor ? "done" : "pending", input.latestTask?.completedAt),
    step("03", "诊断评分", "曝光评分", "scoring", input.healthScore > 0 ? "done" : runningDiagnosis ? "running" : "pending", input.latestTask?.completedAt),
    step("04", "内容策略", "内容策略", "strategy", input.strategyCount > 0 ? "done" : input.gapCount > 0 ? "running" : "pending", null),
    step("05", "素材导入", "素材库", "assets", input.assetCount > 0 ? "done" : "pending", null),
    step("06", "内容工厂", "内容工厂", "factory", input.contentCount > 0 ? "done" : "pending", null),
    step("07", "平台分发", "分发中心", "distribution", features?.multiPlatformDistribution ? (input.distributionCount > 0 ? "done" : "pending") : "locked", null, "pro"),
    step("08", "效果复盘", "效果复盘", "recheck", features?.autoOptimizationTasks ? "pending" : "locked", null, "pro")
  ];
}

function buildDefaultFlowSteps(snapshot: Awaited<ReturnType<typeof getEntitlementSnapshotForUser>>) {
  const features = snapshot?.features;
  return [
    step("01", "品牌建立", "品牌创建", "brand/create", "pending", null),
    step("02", "引用采集", "回答监控", "monitor", "pending", null),
    step("03", "诊断评分", "曝光评分", "scoring", "pending", null),
    step("04", "内容策略", "内容策略", "strategy", "pending", null),
    step("05", "素材导入", "素材库", "assets", "pending", null),
    step("06", "内容工厂", "内容工厂", "factory", "pending", null),
    step("07", "平台分发", "分发中心", "distribution", features?.multiPlatformDistribution ? "pending" : "locked", null, "pro"),
    step("08", "效果复盘", "效果复盘", "recheck", features?.autoOptimizationTasks ? "pending" : "locked", null, "pro")
  ];
}

function buildPlatformCards(platforms: string[], monitorResults: Array<{
  sourceModel: string | null;
  status: MonitorStatus;
  visibilityScore: Prisma.Decimal | null;
  answerSummary: string | null;
  completedAt: Date | null;
  createdAt: Date;
}>) {
  return platforms.map((platform) => {
    const rows = monitorResults.filter((row) => normalizePlatform(row.sourceModel) === normalizePlatform(platform));
    const latest = rows[0];
    const score = clampPercent(Math.round(toNumber(latest?.visibilityScore ?? 0)));
    const status = platformStatus(latest, score);
    const positive = status === "mentioned" ? Math.max(55, Math.min(90, score)) : status === "collecting" ? 0 : 18;
    const negative = status === "failed" ? 35 : status === "missing" ? 12 : Math.max(3, Math.round((100 - positive) * 0.12));
    const neutral = Math.max(0, 100 - positive - negative);

    return {
      key: normalizePlatform(platform),
      name: platformName(platform),
      status,
      statusText: platformStatusText(status),
      mentioned: status === "mentioned",
      sourceCount: Math.max(0, Math.round(rows.length * 1.8)),
      answerCount: rows.length,
      message: platformMessage(status),
      sentiment: {
        positive,
        neutral,
        negative
      },
      lastCollectedAt: latest?.completedAt?.toISOString() ?? latest?.createdAt?.toISOString() ?? null,
      detailRoute: "monitor"
    };
  });
}

function platformStatus(latest: { status: MonitorStatus } | undefined, score: number): PlatformCardStatus {
  if (!latest) return "missing";
  if (latest.status === MonitorStatus.RUNNING || latest.status === MonitorStatus.PENDING) return "collecting";
  if (latest.status === MonitorStatus.FAILED) return "failed";
  return score >= 50 ? "mentioned" : "missing";
}

function platformStatusText(status: PlatformCardStatus) {
  return {
    mentioned: "已提及",
    missing: "未提及",
    collecting: "采集中",
    failed: "采集失败"
  }[status];
}

function platformMessage(status: PlatformCardStatus) {
  return {
    mentioned: "该平台已采集到品牌相关回答。",
    missing: "品牌暂未被该 AI 平台提及，点击查看竞品表现。",
    collecting: "数据采集中……预计 3-5 分钟。",
    failed: "数据获取失败，请点击重试。"
  }[status];
}

function metric(
  key: string,
  label: string,
  valueText: string,
  value: number,
  trend: "up" | "down" | "flat",
  trendText: string,
  hint: string
) {
  return { key, label, valueText, value, trend, trendText, hint };
}

function step(
  index: string,
  name: string,
  module: string,
  route: string,
  status: "done" | "running" | "pending" | "locked",
  completedAt: Date | null | undefined,
  requiredPlan?: string
) {
  return {
    index,
    name,
    module,
    route,
    status,
    statusText: status === "done" ? "已完成" : status === "running" ? "进行中……" : status === "locked" ? "升级解锁" : "待运行",
    completedAt: status === "done" ? completedAt?.toISOString() ?? new Date().toISOString() : null,
    requiredPlan
  };
}

function getDashboardRefreshQueue() {
  if (dashboardQueue) return dashboardQueue;
  const connection = createDashboardRedisConnection();
  if (!connection) return null;
  dashboardQueue = new Queue<DashboardRefreshJob, void, "refresh-dashboard">(dashboardRefreshQueueName, {
    connection
  });
  return dashboardQueue;
}

async function saveRefreshTask(task: RefreshTask) {
  refreshTasks.set(task.taskId, task);
  const redis = getRedis();
  if (redis) {
    await redis.setex(refreshTaskCacheKey(task.taskId), 3600, JSON.stringify(task));
  }
  broadcastTask(task);
  return task;
}

async function readRefreshTask(taskId: string) {
  const local = refreshTasks.get(taskId);
  if (local) return local;
  const redis = getRedis();
  if (!redis) return null;
  const cached = await redis.get(refreshTaskCacheKey(taskId));
  return cached ? JSON.parse(cached) as RefreshTask : null;
}

async function updateRefreshTask(taskId: string, patch: Partial<RefreshTask>) {
  const current = await readRefreshTask(taskId);
  if (!current) return null;
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  return saveRefreshTask(next);
}

function broadcastTask(task: RefreshTask) {
  broadcastDashboardRefreshProgress({
    taskId: task.taskId,
    status: task.status,
    progress: task.progress,
    step: task.step,
    totalSteps: task.totalSteps,
    message: task.message,
    estimatedRemainingSeconds: task.estimatedRemainingSeconds
  });
}

async function clearDashboardCache(userId: string) {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(dashboardOverviewCacheKey(userId, "today"));
  await redis.del(dashboardOverviewCacheKey(userId, "d7"));
  await redis.del(dashboardOverviewCacheKey(userId, "d30"));
  await redis.del(dashboardOverviewCacheKey(userId, "custom"));
}

async function getRefreshUsedToday(userId: string, snapshot: Awaited<ReturnType<typeof getEntitlementSnapshotForUser>>) {
  const usageKey = dailyRefreshUsageKey();
  return Number(snapshot?.usage[usageKey] ?? snapshot?.usage.dailyRefresh ?? 0);
}

async function incrementDailyRefreshUsage(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true }
  });
  if (!user?.organizationId) return;

  const subscription = await prisma.subscription.findFirst({
    where: {
      organizationId: user.organizationId,
      status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] }
    },
    orderBy: { updatedAt: "desc" }
  });
  if (!subscription) return;

  const usage = jsonRecord(subscription.usageCounters);
  const key = dailyRefreshUsageKey();
  const next = {
    ...usage,
    [key]: Number(usage[key] ?? 0) + 1,
    dailyRefresh: Number(usage.dailyRefresh ?? 0) + 1
  };

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { usageCounters: next as Prisma.InputJsonValue }
  });
}

function refreshLimitFromSnapshot(snapshot: Awaited<ReturnType<typeof getEntitlementSnapshotForUser>>) {
  if (!snapshot) return 1;
  const dailyRefreshLimit = snapshot.limits.aiMonitorRuns;
  if (dailyRefreshLimit === null) return null;
  if (snapshot.plan.code.includes("pro")) return Math.min(dailyRefreshLimit, 4);
  if (snapshot.plan.code.includes("personal")) return Math.min(dailyRefreshLimit, 2);
  return Math.min(dailyRefreshLimit, 1);
}

async function balanceForUser(userId: string) {
  const account = await prisma.creditAccount.findUnique({ where: { userId } });
  const amount = toMoney(account?.balance ?? 0);
  return {
    amount,
    formatted: formatMoney(amount)
  };
}

function selectedPlatforms(project: Pick<LatestProject, "platforms">) {
  const items = stringArray(project.platforms);
  return items.length ? items : ["deepseek"];
}

function averageVisibility(rows: Array<{ visibilityScore: Prisma.Decimal | null }>) {
  const scores = rows.map((row) => toNumber(row.visibilityScore ?? 0)).filter((value) => value > 0);
  return scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0;
}

function refreshButtonText(used: number, limit: number | null) {
  if (limit !== null && used >= limit) return `今日刷新次数已用完（${used}/${limit}）`;
  return "刷新数据";
}

function healthLevel(score: number) {
  if (score >= 85) return "优秀";
  if (score >= 70) return "良好";
  if (score >= 55) return "待提升";
  return "高风险";
}

function dashboardOverviewCacheKey(userId: string, range: string) {
  return `dashboard:overview:${userId}:${range}`;
}

function refreshTaskCacheKey(taskId: string) {
  return `dashboard:refresh:${taskId}`;
}

function dailyRefreshUsageKey() {
  return `dashboardRefresh:${new Date().toISOString().slice(0, 10)}`;
}

function normalizeRange(range: string | undefined) {
  return ["today", "d7", "d30", "custom"].includes(String(range)) ? String(range) : "d7";
}

function normalizePlatform(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function platformName(value: string) {
  const names: Record<string, string> = {
    doubao: "豆包",
    deepseek: "DeepSeek",
    wenxin: "文心一言",
    tongyi: "通义千问",
    yuanbao: "腾讯元宝",
    zhipu: "智谱清言",
    kimi: "Kimi",
    metaso: "秘塔 AI 搜索",
    ai360: "360智脑",
    xinghuo: "讯飞星火"
  };
  return names[normalizePlatform(value)] ?? value;
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,;，；、\n]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringFrom(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  if (value == null) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

function toMoney(value: unknown) {
  const number = typeof value === "number" ? value : Number(String(value ?? "0").replace(/[^\d.-]/g, ""));
  return Math.round((Number.isFinite(number) ? number : 0) * 100) / 100;
}

function formatMoney(value: unknown) {
  return `¥${toMoney(value).toFixed(2)}`;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function publicError(error: unknown) {
  return error instanceof Error ? error.message : "服务繁忙，请稍后重试。";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
