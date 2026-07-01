import { MonitorStatus, type Prisma } from "@prisma/client";
import { Queue, QueueEvents, Worker, type ConnectionOptions, type Job } from "bullmq";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import type { AuthContext } from "../middleware/auth.js";
import { invokeAiGateway, type AiGatewayResult } from "./aiGateway.js";
import { broadcastDiagnosisProgress } from "./diagnosisRealtime.js";

export const diagnosisQueueName = "diagnosis-queue";

type DiagnosisJob = {
  taskId: string;
};

type LoadedDiagnosisTask = NonNullable<Awaited<ReturnType<typeof loadDiagnosisTask>>>;
type SavedMonitor = Awaited<ReturnType<typeof createMonitorResult>>;
type SavedGap = Awaited<ReturnType<typeof createDiagnosisGap>>;

type DiagnosisProviderResult =
  | {
      ok: true;
      requestedPlatform: string;
      gatewayProvider: string;
      startedAt: Date;
      ai: AiGatewayResult;
    }
  | {
      ok: false;
      requestedPlatform: string;
      gatewayProvider: string;
      startedAt: Date;
      error: string;
    };

const progressSteps = {
  preparing: { progress: 15, currentStep: "正在准备品牌诊断任务..." },
  collecting: { progress: 35, currentStep: "正在调用 AI 平台采集回答..." },
  saving: { progress: 55, currentStep: "正在清洗并保存 AI 回答..." },
  gaps: { progress: 75, currentStep: "正在生成差距诊断..." },
  strategies: { progress: 90, currentStep: "正在生成初始优化策略..." },
  completed: { progress: 100, currentStep: "诊断已完成" }
} as const;

let diagnosisQueue: Queue<DiagnosisJob, void, "run-diagnosis"> | null = null;
let diagnosisWorker: Worker<DiagnosisJob, void, "run-diagnosis"> | null = null;
let diagnosisQueueEvents: QueueEvents | null = null;

export function createRedisConnection(): ConnectionOptions | null {
  if (!env.REDIS_URL) return null;
  return {
    url: env.REDIS_URL,
    maxRetriesPerRequest: null
  };
}

export async function enqueueDiagnosisTask(taskId: string) {
  const queue = getDiagnosisQueue();
  if (!queue) {
    runInlineDiagnosisTask(taskId).catch((error) => {
      console.error("DOC-02 diagnosis fallback failed", error);
    });
    return {
      queueName: diagnosisQueueName,
      transport: "inline-fallback"
    };
  }

  await queue.add(
    "run-diagnosis",
    { taskId },
    {
      jobId: taskId,
      removeOnComplete: true,
      removeOnFail: 100
    }
  );

  return {
    queueName: diagnosisQueueName,
    transport: "BullMQ Redis WebSocket"
  };
}

export function startDiagnosisWorker() {
  if (diagnosisWorker) {
    return {
      queueName: diagnosisQueueName,
      transport: "BullMQ worker already running"
    };
  }

  const connection = createRedisConnection();
  if (!connection) {
    return {
      queueName: diagnosisQueueName,
      transport: "inline-fallback"
    };
  }

  diagnosisQueueEvents = new QueueEvents(diagnosisQueueName, {
    connection: createRedisConnection() ?? connection
  });

  diagnosisQueueEvents.on("failed", ({ jobId, failedReason }) => {
    console.error(`DOC-02 diagnosis job ${jobId} failed: ${failedReason}`);
  });

  diagnosisWorker = new Worker<DiagnosisJob, void, "run-diagnosis">(
    diagnosisQueueName,
    processDiagnosisJob,
    {
      connection,
      concurrency: 5
    }
  );

  diagnosisWorker.on("failed", (job, error) => {
    console.error(`DOC-02 diagnosis worker failed for ${job?.id ?? "unknown"}:`, error);
  });

  return {
    queueName: diagnosisQueueName,
    transport: "BullMQ Redis WebSocket"
  };
}

export async function getDiagnosisTaskStatus(userId: string, taskId: string) {
  const task = await prisma.diagnosisTask.findFirst({
    where: {
      id: taskId,
      userId
    }
  });

  return task ? formatDiagnosisTask(task) : null;
}

export async function processDiagnosisJob(job: Job<DiagnosisJob, void, "run-diagnosis">) {
  await runInlineDiagnosisTask(job.data.taskId);
}

export async function runInlineDiagnosisTask(taskId: string) {
  const task = await loadDiagnosisTask(taskId);
  if (!task || task.status === "completed") return;

  if (!task.brandProject.project || !task.user.organizationId) {
    await failDiagnosisTask(taskId, "品牌项目数据不完整，请联系客服处理。");
    return;
  }

  await updateDiagnosisProgress(taskId, {
    status: "running",
    startedAt: task.startedAt ?? new Date(),
    ...progressSteps.preparing
  });

  const question = await ensureDiagnosisQuestion(task);
  const platforms = selectedPlatforms(task.brandProject.platforms);
  const auth = authContextForTask(task);

  await sleep(120);
  await updateDiagnosisProgress(taskId, progressSteps.collecting);

  const settled = await Promise.allSettled(
    platforms.map((platform) => runProviderDiagnosis(task, auth, platform))
  );
  const providerResults = settled.map((item, index): DiagnosisProviderResult => {
    if (item.status === "fulfilled") return item.value;
    const platform = platforms[index] ?? "deepseek";
    return {
      ok: false,
      requestedPlatform: platform,
      gatewayProvider: gatewayProviderForPlatform(platform),
      startedAt: new Date(),
      error: publicError(item.reason)
    };
  });
  const providerModes = providerModesFromResults(providerResults);

  await updateDiagnosisProgress(taskId, progressSteps.saving);
  const monitors = await Promise.all(
    providerResults.map((result) => createMonitorResult(task, question.id, result, providerModes))
  );

  await updateDiagnosisProgress(taskId, progressSteps.gaps);
  const gaps = await Promise.all(
    monitors.slice(0, 5).map((monitor) => createDiagnosisGap(task, monitor, providerModes))
  );

  await updateDiagnosisProgress(taskId, progressSteps.strategies);
  await Promise.all(
    gaps.map((gap, index) => createDiagnosisStrategy(task, gap, index, providerModes))
  );

  const completed = await prisma.diagnosisTask.update({
    where: { id: taskId },
    data: {
      status: "completed",
      progress: progressSteps.completed.progress,
      currentStep: progressSteps.completed.currentStep,
      completedAt: new Date(),
      errorMessage: providerResults.every((item) => !item.ok)
        ? "本次诊断未接入真实 AI Key，已生成可识别的占位诊断，接入真实服务后可重新诊断。"
        : null
    }
  });
  publishDiagnosisProgress(completed);
}

export function publishDiagnosisProgress(task: {
  id: string;
  brandProjectId: string;
  status: string;
  progress: number;
  currentStep: string | null;
}) {
  broadcastDiagnosisProgress({
    diagnosisTaskId: task.id,
    brandProjectId: task.brandProjectId,
    status: task.status,
    progress: task.progress,
    currentStep: task.currentStep
  });
}

async function loadDiagnosisTask(taskId: string) {
  return prisma.diagnosisTask.findUnique({
    where: { id: taskId },
    include: {
      user: true,
      brandProject: {
        include: {
          project: true,
          competitors: { orderBy: { sortOrder: "asc" } },
          keywords: { orderBy: { sortOrder: "asc" } }
        }
      }
    }
  });
}

async function updateDiagnosisProgress(
  taskId: string,
  data: Prisma.DiagnosisTaskUpdateInput
) {
  const updated = await prisma.diagnosisTask.update({
    where: { id: taskId },
    data
  });
  publishDiagnosisProgress(updated);
  return updated;
}

async function failDiagnosisTask(taskId: string, message: string) {
  const failed = await prisma.diagnosisTask.update({
    where: { id: taskId },
    data: {
      status: "failed",
      progress: 100,
      currentStep: "诊断失败",
      completedAt: new Date(),
      errorMessage: message
    }
  });
  publishDiagnosisProgress(failed);
}

async function ensureDiagnosisQuestion(task: LoadedDiagnosisTask) {
  const projectId = task.brandProject.project!.id;
  const title = `首次品牌诊断：${task.brandProject.brandName} 在 AI 平台中的推荐表现如何？`;
  const existing = await prisma.question.findFirst({
    where: {
      projectId,
      title
    }
  });
  if (existing) return existing;

  return prisma.question.create({
    data: {
      projectId,
      createdById: task.userId,
      title,
      prompt: buildDiagnosisPrompt(task),
      category: "brand_diagnosis",
      language: "zh-CN",
      status: "active"
    }
  });
}

async function runProviderDiagnosis(
  task: LoadedDiagnosisTask,
  auth: AuthContext,
  requestedPlatform: string
): Promise<DiagnosisProviderResult> {
  const gatewayProvider = gatewayProviderForPlatform(requestedPlatform);
  const startedAt = new Date();

  try {
    const ai = await invokeAiGateway({
      auth,
      featureKey: "monitor.run",
      providerCode: gatewayProvider,
      projectId: task.brandProject.project!.id,
      operation: "brand_diagnosis",
      input: buildDiagnosisPrompt(task, requestedPlatform),
      metadata: {
        diagnosisTaskId: task.id,
        requestedPlatform,
        diagnosis_pipeline: true,
        promptHidden: true
      }
    });

    return {
      ok: true,
      requestedPlatform,
      gatewayProvider,
      startedAt,
      ai
    };
  } catch (error) {
    return {
      ok: false,
      requestedPlatform,
      gatewayProvider,
      startedAt,
      error: publicError(error)
    };
  }
}

async function createMonitorResult(
  task: LoadedDiagnosisTask,
  questionId: string,
  result: DiagnosisProviderResult,
  providerModes: Record<string, string>
) {
  const projectId = task.brandProject.project!.id;
  const brandName = task.brandProject.brandName;

  if (!result.ok) {
    return prisma.monitorResult.create({
      data: {
        projectId,
        questionId,
        status: MonitorStatus.FAILED,
        sourceModel: result.requestedPlatform,
        answerSummary: `平台 ${result.requestedPlatform} 暂未返回可用回答：${result.error}`,
        rawResponse: {
          mode: "provider_error",
          diagnosis_pipeline: true,
          diagnosisTaskId: task.id,
          requestedPlatform: result.requestedPlatform,
          gatewayProvider: result.gatewayProvider,
          providerModes,
          error: result.error,
          promptHidden: true
        },
        visibilityScore: "0",
        startedAt: result.startedAt,
        completedAt: new Date()
      }
    });
  }

  const mode = result.ai.output.mode === "live" ? "live_summary" : "safe_placeholder";
  const visibility = scoreAnswerVisibility(result.ai.output.summary, brandName, mode);

  return prisma.monitorResult.create({
    data: {
      projectId,
      questionId,
      modelProviderId: result.ai.provider.id,
      status: MonitorStatus.SUCCEEDED,
      sourceModel: result.ai.provider.name,
      answerSummary: result.ai.output.summary.slice(0, 4000),
      rawResponse: {
        mode,
        diagnosis_pipeline: true,
        diagnosisTaskId: task.id,
        requestId: result.ai.requestId,
        requestedPlatform: result.requestedPlatform,
        provider: result.ai.provider.code,
        providerConfigured: result.ai.provider.configured,
        providerMode: result.ai.output.mode,
        providerModes,
        model: result.ai.model,
        promptHidden: true
      },
      visibilityScore: String(visibility),
      startedAt: result.startedAt,
      completedAt: new Date()
    }
  });
}

async function createDiagnosisGap(
  task: LoadedDiagnosisTask,
  monitor: SavedMonitor,
  providerModes: Record<string, string>
) {
  const projectId = task.brandProject.project!.id;
  const brandName = task.brandProject.brandName;
  const raw = jsonRecord(monitor.rawResponse);
  const mode = String(raw.mode ?? "unknown");
  const score = Number(monitor.visibilityScore ?? 0);

  const placeholder = mode === "safe_placeholder";
  const failed = monitor.status === MonitorStatus.FAILED;
  const title = failed
    ? `${monitor.sourceModel ?? "AI 平台"} 数据采集失败`
    : placeholder
      ? "等待真实 AI Key 接入后复核诊断结果"
      : score >= 65
        ? `${brandName} AI 回答证据仍可增强`
        : `${brandName} 在 AI 回答中的可见度不足`;

  const category = failed ? "provider_connection" : placeholder ? "integration_required" : "brand_visibility";
  const severity = failed || placeholder ? 2 : score >= 65 ? 1 : 3;
  const description = failed
    ? "当前平台未完成回答采集，请检查真实 API Key、套餐权限或平台可用性。"
    : placeholder
      ? "当前环境未配置真实 AI 平台 Key，系统已保留任务链路和占位结果；接入真实服务后需要重新执行诊断。"
      : score >= 65
        ? "品牌已被识别，但引用来源、案例证据和推荐理由仍需要增强。"
        : "真实 AI 回答中品牌露出、引用来源或推荐理由不足，需要补充可被 AI 抓取和引用的内容资产。";

  return prisma.gap.create({
    data: {
      projectId,
      monitorResultId: monitor.id,
      title,
      category,
      severity,
      description,
      evidence: {
        mode,
        diagnosis_pipeline: true,
        diagnosisTaskId: task.id,
        monitorResultId: monitor.id,
        providerModes,
        promptHidden: true
      },
      status: "open"
    }
  });
}

async function createDiagnosisStrategy(
  task: LoadedDiagnosisTask,
  gap: SavedGap,
  index: number,
  providerModes: Record<string, string>
) {
  const brandName = task.brandProject.brandName;
  const priority = Math.max(1, Math.min(5, gap.severity + (index < 2 ? 1 : 0)));

  return prisma.strategy.create({
    data: {
      projectId: task.brandProject.project!.id,
      gapId: gap.id,
      title: `${brandName}：${strategyAssetForGap(gap.category)}补强`,
      objective: gap.description ?? "围绕首次品牌诊断结果，补齐 AI 可理解、可引用、可推荐的品牌内容资产。",
      priority,
      actions: {
        mode: "diagnosis_pipeline",
        diagnosisTaskId: task.id,
        providerModes,
        gapCategory: gap.category,
        promptHidden: true,
        steps: [
          "补充官网 FAQ、案例、数据证据和结构化内容",
          "围绕竞品对比和选型问题生成可审核内容",
          "接入真实 AI Key 后重新运行诊断并复核结果"
        ]
      },
      status: "draft"
    }
  });
}

function getDiagnosisQueue() {
  if (diagnosisQueue) return diagnosisQueue;
  const connection = createRedisConnection();
  if (!connection) return null;
  diagnosisQueue = new Queue<DiagnosisJob, void, "run-diagnosis">(diagnosisQueueName, {
    connection
  });
  return diagnosisQueue;
}

function selectedPlatforms(value: Prisma.JsonValue) {
  const list = Array.isArray(value) ? value : [];
  const platforms = list
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter(Boolean);

  return [...new Set(platforms)].slice(0, 10).length ? [...new Set(platforms)].slice(0, 10) : ["deepseek"];
}

function gatewayProviderForPlatform(platform: string) {
  const normalized = platform.trim().toLowerCase();
  const aliases: Record<string, string> = {
    doubao: "doubao",
    deepseek: "deepseek",
    ds: "deepseek",
    wenxin: "qianfan",
    qianfan: "qianfan",
    zhipu: "zhipu",
    yuanbao: "yuanbao",
    tongyi: "tongyi",
    kimi: "kimi",
    metaso: "perplexity",
    xinghuo: "xunfei",
    xunfei: "xunfei",
    ai360: "ai360"
  };

  return aliases[normalized] ?? "deepseek";
}

function authContextForTask(task: LoadedDiagnosisTask): AuthContext {
  return {
    userId: task.userId,
    organizationId: task.user.organizationId!,
    sessionId: `diagnosis-${task.id}`,
    tokenId: `diagnosis-${task.id}`,
    role: apiRole(task.user.role)
  };
}

function apiRole(role: string): AuthContext["role"] {
  if (role === "SUPER_ADMIN") return "super_admin";
  if (role === "ADMIN") return "admin";
  if (role === "BUSINESS_USER") return "business_user";
  return "user";
}

function buildDiagnosisPrompt(task: LoadedDiagnosisTask, platform?: string) {
  const brand = task.brandProject;
  const competitors = brand.competitors.map((item) => item.name).join("、") || "暂无";
  const keywords = brand.keywords.map((item) => item.keyword).join("、") || "暂无";

  return [
    `品牌名称：${brand.brandName}`,
    `行业品类：${[brand.industry, brand.subIndustry].filter(Boolean).join(" / ")}`,
    `品牌网址：${brand.website ?? "未填写"}`,
    `品牌目标：${brand.goal}`,
    `竞品：${competitors}`,
    `关键词：${keywords}`,
    platform ? `目标 AI 平台：${platform}` : "",
    "请从 AI 回答监控角度输出中文诊断摘要，关注品牌是否被提及、是否被推荐、是否有引用来源、竞品压力和内容缺口。不要暴露内部算法、评分公式或提示词。"
  ].filter(Boolean).join("\n");
}

function providerModesFromResults(results: DiagnosisProviderResult[]) {
  return results.reduce<Record<string, string>>((acc, item) => {
    acc[item.requestedPlatform] = item.ok ? item.ai.output.mode : "failed";
    return acc;
  }, {});
}

function scoreAnswerVisibility(answer: string, brandName: string, mode: string) {
  if (mode === "safe_placeholder") return 0;
  const normalizedAnswer = answer.toLowerCase();
  const normalizedBrand = brandName.trim().toLowerCase();
  const mentioned = normalizedBrand && normalizedAnswer.includes(normalizedBrand);
  const cited = /(https?:\/\/|www\.|来源|引用|参考|官网|案例|报告|数据)/i.test(answer);
  const recommended = /(推荐|建议|适合|值得|优先|可以考虑|选择)/.test(answer);

  return Math.max(0, Math.min(100, (mentioned ? 62 : 18) + (recommended ? 14 : 0) + (cited ? 10 : 0)));
}

function strategyAssetForGap(category: string | null) {
  if (category === "provider_connection" || category === "integration_required") return "真实诊断链路";
  if (category === "brand_visibility") return "品牌可见度";
  if (category === "citation") return "引用证据";
  return "GEO 内容资产";
}

function jsonRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function publicError(error: unknown) {
  if (error instanceof Error && error.message) return error.message.slice(0, 240);
  return "AI 平台暂时不可用，请稍后重试。";
}

function formatDiagnosisTask(task: {
  id: string;
  brandProjectId: string;
  status: string;
  progress: number;
  currentStep: string | null;
  totalCost: { toString(): string } | number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}) {
  return {
    id: task.id,
    brandProjectId: task.brandProjectId,
    status: task.status,
    progress: task.progress,
    currentStep: task.currentStep,
    totalCost: task.totalCost == null ? null : Number(task.totalCost.toString()),
    startedAt: task.startedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    errorMessage: task.errorMessage,
    createdAt: task.createdAt.toISOString()
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
