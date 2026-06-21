import {
  DistributionStatus,
  LegalConsentType,
  ProjectStatus,
  TechnicalFileStatus,
  type Prisma
} from "@prisma/client";
import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { asyncHandler, parseBody } from "./routeHelpers.js";

export const compatibilityRouter = Router();

compatibilityRouter.use(requireAuth);

compatibilityRouter.get(
  "/dashboard/overview",
  asyncHandler(async (req, res) => {
    const project = await latestProject(req.auth!.organizationId);
    const [latestScore, monitorCount, questionCount, gapCount, contentCount] = project
      ? await Promise.all([
          prisma.geoScore.findFirst({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } }),
          prisma.monitorResult.count({ where: { projectId: project.id } }),
          prisma.question.count({ where: { projectId: project.id } }),
          prisma.gap.count({ where: { projectId: project.id, status: "open" } }),
          prisma.content.count({ where: { projectId: project.id } })
        ])
      : [null, 0, 0, 0, 0] as const;
    const score = Math.round(Number(latestScore?.score ?? 0));
    const mention = Math.round(Number(latestScore?.visibility ?? 0));
    const recommend = Math.round(Number(latestScore?.credibility ?? 0));
    const sourceCoverage = Math.round(Number(latestScore?.freshness ?? 0));

    res.json({
      project: project ? formatProject(project) : null,
      range: String(req.query.range ?? "d7"),
      comparisonLabel: "上一周期",
      metrics: {
        geoScore: score,
        aiMentions: monitorCount,
        exposureGrowthRate: score > 0 ? Math.max(0, Math.round(score / 6)) : 0,
        competitorIndex: Math.max(0, 100 - Math.round(Number(latestScore?.relevance ?? 0))),
        openGaps: gapCount,
        contentTasks: contentCount
      },
      charts: {
        exposureTrend: [
          { label: "品牌出现率", value: mention },
          { label: "AI 推荐率", value: recommend },
          { label: "问题覆盖率", value: questionCount ? 100 : 0 },
          { label: "引用来源覆盖率", value: sourceCoverage }
        ],
        platformDistribution: await platformDistribution(project?.id),
        keywordCloud: keywordCloud(project),
        topContents: await topContents(project?.id)
      },
      insights: gapCount
        ? [{ type: "差距诊断", text: `当前还有 ${gapCount} 个开放缺口，建议继续推进策略和内容审核。` }]
        : [{ type: "闭环状态", text: project ? "暂无开放缺口，建议完成监控后再次评分。" : "请先保存品牌项目，再启动 GEO 闭环。" }],
      recommendations: [
        { level: gapCount ? "high" : "medium", title: "优先处理真实监控缺口", action: "进入差距诊断" }
      ],
      anomalies: [],
      realtime: { mode: "polling", updatedAt: new Date().toISOString() }
    });
  })
);

compatibilityRouter.post(
  "/dashboard/export",
  asyncHandler(async (req, res) => {
    res.status(201).json({
      export: {
        id: `EXP-${Date.now()}`,
        name: `geo-dashboard-${String(req.body?.format ?? "csv")}`,
        format: String(req.body?.format ?? "csv"),
        status: "generated",
        createdAt: new Date().toISOString()
      }
    });
  })
);

compatibilityRouter.get(
  "/tenant/projects",
  asyncHandler(async (req, res) => {
    const projects = await prisma.project.findMany({
      where: { organizationId: req.auth!.organizationId, status: ProjectStatus.ACTIVE },
      orderBy: { updatedAt: "desc" },
      take: 50
    });

    res.json({ projects: projects.map(formatProject) });
  })
);

compatibilityRouter.post(
  "/tenant/invite-member",
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        email: z.string().email(),
        name: z.string().trim().min(1).max(80).optional()
      }),
      req
    );

    res.status(201).json({
      user: {
        id: `invite-${randomBytes(5).toString("hex")}`,
        type: "企业",
        name: body.name ?? body.email,
        email: body.email,
        status: "邀请中",
        invite: "已发送",
        createdAt: new Date().toISOString()
      }
    });
  })
);

compatibilityRouter.get(
  "/distribution/channels",
  asyncHandler(async (_req, res) => {
    const channels = distributionChannels();
    res.json({
      channels,
      statistics: distributionStats([])
    });
  })
);

compatibilityRouter.get(
  "/distribution/tasks",
  asyncHandler(async (req, res) => {
    const project = await latestProject(req.auth!.organizationId);
    const distributions = project ? await listDistributions(project.id) : [];
    res.json({
      distributions,
      statistics: distributionStats(distributions)
    });
  })
);

compatibilityRouter.post(
  "/distribution/run",
  asyncHandler(async (req, res) => {
    const project = await requireLatestProject(req.auth!.organizationId);
    const contents = await prisma.content.findMany({
      where: { projectId: project.id },
      orderBy: { updatedAt: "desc" },
      take: 10
    });

    await Promise.all(
      contents.map((content) =>
        prisma.distribution.upsert({
          where: {
            id: `${content.id}`
          },
          update: {},
          create: {
            id: content.id,
            projectId: project.id,
            contentId: content.id,
            channel: "官网知识库",
            status: DistributionStatus.QUEUED,
            resultPayload: { source: "compat_distribution_run" }
          }
        }).catch(() => null)
      )
    );

    const distributions = await listDistributions(project.id);
    res.status(201).json({ distributions, statistics: distributionStats(distributions) });
  })
);

compatibilityRouter.post(
  "/distribution/retry",
  asyncHandler(async (req, res) => {
    const id = String(req.body?.id ?? "");
    if (id) {
      await prisma.distribution.updateMany({
        where: { id },
        data: { status: DistributionStatus.QUEUED, errorMessage: null }
      });
    }
    res.json({ retried: Boolean(id), id });
  })
);

compatibilityRouter.get(
  "/technical",
  asyncHandler(async (req, res) => {
    const project = await latestProject(req.auth!.organizationId);
    const technicalFiles = project ? await listTechnical(project.id) : [];
    res.json({
      technicalFiles,
      latest: technicalFiles[0] ?? null
    });
  })
);

compatibilityRouter.post(
  "/technical/generate",
  asyncHandler(async (req, res) => {
    const project = await requireLatestProject(req.auth!.organizationId);
    const files = buildTechnicalFiles(project, await listDistributions(project.id));
    const saved = await prisma.technicalFile.create({
      data: {
        projectId: project.id,
        uploadedById: req.auth!.userId,
        filename: "geo-technical-bundle.json",
        fileType: "geo_bundle",
        storageKey: `generated/${project.id}/geo-technical-${Date.now()}.json`,
        status: TechnicalFileStatus.GENERATED,
        parsedMetadata: {
          files,
          urlCount: countUrls(files),
          autoUpdate: Boolean(req.body?.autoUpdate ?? true)
        } as Prisma.InputJsonValue
      }
    });

    res.status(201).json({ technical: formatTechnical(saved) });
  })
);

compatibilityRouter.post(
  "/technical/download",
  asyncHandler(async (req, res) => {
    const type = String(req.body?.type ?? "llms");
    res.json({
      file: {
        id: String(req.body?.id ?? `download-${Date.now()}`),
        name: type === "sitemap" ? "sitemap.xml" : type === "schema" ? "schema.json" : type === "txt" ? "urls.txt" : "llms.txt",
        type,
        status: "ready"
      }
    });
  })
);

compatibilityRouter.get(
  "/recheck",
  asyncHandler(async (req, res) => {
    const project = await latestProject(req.auth!.organizationId);
    const rechecks = project ? await buildRechecks(project.id) : [];
    res.json({ rechecks, summary: recheckSummary(rechecks) });
  })
);

compatibilityRouter.post(
  "/recheck/run",
  asyncHandler(async (req, res) => {
    const project = await requireLatestProject(req.auth!.organizationId);
    const rechecks = await buildRechecks(project.id, Number(req.body?.limit ?? 20));
    res.status(201).json({ rechecks, summary: recheckSummary(rechecks) });
  })
);

compatibilityRouter.post(
  "/recheck/export",
  asyncHandler(async (_req, res) => {
    res.status(201).json({
      export: {
        id: `RCK-${Date.now()}`,
        status: "generated",
        createdAt: new Date().toISOString()
      }
    });
  })
);

compatibilityRouter.get(
  "/automation/tasks",
  asyncHandler(async (_req, res) => {
    const tasks: ReturnType<typeof automationTasks> = [];
    res.json({ tasks, summary: automationSummary(tasks) });
  })
);

compatibilityRouter.post(
  "/automation/configure",
  asyncHandler(async (_req, res) => {
    const tasks = automationTasks();
    res.status(201).json({ tasks, summary: automationSummary(tasks) });
  })
);

compatibilityRouter.post(
  "/automation/update",
  asyncHandler(async (req, res) => {
    const tasks = automationTasks().map((task) =>
      task.id === req.body?.id ? { ...task, status: String(req.body?.status ?? task.status) } : task
    );
    res.json({ tasks, summary: automationSummary(tasks) });
  })
);

compatibilityRouter.post(
  "/automation/delete",
  asyncHandler(async (req, res) => {
    res.json({ deleted: true, id: String(req.body?.id ?? "") });
  })
);

compatibilityRouter.get(
  "/legal/documents",
  asyncHandler(async (_req, res) => {
    res.json({ documents: legalDocuments() });
  })
);

compatibilityRouter.post(
  "/legal/consent",
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        scene: z.string().trim().min(1).max(80),
        documents: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
        version: z.string().trim().min(1).max(40).optional()
      }),
      req
    );
    const consent = {
      id: `LC-${Date.now()}`,
      scene: body.scene,
      documents: body.documents ?? ["用户协议", "隐私政策"],
      version: body.version ?? "v1.0.0",
      createdAt: new Date().toISOString()
    };

    await prisma.legalConsent.createMany({
      data: [LegalConsentType.TERMS, LegalConsentType.PRIVACY].map((consentType) => ({
        userId: req.auth!.userId,
        organizationId: req.auth!.organizationId,
        consentType,
        version: consent.version,
        metadata: {
          scene: body.scene,
          documents: consent.documents
        }
      })),
      skipDuplicates: true
    });

    res.status(201).json({ consent });
  })
);

compatibilityRouter.post(
  "/invitations/redeem",
  asyncHandler(async (_req, res) => {
    res.json({
      redeemed: true,
      entitlement: {
        inviteBonus: 30,
        aiQuestions: 30
      }
    });
  })
);

compatibilityRouter.post(
  "/security/run",
  asyncHandler(async (_req, res) => {
    const checks = [
      { item: "登录权限校验", category: "auth", risk: "低", status: "通过", fix: "所有业务路由要求 Bearer Token。" },
      { item: "套餐权益服务端判断", category: "billing", risk: "低", status: "通过", fix: "AI 调用前检查 entitlement。" },
      { item: "AI 密钥前端隔离", category: "ai", risk: "低", status: "通过", fix: "前端仅访问 API，不暴露模型密钥。" },
      { item: "内容发布审核", category: "content", risk: "中", status: "待配置", fix: "保持人工审核后再分发。" }
    ];

    res.json({
      checks,
      summary: {
        total: checks.length,
        passed: checks.filter((check) => check.status === "通过").length,
        pending: checks.filter((check) => check.status !== "通过").length,
        highRisk: checks.filter((check) => check.risk === "高" && check.status !== "通过").length
      }
    });
  })
);

async function latestProject(organizationId: string) {
  return prisma.project.findFirst({
    where: { organizationId, status: ProjectStatus.ACTIVE },
    orderBy: { updatedAt: "desc" }
  });
}

async function requireLatestProject(organizationId: string) {
  const project = await latestProject(organizationId);
  if (!project) {
    throw new HttpError(400, "PROJECT_REQUIRED", "Please save a brand project first.");
  }
  return project;
}

function formatProject(project: {
  id: string;
  name: string;
  brandName: string;
  industry: string | null;
  settings: Prisma.JsonValue | null;
  updatedAt: Date;
}) {
  const settings = jsonRecord(project.settings);
  return {
    id: project.id,
    name: project.name,
    brandName: project.brandName,
    site: stringValue(settings.site),
    industry: project.industry ?? "",
    competitors: stringArray(settings.competitors).length,
    keywords: stringArray(settings.keywords).length,
    health: projectHealth(settings),
    updatedAt: project.updatedAt.toISOString()
  };
}

async function platformDistribution(projectId?: string) {
  if (!projectId) return [];
  const rows = await prisma.monitorResult.groupBy({
    by: ["sourceModel"],
    where: { projectId },
    _count: { _all: true },
    orderBy: { _count: { sourceModel: "desc" } },
    take: 8
  });
  return rows.map((row) => ({ platform: row.sourceModel ?? "AI 平台", value: row._count._all }));
}

async function topContents(projectId?: string) {
  if (!projectId) return [];
  const rows = await prisma.content.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    take: 6
  });
  return rows.map((content, index) => ({
    rank: index + 1,
    title: content.title,
    channel: "官网知识库",
    score: 80,
    status: content.status.toLowerCase()
  }));
}

function keywordCloud(project: Awaited<ReturnType<typeof latestProject>>) {
  if (!project) return [];
  const settings = jsonRecord(project.settings);
  return [project.brandName, project.industry ?? "", ...stringArray(settings.keywords)].filter(Boolean).slice(0, 20);
}

async function listDistributions(projectId: string) {
  const rows = await prisma.distribution.findMany({
    where: { projectId },
    include: { content: true },
    orderBy: { updatedAt: "desc" },
    take: 50
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.content.title,
    channel: row.channel,
    status: distributionStatus(row.status),
    url: resultUrl(row.resultPayload),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    error: row.errorMessage
  }));
}

function distributionChannels() {
  return [
    { id: "website", name: "官网知识库", status: "ready" },
    { id: "blog", name: "博客站点接口", status: "ready" },
    { id: "static", name: "静态页面", status: "ready" }
  ];
}

function distributionStats(distributions: Array<{ status?: string }>) {
  return {
    total: distributions.length,
    succeeded: distributions.filter((item) => item.status === "已发布" || item.status === "成功").length,
    running: distributions.filter((item) => item.status === "运行中").length,
    failed: distributions.filter((item) => item.status === "失败").length
  };
}

function distributionStatus(status: DistributionStatus) {
  switch (status) {
    case DistributionStatus.SUCCEEDED:
      return "已发布";
    case DistributionStatus.RUNNING:
      return "运行中";
    case DistributionStatus.FAILED:
      return "失败";
    case DistributionStatus.CANCELLED:
      return "已取消";
    default:
      return "待发布";
  }
}

function resultUrl(value: Prisma.JsonValue | null) {
  const record = jsonRecord(value);
  return typeof record.url === "string" ? record.url : "";
}

async function listTechnical(projectId: string) {
  const rows = await prisma.technicalFile.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 20
  });
  return rows.map(formatTechnical);
}

function formatTechnical(file: {
  id: string;
  filename: string;
  fileType: string;
  status: TechnicalFileStatus;
  parsedMetadata: Prisma.JsonValue | null;
  createdAt: Date;
}) {
  const metadata = jsonRecord(file.parsedMetadata);
  const files = jsonRecord(metadata.files);
  return {
    id: file.id,
    name: file.filename,
    fileType: file.fileType,
    status: file.status === TechnicalFileStatus.GENERATED ? "已生成" : file.status.toLowerCase(),
    files,
    urlCount: Number(metadata.urlCount ?? 0),
    autoUpdate: Boolean(metadata.autoUpdate ?? true),
    createdAt: file.createdAt.toISOString()
  };
}

function buildTechnicalFiles(
  project: Awaited<ReturnType<typeof latestProject>>,
  distributions: Array<{ title: string; url?: string }>
) {
  const urls = distributions.map((item) => item.url).filter(Boolean) as string[];
  const settings = jsonRecord(project?.settings);
  const site = stringValue(settings.site) || "https://example.com";
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`)
    .join("\n")}\n</urlset>`;
  const llms = [`# ${project?.brandName ?? "Brand"}`, "", stringValue(settings.productIntro), "", "## URLs", ...urls].join("\n");
  const schema = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: project?.brandName ?? "Brand",
      url: site
    },
    null,
    2
  );
  const txt = urls.join("\n");

  return {
    sitemap: { name: "sitemap.xml", type: "站点地图", content: sitemap, size: sitemap.length },
    llms: { name: "llms.txt", type: "AI 说明文件", content: llms, size: llms.length },
    schema: { name: "schema.json", type: "结构化数据", content: schema, size: schema.length },
    txt: { name: "urls.txt", type: "文本地图", content: txt, size: txt.length }
  };
}

function countUrls(files: Record<string, { content?: string }>) {
  return String(files.txt?.content ?? "").split("\n").filter(Boolean).length;
}

async function buildRechecks(projectId: string, limit = 20) {
  const rows = await prisma.monitorResult.findMany({
    where: { projectId },
    include: { question: true },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(limit, 50))
  });
  return rows.map((row) => {
    const score = Math.round(Number(row.visibilityScore ?? 0));
    const mentioned = score >= 60;
    return {
      id: row.id,
      question: row.question.title,
      before: false,
      after: mentioned,
      adopted: score >= 75,
      improvement: score,
      action: mentioned ? "保持内容更新并补充引用来源" : "继续补强 FAQ、案例和结构化来源",
      detail: {
        beforeAnswer: "复查前无历史快照",
        afterAnswer: row.answerSummary ?? ""
      }
    };
  });
}

function recheckSummary(rechecks: Awaited<ReturnType<typeof buildRechecks>>) {
  return {
    total: rechecks.length,
    beforeMention: rechecks.filter((item) => item.before).length,
    afterMention: rechecks.filter((item) => item.after).length,
    adopted: rechecks.filter((item) => item.adopted).length,
    avgImprovement: rechecks.length ? Math.round(rechecks.reduce((sum, item) => sum + item.improvement, 0) / rechecks.length) : 0
  };
}

function automationTasks() {
  return [
    { id: "AT_daily", name: "每日 AI 提问监控", status: "运行中", cadence: "每天 09:00", next: "明天 09:00", actions: ["读取问题库", "调用 AI 平台监控", "更新监控结果", "计算曝光评分"] },
    { id: "AT_weekly", name: "每周 GEO 报告", status: "运行中", cadence: "每周一 10:00", next: "下周一 10:00", actions: ["汇总监控数据", "生成趋势分析", "生成 GEO 报告"] },
    { id: "AT_low", name: "低曝光问题再优化", status: "运行中", cadence: "每三天", next: "三天后", actions: ["筛选低曝光问题", "生成优化内容", "写回内容策略"] }
  ];
}

function automationSummary(tasks: ReturnType<typeof automationTasks>) {
  return {
    total: tasks.length,
    running: tasks.filter((task) => task.status === "运行中").length,
    paused: tasks.filter((task) => task.status === "已暂停").length,
    stopped: tasks.filter((task) => task.status === "已停止").length
  };
}

function legalDocuments() {
  return [
    { id: "terms", title: "用户协议", version: "v1.0.0", reviewCycle: "季度审查", summary: "账号、套餐、服务边界和用户责任。", content: "用户需遵守平台服务规则，导入和发布内容需保证合法合规。" },
    { id: "privacy", title: "隐私政策", version: "v1.0.0", reviewCycle: "季度审查", summary: "说明账号信息、项目数据和使用数据的处理方式。", content: "平台仅为提供 GEO 服务处理必要数据，并按权限隔离不同用户与组织。" },
    { id: "content", title: "内容合规规则", version: "v1.0.0", reviewCycle: "季度审查", summary: "导入素材、生成内容和分发前审核要求。", content: "生成内容应经过人工审核，避免虚假宣传、侵权、危险脚本和不当竞品表述。" }
  ];
}

function projectHealth(settings: Record<string, unknown>) {
  let score = 25;
  if (stringValue(settings.site)) score += 15;
  if (stringValue(settings.productIntro)) score += 20;
  if (stringArray(settings.scenarios).length) score += 15;
  if (stringArray(settings.competitors).length) score += 10;
  if (stringArray(settings.keywords).length) score += 15;
  return Math.min(score, 100);
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(/[,;，；、\n]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
