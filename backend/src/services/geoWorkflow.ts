import { createHash, randomUUID } from "node:crypto";
import {
  AssetStatus,
  ContentStatus,
  MonitorStatus,
  ProjectStatus,
  type Prisma
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";
import type { AuthContext } from "../middleware/auth.js";
import { invokeAiGateway, listAiProviders } from "./aiGateway.js";
import { recordAuditEvent } from "./audit.js";

export interface WorkflowContext {
  auth: AuthContext;
}

interface ProjectSeedInput {
  projectId?: string;
  brandName?: string;
  industry?: string;
}

const unsafeExtensions = new Set([
  "bat",
  "cmd",
  "com",
  "exe",
  "hta",
  "html",
  "htm",
  "jar",
  "js",
  "mjs",
  "msi",
  "ps1",
  "scr",
  "sh",
  "svg",
  "vbs"
]);

const allowedMimeTypes = new Set([
  "application/json",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/markdown",
  "text/plain"
]);

export async function getQuestions(ctx: WorkflowContext, projectId?: string) {
  const project = await findProject(ctx.auth, projectId);

  if (!project) {
    return { questions: [] };
  }

  const questions = await prisma.question.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return { questions: questions.map(formatQuestion) };
}

export async function expandQuestions(
  ctx: WorkflowContext,
  input: {
    projectId?: string;
    brandName?: string;
    keywords?: string[];
    scenarios?: string | string[];
    limit?: number;
  }
) {
  const project = await ensureProject(ctx.auth, input);
  const keywords = normalizeList(input.keywords).slice(0, 12);
  const scenarios = normalizeList(input.scenarios).slice(0, 8);
  const seeds = keywords.length ? keywords : [project.brandName];
  const templates = [
    { intent: "buying", title: "%s should I choose for a growing team?" },
    { intent: "comparison", title: "How does %s compare with alternatives?" },
    { intent: "implementation", title: "What is the safest way to roll out %s?" },
    { intent: "pricing", title: "How should I evaluate %s pricing and value?" },
    { intent: "faq", title: "What should buyers know before using %s?" }
  ];

  const requestedLimit = clamp(input.limit ?? 12, 1, 30);
  const generated = seeds.flatMap((keyword) =>
    templates.map((template) => ({
      title: template.title.replace("%s", keyword),
      category: template.intent,
      source: "phase3_ai_gateway"
    }))
  );

  for (const scenario of scenarios) {
    generated.push({
      title: `What should ${project.brandName} answer when users ask about ${scenario}?`,
      category: "scenario",
      source: "phase3_ai_gateway"
    });
  }

  const ai = await invokeAiGateway({
    auth: ctx.auth,
    featureKey: "questions.generate",
    projectId: project.id,
    operation: "questions.expand",
    input: JSON.stringify({ brandName: project.brandName, keywords: seeds, scenarios, requestedLimit }),
    metadata: {
      itemCount: Math.min(generated.length, requestedLimit)
    }
  });

  const rows = await Promise.all(
    generated.slice(0, requestedLimit).map((item, index) =>
      prisma.question.create({
        data: {
          projectId: project.id,
          createdById: ctx.auth.userId,
          title: item.title,
          prompt: item.title,
          category: item.category,
          status: "active"
        }
      }).then((question) => ({
        ...formatQuestion(question),
        intent: item.category,
        source: item.source,
        recommend: 90 - Math.min(index * 3, 35),
        tags: [item.category, "backend"]
      }))
    )
  );

  return {
    project: formatProject(project),
    added: rows,
    usage: ai.usage,
    requestId: ai.requestId
  };
}

export async function runMonitor(
  ctx: WorkflowContext,
  input: {
    projectId?: string;
    platforms?: string[];
    limit?: number;
    providerCode?: string;
  }
) {
  const project = await ensureProject(ctx.auth, input);
  const platforms = normalizeList(input.platforms);
  const selectedPlatforms = (platforms.length ? platforms : listAiProviders().slice(0, 5).map((provider) => provider.name)).slice(0, 8);
  let questions = await prisma.question.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    take: clamp(input.limit ?? 12, 1, 30)
  });

  if (!questions.length) {
    const expanded = await expandQuestions(ctx, {
      projectId: project.id,
      brandName: project.brandName,
      keywords: [project.brandName],
      limit: 5
    });
    questions = await prisma.question.findMany({
      where: { id: { in: expanded.added.map((question) => question.id) } },
      orderBy: { createdAt: "desc" }
    });
  }

  const ai = await invokeAiGateway({
    auth: ctx.auth,
    featureKey: "monitor.run",
    providerCode: input.providerCode,
    projectId: project.id,
    operation: "monitor.run",
    input: JSON.stringify({
      projectId: project.id,
      questionCount: questions.length,
      platforms: selectedPlatforms
    }),
    metadata: {
      platforms: selectedPlatforms,
      questionCount: questions.length
    }
  });

  const provider = await prisma.modelProvider.findUnique({
    where: { code: ai.provider.code }
  });

  const pairs = questions.flatMap((question, qIndex) =>
    selectedPlatforms.map((platform, pIndex) => ({ question, platform, qIndex, pIndex }))
  ).slice(0, clamp(input.limit ?? 12, 1, 50));

  const results = await Promise.all(
    pairs.map(({ question, platform, qIndex, pIndex }) =>
      prisma.monitorResult.create({
        data: {
          projectId: project.id,
          questionId: question.id,
          modelProviderId: provider?.id,
          status: MonitorStatus.SUCCEEDED,
          sourceModel: platform,
          answerSummary: `${project.brandName} visibility snapshot for ${question.title}`,
          rawResponse: {
            mode: "safe_summary",
            requestId: ai.requestId,
            promptHidden: true
          },
          visibilityScore: String(65 + ((qIndex + pIndex) % 28)),
          startedAt: new Date(),
          completedAt: new Date()
        }
      }).then((result) => formatMonitorResult(result, question.title, platform, project.brandName, qIndex, pIndex))
    )
  );

  return {
    task: {
      id: ai.requestId,
      status: "completed",
      provider: ai.provider.code
    },
    results,
    usage: ai.usage
  };
}

export async function calculateScores(ctx: WorkflowContext, input: { projectId?: string }) {
  const project = await ensureProject(ctx.auth, input);
  const monitorResults = await prisma.monitorResult.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    take: 80
  });

  const base = monitorResults.length
    ? Math.round(
        monitorResults.reduce((sum, result) => sum + Number(result.visibilityScore ?? 0), 0) /
          monitorResults.length
      )
    : 72;
  const visibility = clamp(base, 0, 100);
  const credibility = clamp(base + 6, 0, 100);
  const relevance = clamp(base + 3, 0, 100);
  const freshness = clamp(70 + monitorResults.length, 0, 100);
  const score = Math.round((visibility + credibility + relevance + freshness) / 4);

  const saved = await prisma.geoScore.create({
    data: {
      projectId: project.id,
      monitorResultId: monitorResults[0]?.id,
      score: String(score),
      visibility: String(visibility),
      credibility: String(credibility),
      relevance: String(relevance),
      freshness: String(freshness),
      grade: gradeFor(score),
      explanation: "Calculated from Phase 3 monitor snapshots and safe local scoring weights."
    }
  });

  await recordAuditEvent({
    organizationId: ctx.auth.organizationId,
    actorUserId: ctx.auth.userId,
    action: "scores.calculate",
    resourceType: "geo_score",
    resourceId: saved.id,
    metadata: {
      projectId: project.id,
      monitorResults: monitorResults.length
    }
  });

  return {
    score: {
      id: saved.id,
      metrics: {
        mention: visibility,
        compete: Math.max(0, 100 - relevance),
        recommend: credibility,
        sourceCoverage: freshness,
        accuracy: relevance,
        coverage: monitorResults.length ? 100 : 70,
        gaps: Math.max(0, 100 - score)
      },
      grade: saved.grade,
      createdAt: saved.createdAt
    }
  };
}

export async function analyzeGaps(ctx: WorkflowContext, input: { projectId?: string; limit?: number }) {
  const project = await ensureProject(ctx.auth, input);
  const latestMonitor = await prisma.monitorResult.findMany({
    where: { projectId: project.id },
    include: { question: true },
    orderBy: { createdAt: "desc" },
    take: clamp(input.limit ?? 12, 1, 30)
  });
  const sourceItems = latestMonitor.length ? latestMonitor : [];

  const gaps = await Promise.all(
    (sourceItems.length ? sourceItems : [null, null, null]).map((monitor, index) =>
      prisma.gap.create({
        data: {
          projectId: project.id,
          monitorResultId: monitor?.id,
          title: index % 2 === 0 ? "Brand answer coverage gap" : "Competitor source pressure",
          category: index % 2 === 0 ? "coverage" : "competition",
          severity: index < 2 ? 3 : 2,
          description: monitor
            ? `Improve direct answer coverage for: ${monitor.question.title}`
            : `Create structured source material for ${project.brandName}.`,
          evidence: {
            mode: "safe_summary",
            promptHidden: true,
            monitorResultId: monitor?.id ?? null
          },
          status: "open"
        }
      }).then((gap) => formatGap(gap, monitor?.question.title))
    )
  );

  await recordAuditEvent({
    organizationId: ctx.auth.organizationId,
    actorUserId: ctx.auth.userId,
    action: "gaps.analyze",
    resourceType: "gap",
    metadata: {
      projectId: project.id,
      count: gaps.length
    }
  });

  return {
    gaps,
    summary: {
      total: gaps.length,
      high: gaps.filter((gap) => gap.severity === "high").length,
      estimatedImprovement: gaps.reduce((sum, gap) => sum + gap.impactScore, 0)
    }
  };
}

export async function generateStrategies(ctx: WorkflowContext, input: { projectId?: string; limit?: number }) {
  const project = await ensureProject(ctx.auth, input);
  const gaps = await prisma.gap.findMany({
    where: { projectId: project.id, status: "open" },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: clamp(input.limit ?? 12, 1, 30)
  });

  const ai = await invokeAiGateway({
    auth: ctx.auth,
    featureKey: "models.dispatch",
    projectId: project.id,
    operation: "strategies.generate",
    input: JSON.stringify({
      projectId: project.id,
      gapCount: gaps.length
    }),
    metadata: {
      gapCount: gaps.length
    }
  });

  const strategySeeds = gaps.length ? gaps : [undefined, undefined, undefined];
  const strategies = await Promise.all(
    strategySeeds.map((gap, index) =>
      prisma.strategy.create({
        data: {
          projectId: project.id,
          gapId: gap?.id,
          title: `${project.brandName} ${gap?.category ?? "content"} action plan`,
          objective: gap?.description ?? `Build source-ready answers for ${project.brandName}.`,
          priority: Math.max(1, 5 - index),
          actions: {
            mode: "safe_summary",
            steps: [
              "Create direct answer content",
              "Add factual source references",
              "Queue generated content for human review"
            ]
          },
          status: "draft"
        }
      }).then((strategy) => formatStrategy(strategy, gap, index))
    )
  );

  return {
    strategies,
    overview: {
      name: `${project.brandName} Phase 3 strategy`,
      status: "draft",
      objective: {
        target: strategies.length * 30,
        current: strategies.length * 12,
        progress: 40
      },
      keyMetrics: {
        contentPlanned: strategies.length,
        avgPredictedImpact: average(strategies.map((strategy) => strategy.predictedImpact)),
        highPriority: strategies.filter((strategy) => strategy.priority === "high").length,
        roi: 2.1
      }
    },
    keywordStrategy: strategies.slice(0, 8).map((strategy, index) => ({
      text: strategy.keyword,
      category: strategy.asset,
      priority: strategy.priority,
      metrics: { targetRank: index < 4 ? "Top 3" : "Top 10" },
      performance: { predictedImpact: strategy.predictedImpact }
    })),
    calendar: strategies.slice(0, 8).map((strategy, index) => ({
      week: strategy.calendarWeek,
      timing: strategy.publishTiming,
      title: strategy.title,
      channel: strategy.channel,
      owner: index % 2 === 0 ? "content" : "review"
    })),
    usage: ai.usage,
    requestId: ai.requestId
  };
}

export async function generateContents(ctx: WorkflowContext, input: { projectId?: string; limit?: number }) {
  const project = await ensureProject(ctx.auth, input);
  let strategies = await prisma.strategy.findMany({
    where: { projectId: project.id },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: clamp(input.limit ?? 12, 1, 30)
  });

  if (!strategies.length) {
    await generateStrategies(ctx, { projectId: project.id, limit: 5 });
    strategies = await prisma.strategy.findMany({
      where: { projectId: project.id },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: clamp(input.limit ?? 12, 1, 30)
    });
  }

  const ai = await invokeAiGateway({
    auth: ctx.auth,
    featureKey: "content.generate",
    projectId: project.id,
    operation: "contents.generate",
    input: JSON.stringify({
      projectId: project.id,
      strategyCount: strategies.length
    }),
    metadata: {
      strategyCount: strategies.length,
      reviewFlow: "pending_review"
    }
  });

  const provider = await prisma.modelProvider.findUnique({
    where: { code: ai.provider.code }
  });

  const contents = await Promise.all(
    strategies.map((strategy, index) => {
      const title = `${strategy.title} content draft`;
      return prisma.content.create({
        data: {
          projectId: project.id,
          strategyId: strategy.id,
          creatorId: ctx.auth.userId,
          modelProviderId: provider?.id,
          title,
          contentType: index % 3 === 0 ? "faq" : index % 3 === 1 ? "article" : "script",
          body: buildContentBody(project.brandName, strategy.title, strategy.objective),
          status: ContentStatus.PENDING_REVIEW,
          promptFingerprint: fingerprint(`${project.id}:${strategy.id}:${title}`),
          reviewNotes: "Generated by Phase 3 service and held for human review. It is not auto-published.",
          metadata: {
            phase: "phase3",
            requestId: ai.requestId,
            autoPublish: false
          }
        }
      }).then(formatContent)
    })
  );

  return {
    contents,
    statistics: contentStatistics(contents),
    usage: ai.usage,
    requestId: ai.requestId
  };
}

export async function generateReport(ctx: WorkflowContext, input: { projectId?: string; period?: string }) {
  const project = await ensureProject(ctx.auth, input);
  const [latestScore, gapCount, contentCount] = await Promise.all([
    prisma.geoScore.findFirst({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" }
    }),
    prisma.gap.count({ where: { projectId: project.id } }),
    prisma.content.count({ where: { projectId: project.id } })
  ]);

  const ai = await invokeAiGateway({
    auth: ctx.auth,
    featureKey: "reports.generate",
    projectId: project.id,
    operation: "reports.generate",
    input: JSON.stringify({
      projectId: project.id,
      period: input.period ?? "last_30_days",
      gapCount,
      contentCount
    }),
    metadata: {
      period: input.period ?? "last_30_days",
      gapCount,
      contentCount
    }
  });

  const score = Number(latestScore?.score ?? 72);
  const report = {
    id: ai.requestId,
    title: `${project.brandName} GEO Phase 3 report`,
    brandName: project.brandName,
    period: input.period ?? "last_30_days",
    status: "generated",
    summary: `Score ${score}; open gaps ${gapCount}; review queue ${contentCount}.`,
    scorecard: {
      mentionRate: Number(latestScore?.visibility ?? score),
      competitorPressure: Math.max(0, 100 - score),
      recommendRate: Number(latestScore?.credibility ?? score),
      sourceCoverage: Number(latestScore?.freshness ?? score)
    },
    sections: {
      nextActions: [
        "Review generated content before publication",
        "Attach approved source materials",
        "Rerun monitor after content changes"
      ]
    },
    downloads: {
      pdf: "#",
      word: "#",
      html: "#"
    },
    createdAt: new Date().toISOString()
  };

  return {
    report,
    usage: ai.usage,
    requestId: ai.requestId
  };
}

export async function listAssets(ctx: WorkflowContext, projectId?: string) {
  const assets = await prisma.asset.findMany({
    where: {
      organizationId: ctx.auth.organizationId,
      projectId: projectId ?? undefined
    },
    orderBy: { createdAt: "desc" },
    take: 80
  });

  const formatted = assets.map(formatAsset);

  return {
    assets: formatted,
    latest: formatted[0] ?? null
  };
}

export async function uploadAssetMetadata(
  ctx: WorkflowContext,
  input: {
    projectId?: string;
    type?: string;
    text?: string;
    filename?: string;
    mimeType?: string;
    sizeBytes?: number;
    files?: Array<{ name?: string; filename?: string; mimeType?: string; type?: string; size?: number; sizeBytes?: number }>;
  }
) {
  const project = await ensureProject(ctx.auth, input);
  const files = normalizeFiles(input);

  if (!files.length && !input.text?.trim()) {
    throw new HttpError(400, "VALIDATION_ERROR", "Either file metadata or text content is required.");
  }

  validateAssetPayload(input.text, files);

  const created = await Promise.all(
    (files.length ? files : [{ filename: `${input.type ?? "asset"}.txt`, mimeType: "text/plain", sizeBytes: input.text?.length ?? 0 }]).map(
      (file) =>
        prisma.asset.create({
          data: {
            organizationId: ctx.auth.organizationId,
            projectId: project.id,
            uploadedById: ctx.auth.userId,
            name: file.filename,
            assetType: input.type ?? "brand_material",
            mimeType: file.mimeType,
            sizeBytes: BigInt(file.sizeBytes),
            storageKey: `phase3/${ctx.auth.organizationId}/${randomUUID()}-${safeFilename(file.filename)}`,
            source: "api",
            status: AssetStatus.READY,
            metadata: {
              phase: "phase3",
              validation: "metadata_only",
              textChars: input.text?.length ?? 0,
              originalFilename: file.filename
            }
          }
        })
    )
  );

  await recordAuditEvent({
    organizationId: ctx.auth.organizationId,
    actorUserId: ctx.auth.userId,
    action: "asset.upload",
    resourceType: "asset",
    resourceId: created[0]?.id,
    metadata: {
      projectId: project.id,
      count: created.length,
      metadataOnly: true
    }
  });

  const asset = formatAssetGroup(created, input.text ?? "", project.brandName);

  return {
    asset,
    assets: created.map(formatAsset)
  };
}

async function ensureProject(auth: AuthContext, input: ProjectSeedInput) {
  if (input.projectId) {
    const project = await prisma.project.findFirst({
      where: {
        id: input.projectId,
        organizationId: auth.organizationId,
        status: ProjectStatus.ACTIVE
      }
    });

    if (!project) {
      throw new HttpError(404, "PROJECT_NOT_FOUND", "Project was not found.");
    }

    return project;
  }

  const existing = await prisma.project.findFirst({
    where: {
      organizationId: auth.organizationId,
      status: ProjectStatus.ACTIVE
    },
    orderBy: { updatedAt: "desc" }
  });

  if (existing) {
    return existing;
  }

  const brandName = trimOr(input.brandName, "Phase 3 Demo Brand");

  return prisma.project.create({
    data: {
      organizationId: auth.organizationId,
      ownerId: auth.userId,
      name: brandName,
      brandName,
      industry: trimOr(input.industry, "GEO"),
      settings: {
        createdBy: "phase3_placeholder",
        source: "api_default"
      }
    }
  });
}

async function findProject(auth: AuthContext, projectId?: string) {
  return prisma.project.findFirst({
    where: {
      organizationId: auth.organizationId,
      id: projectId ?? undefined,
      status: ProjectStatus.ACTIVE
    },
    orderBy: { updatedAt: "desc" }
  });
}

function normalizeFiles(input: {
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  files?: Array<{ name?: string; filename?: string; mimeType?: string; type?: string; size?: number; sizeBytes?: number }>;
}) {
  const files = [...(input.files ?? [])];

  if (input.filename) {
    files.push({
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes
    });
  }

  return files
    .map((file) => ({
      filename: trimOr(file.filename ?? file.name, "asset.txt"),
      mimeType: trimOr(file.mimeType ?? file.type, "text/plain"),
      sizeBytes: Math.max(0, Number(file.sizeBytes ?? file.size ?? 0))
    }))
    .slice(0, 12);
}

function validateAssetPayload(
  text: string | undefined,
  files: Array<{ filename: string; mimeType: string; sizeBytes: number }>
) {
  if (text && /<script|javascript:|data:text\/html/i.test(text)) {
    throw new HttpError(400, "UNSAFE_ASSET_CONTENT", "Asset text contains unsafe script content.");
  }

  for (const file of files) {
    const extension = file.filename.split(".").pop()?.toLowerCase() ?? "";

    if (unsafeExtensions.has(extension)) {
      throw new HttpError(400, "UNSAFE_ASSET_TYPE", "This file type is not accepted for asset upload.");
    }

    if (!allowedMimeTypes.has(file.mimeType)) {
      throw new HttpError(400, "UNSUPPORTED_ASSET_MIME", "Unsupported asset MIME type.");
    }

    if (file.sizeBytes > 10 * 1024 * 1024) {
      throw new HttpError(400, "ASSET_TOO_LARGE", "Asset metadata exceeds the 10MB upload limit.");
    }
  }
}

function normalizeList(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }

  const items = Array.isArray(value) ? value : value.split(/[,;\n]/);

  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.slice(0, 120));
}

function trimOr(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 160) : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Math.floor(value), min), max);
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function gradeFor(score: number) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "E";
}

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function formatProject(project: { id: string; name: string; brandName: string; industry: string | null }) {
  return {
    id: project.id,
    name: project.name,
    brandName: project.brandName,
    industry: project.industry
  };
}

function formatQuestion(question: { id: string; title: string; category: string | null; status: string; createdAt: Date }) {
  return {
    id: question.id,
    question: question.title,
    q: question.title,
    category: question.category ?? "general",
    status: question.status,
    createdAt: question.createdAt.toISOString()
  };
}

function formatMonitorResult(
  result: { id: string; answerSummary: string | null; visibilityScore: Prisma.Decimal | null; createdAt: Date },
  question: string,
  platform: string,
  brandName: string,
  qIndex: number,
  pIndex: number
) {
  const mention = (qIndex + pIndex) % 3 !== 0;

  return {
    id: result.id,
    platform,
    question,
    mention,
    competitors: mention ? [] : ["competitor"],
    rank: mention ? 1 + ((qIndex + pIndex) % 5) : "-",
    source: mention ? brandName : "competitor source",
    risk: mention ? "low" : "high",
    answerSnapshot: result.answerSummary ?? "",
    accuracyScore: Number(result.visibilityScore ?? 0),
    createdAt: result.createdAt.toISOString()
  };
}

function formatGap(
  gap: { id: string; title: string; category: string | null; severity: number; description: string | null; status: string },
  question?: string
) {
  const severity = gap.severity >= 3 ? "high" : gap.severity === 2 ? "medium" : "low";

  return {
    id: gap.id,
    title: gap.title,
    type: gap.category ?? "coverage",
    question: question ?? gap.description ?? gap.title,
    rootCause: gap.description,
    missing: gap.description,
    severity,
    impactScore: gap.severity * 10,
    recommendations: ["Generate reviewable content", "Attach approved sources"],
    asset: gap.category === "competition" ? "comparison page" : "faq page",
    status: gap.status
  };
}

function formatStrategy(
  strategy: { id: string; title: string; objective: string | null; priority: number; status: string },
  gap: { category: string | null; severity: number; description: string | null } | undefined,
  index: number
) {
  const priority = strategy.priority >= 4 ? "high" : strategy.priority >= 2 ? "medium" : "low";

  return {
    id: strategy.id,
    topic: gap?.description ?? strategy.title,
    title: strategy.title,
    keyword: gap?.category ?? "brand answer",
    priority,
    channel: "official knowledge base + source material",
    frequency: priority === "high" ? "weekly" : "biweekly",
    asset: gap?.category === "competition" ? "comparison page" : "faq page",
    type: gap?.category ?? "coverage",
    status: strategy.status,
    impactScore: (gap?.severity ?? 2) * 12,
    predictedImpact: Math.min(96, (gap?.severity ?? 2) * 24 + index * 2),
    lifecycle: index < 3 ? "new opportunity" : "optimization",
    calendarWeek: `week ${Math.floor(index / 3) + 1}`,
    publishTiming: index % 2 === 0 ? "Tuesday AM" : "Thursday PM"
  };
}

function buildContentBody(brandName: string, title: string, objective: string | null) {
  return [
    `# ${title}`,
    "",
    `This draft helps ${brandName} answer a verified customer question with source-ready structure.`,
    "",
    `Objective: ${objective ?? "Improve AI-visible answer coverage."}`,
    "",
    "Review checklist:",
    "- Confirm factual claims and source references.",
    "- Confirm brand and competitor wording.",
    "- Approve compliance before any distribution."
  ].join("\n");
}

function formatContent(content: {
  id: string;
  title: string;
  contentType: string;
  body: string | null;
  status: ContentStatus;
  reviewNotes: string | null;
  createdAt: Date;
}) {
  return {
    id: content.id,
    title: content.title,
    contentType: content.contentType,
    status: content.status === ContentStatus.PENDING_REVIEW ? "review" : content.status.toLowerCase(),
    reviewNote: content.reviewNotes,
    qualityScore: 82,
    channels: ["official knowledge base"],
    body: content.body ?? "",
    seo: {
      metaTitle: content.title,
      metaDescription: "Phase 3 generated draft waiting for human review."
    },
    author: "backend",
    createdAt: content.createdAt.toISOString()
  };
}

function contentStatistics(contents: ReturnType<typeof formatContent>[]) {
  const total = contents.length;
  const review = contents.filter((content) => content.status === "review").length;
  const draft = contents.filter((content) => content.status === "draft").length;
  const published = contents.filter((content) => content.status === "published").length;

  return {
    total,
    draft,
    review,
    published,
    avgQuality: total ? average(contents.map((content) => content.qualityScore)) : 0
  };
}

function formatAsset(asset: {
  id: string;
  name: string;
  assetType: string;
  mimeType: string | null;
  sizeBytes: bigint | null;
  status: AssetStatus;
  storageKey: string;
  createdAt: Date;
}) {
  return {
    id: asset.id,
    materialType: asset.assetType,
    files: [
      {
        id: asset.id,
        name: asset.name,
        type: asset.assetType,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes?.toString() ?? "0",
        status: asset.status.toLowerCase(),
        progress: 100,
        storageKey: asset.storageKey,
        time: asset.createdAt.toISOString()
      }
    ],
    libraries: {},
    status: asset.status.toLowerCase(),
    createdAt: asset.createdAt.toISOString()
  };
}

function formatAssetGroup(
  assets: Array<{
    id: string;
    name: string;
    assetType: string;
    mimeType: string | null;
    sizeBytes: bigint | null;
    status: AssetStatus;
    storageKey: string;
    createdAt: Date;
  }>,
  text: string,
  brandName: string
) {
  const first = assets[0];

  return {
    id: first?.id ?? randomUUID(),
    materialType: first?.assetType ?? "brand_material",
    files: assets.flatMap((asset) => formatAsset(asset).files),
    libraries: {
      knowledge: text ? `# ${brandName} knowledge\n\n${text}` : "",
      titles: "",
      keywords: "",
      prompts: "",
      summary: {
        assets: assets.length,
        knowledgeChars: text.length
      }
    },
    status: "ready",
    createdAt: first?.createdAt.toISOString() ?? new Date().toISOString()
  };
}
