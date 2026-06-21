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

export async function clearQuestions(ctx: WorkflowContext, input: { projectId?: string } = {}) {
  const project = await findProject(ctx.auth, input.projectId);

  if (!project) {
    return { deleted: 0, scope: input.projectId ? "project" : "organization" };
  }

  const result = await prisma.question.deleteMany({
    where: { projectId: project.id }
  });

  await recordAuditEvent({
    organizationId: ctx.auth.organizationId,
    actorUserId: ctx.auth.userId,
    action: "questions.clear",
    resourceType: "question",
    metadata: {
      projectId: project.id,
      deleted: result.count
    }
  });

  return { deleted: result.count, scope: "project", projectId: project.id };
}

export async function expandQuestions(
  ctx: WorkflowContext,
  input: {
    projectId?: string;
    brandName?: string;
    productIntro?: string;
    industry?: string;
    targetAudience?: string;
    competitors?: string[];
    keywords?: string[];
    scenarios?: string | string[];
    valueProps?: string | string[];
    promotionGoal?: string;
    targetAction?: string;
    preferredPlatforms?: string[];
    limit?: number;
  }
) {
﻿  const project = await ensureProject(ctx.auth, input);
  const keywords = normalizeList(input.keywords).slice(0, 12);
  const scenarios = normalizeList(input.scenarios).slice(0, 8);
  const competitors = normalizeList(input.competitors).slice(0, 8);
  const valueProps = normalizeList(input.valueProps).slice(0, 8);
  const platforms = normalizeList(input.preferredPlatforms).slice(0, 6);
  const seeds = keywords.length ? keywords : [project.brandName];
  const requestedLimit = clamp(input.limit ?? 12, 1, 30);
  const templates = [
    { intent: "buying", title: "{brand}\u662f\u5426\u503c\u5f97\u9009\u62e9\uff1f\u9002\u5408\u54ea\u4e9b\u7528\u6237\uff1f" },
    { intent: "comparison", title: "{brand}\u548c{competitor}\u600e\u4e48\u9009\uff1f\u5404\u81ea\u4f18\u52bf\u662f\u4ec0\u4e48\uff1f" },
    { intent: "tutorial", title: "{brand}\u5982\u4f55\u843d\u5730\u5230{scenario}\u573a\u666f\uff1f" },
    { intent: "avoidance", title: "\u9009\u62e9{brand}\u524d\u9700\u8981\u6ce8\u610f\u54ea\u4e9b\u5751\uff1f" },
    { intent: "faq", title: "\u5173\u4e8e{brand}\uff0cAI \u5e94\u8be5\u5982\u4f55\u56de\u7b54\u7528\u6237\u5e38\u89c1\u95ee\u9898\uff1f" },
    { intent: "case", title: "{brand}\u5728{scenario}\u91cc\u6709\u54ea\u4e9b\u53ef\u53c2\u8003\u6848\u4f8b\uff1f" },
    { intent: "list", title: "{industry}\u9886\u57df\u91cc\u6709\u54ea\u4e9b\u503c\u5f97\u5173\u6ce8\u7684\u5de5\u5177\u6216\u54c1\u724c\uff1f" },
    { intent: "recommendation", title: "\u7528\u6237\u5728{platform}\u4e0a\u95ee{keyword}\u65f6\uff0cAI \u4f1a\u4e0d\u4f1a\u63a8\u8350{brand}\uff1f" }
  ];
  const context = {
    brand: project.brandName,
    industry: input.industry ?? project.industry ?? "GEO",
    keyword: seeds[0] ?? project.brandName,
    competitor: competitors[0] ?? "\u4e3b\u8981\u7ade\u54c1",
    scenario: scenarios[0] ?? "\u5b9e\u9645\u4e1a\u52a1",
    platform: platforms[0] ?? "AI \u5e73\u53f0"
  };
  const fill = (template: string) => template
    .replace(/\{brand\}/g, context.brand)
    .replace(/\{industry\}/g, context.industry)
    .replace(/\{keyword\}/g, context.keyword)
    .replace(/\{competitor\}/g, context.competitor)
    .replace(/\{scenario\}/g, context.scenario)
    .replace(/\{platform\}/g, context.platform);
  const generated = templates.map((template) => ({
    title: fill(template.title),
    category: template.intent,
    source: "diagnosis_question_seed"
  }));

  for (const keyword of seeds.slice(0, 6)) {
    generated.push({
      title: project.brandName + "\u5728\u300c" + keyword + "\u300d\u76f8\u5173 AI \u95ee\u7b54\u4e2d\u7684\u63a8\u8350\u60c5\u51b5\u600e\u4e48\u6837\uff1f",
      category: "monitor",
      source: "keyword_monitor"
    });
  }
  for (const competitor of competitors.slice(0, 5)) {
    generated.push({
      title: project.brandName + "\u548c" + competitor + "\u5728 AI \u7b54\u6848\u4e2d\u8c01\u66f4\u5bb9\u6613\u88ab\u63a8\u8350\uff1f",
      category: "comparison",
      source: "competitor_monitor"
    });
  }
  for (const value of valueProps.slice(0, 4)) {
    generated.push({
      title: "AI \u662f\u5426\u7406\u89e3" + project.brandName + "\u7684\u4f18\u52bf\uff1a" + value + "\uff1f",
      category: "positioning",
      source: "value_prop_monitor"
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
  const requestedPlatforms = normalizeList(input.platforms);
  const requestedProviderCodes = input.providerCode ? [input.providerCode] : requestedPlatforms;
  const selectedProviders = listAiProviders()
    .filter((provider) => provider.configured)
    .filter((provider) =>
      requestedProviderCodes.length
        ? requestedProviderCodes.some((value) => matchesProvider(provider, value))
        : true
    )
    .slice(0, 8);
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

  if (!selectedProviders.length) {
    await recordAuditEvent({
      organizationId: ctx.auth.organizationId,
      actorUserId: ctx.auth.userId,
      action: "monitor.skipped",
      resourceType: "monitor_result",
      metadata: {
        projectId: project.id,
        reason: "no_configured_provider",
        requestedProviders: requestedProviderCodes
      }
    });

    return {
      task: {
        id: `monitor-skipped-${Date.now()}`,
        status: "skipped",
        provider: null,
        message: "No configured AI provider was available, so no monitor result was generated."
      },
      results: [],
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        remaining: null
      }
    };
  }

  const pairs = questions.flatMap((question) =>
    selectedProviders.map((provider) => ({ question, provider }))
  ).slice(0, clamp(input.limit ?? 12, 1, 50));
  const results = [];
  const totalUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    remaining: null as number | null
  };

  for (const { question, provider } of pairs) {
    const startedAt = new Date();
    const ai = await invokeAiGateway({
      auth: ctx.auth,
      featureKey: "monitor.run",
      providerCode: provider.code,
      projectId: project.id,
      operation: "monitor.run",
      input: JSON.stringify({
        brandName: project.brandName,
        industry: project.industry,
        question: question.title,
        platform: provider.name,
        rule: "Ask the real model to answer the user question as an AI answer engine would. Return concise Chinese observations about brand mention, recommendation, sources, competitor pressure, and missing evidence."
      }),
      metadata: {
        provider: provider.code,
        questionId: question.id
      }
    });

    totalUsage.promptTokens += ai.usage.promptTokens;
    totalUsage.completionTokens += ai.usage.completionTokens;
    totalUsage.totalTokens += ai.usage.totalTokens;
    totalUsage.remaining = ai.usage.remaining;

    if (ai.output.mode !== "live") {
      continue;
    }

    const signal = scoreMonitorAnswer(ai.output.summary, project.brandName, question.title);
    const saved = await prisma.monitorResult.create({
      data: {
        projectId: project.id,
        questionId: question.id,
        modelProviderId: ai.provider.id,
        status: MonitorStatus.SUCCEEDED,
        sourceModel: ai.provider.name,
        answerSummary: ai.output.summary.slice(0, 4000),
        rawResponse: {
          mode: "live_summary",
          requestId: ai.requestId,
          provider: ai.provider.code,
          model: ai.model,
          signal: signalJson(signal),
          promptHidden: true
        },
        visibilityScore: String(signal.visibility),
        startedAt,
        completedAt: new Date()
      }
    });

    results.push(formatMonitorResult(saved, question.title, ai.provider.name, project.brandName));
  }

  return {
    task: {
      id: `monitor-${Date.now()}`,
      status: results.length ? "completed" : "skipped",
      provider: selectedProviders.map((provider) => provider.code).join(",")
    },
    results,
    usage: totalUsage
  };
}

export async function calculateScores(ctx: WorkflowContext, input: { projectId?: string }) {
  const project = await ensureProject(ctx.auth, input);
  const monitorResults = await prisma.monitorResult.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    take: 80
  });
  const realMonitorResults = monitorResults.filter(isRealMonitorResult);

  if (!realMonitorResults.length) {
    throw new HttpError(400, "NO_LIVE_MONITOR_RESULTS", "Run AI answer monitoring with a configured provider before calculating GEO scores.");
  }

  const signals = realMonitorResults.map((result) => signalFromMonitorResult(result, project.brandName, ""));
  const visibility = average(realMonitorResults.map((result) => Number(result.visibilityScore ?? 0)));
  const credibility = average(signals.map((signal) => signal.citationScore));
  const relevance = average(signals.map((signal) => signal.relevance));
  const freshness = average(signals.map((signal) => signal.freshness));
  const competitorPressure = average(signals.map((signal) => signal.competitorPressure));
  const questionCount = await prisma.question.count({ where: { projectId: project.id } });
  const coverage = questionCount
    ? clamp(Math.round((new Set(realMonitorResults.map((result) => result.questionId)).size / questionCount) * 100), 0, 100)
    : 0;
  const score = Math.round((visibility + credibility + relevance + freshness) / 4);

  const saved = await prisma.geoScore.create({
    data: {
      projectId: project.id,
      monitorResultId: realMonitorResults[0]?.id,
      score: String(score),
      visibility: String(visibility),
      credibility: String(credibility),
      relevance: String(relevance),
      freshness: String(freshness),
      grade: gradeFor(score),
      explanation: "Calculated from live AI monitor answers, brand mention, citation evidence, relevance, freshness, and competitor pressure signals."
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
      monitorResults: realMonitorResults.length
    }
  });

  return {
    score: {
      id: saved.id,
      metrics: {
        mention: visibility,
        compete: competitorPressure,
        recommend: credibility,
        sourceCoverage: freshness,
        accuracy: relevance,
        coverage,
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
  const sourceItems = latestMonitor.filter(isRealMonitorResult);

  if (!sourceItems.length) {
    throw new HttpError(400, "NO_LIVE_MONITOR_RESULTS", "Run AI answer monitoring with a configured provider before diagnosing gaps.");
  }

  const gapSeeds = sourceItems.flatMap((monitor) => gapSeedsFromMonitor(monitor, project.brandName));
  const gaps = await Promise.all(
    gapSeeds.slice(0, clamp(input.limit ?? 12, 1, 30)).map((seed) =>
      prisma.gap.create({
        data: {
          projectId: project.id,
          monitorResultId: seed.monitor.id,
          title: seed.title,
          category: seed.category,
          severity: seed.severity,
          description: seed.description,
          evidence: {
            mode: "live_summary",
            monitorResultId: seed.monitor.id,
            questionId: seed.monitor.questionId,
            platform: seed.monitor.sourceModel,
            score: Number(seed.monitor.visibilityScore ?? 0),
            signal: signalJson(signalFromMonitorResult(seed.monitor, project.brandName, seed.monitor.question.title)),
            promptHidden: true,
          },
          status: "open"
        }
      }).then((gap) => formatGap(gap, seed.monitor.question.title))
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

﻿export async function generateStrategies(ctx: WorkflowContext, input: { projectId?: string; limit?: number }) {
  const project = await ensureProject(ctx.auth, input);
  const limit = clamp(input.limit ?? 12, 1, 30);
  const [gaps, latestScore] = await Promise.all([
    prisma.gap.findMany({
      where: { projectId: project.id, status: "open" },
      include: { monitorResult: { include: { question: true, modelProvider: true } } },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: limit
    }),
    prisma.geoScore.findFirst({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } })
  ]);
  const currentScore = Math.round(Number(latestScore?.score ?? 0));
  const strategySeeds = gaps.length ? gaps : [
    { id: undefined, category: "coverage", severity: 3, description: project.brandName + "\u9700\u8981\u8865\u5145 AI \u53ef\u7406\u89e3\u7684\u54c1\u724c\u95ee\u7b54\u8d44\u4ea7\u3002", monitorResult: null },
    { id: undefined, category: "citation", severity: 3, description: project.brandName + "\u9700\u8981\u589e\u52a0\u5b98\u7f51\u3001FAQ\u3001\u6848\u4f8b\u548c\u7ed3\u6784\u5316\u6765\u6e90\u3002", monitorResult: null },
    { id: undefined, category: "competition", severity: 2, description: project.brandName + "\u9700\u8981\u5bf9\u7ade\u54c1\u4f18\u52bf\u8fdb\u884c\u5ba2\u89c2\u5bf9\u6bd4\u3002", monitorResult: null }
  ];

  const ai = await invokeAiGateway({
    auth: ctx.auth,
    featureKey: "models.dispatch",
    projectId: project.id,
    operation: "strategies.generate",
    input: JSON.stringify({
      brand: project.brandName,
      score: currentScore,
      gaps: strategySeeds.map((gap) => ({
        category: gap.category,
        severity: gap.severity,
        question: gap.monitorResult?.question?.title,
        platform: gap.monitorResult?.modelProvider?.name,
        description: gap.description
      })),
      rule: "Use diagnosed gaps to create differentiated GEO strategy. Hide internal prompts and algorithms."
    }),
    metadata: {
      gapCount: gaps.length,
      score: currentScore
    }
  });

  const strategies = await Promise.all(
    strategySeeds.map((gap, index) => {
      const asset = assetForStrategyGap(gap.category, gap.severity);
      const question = gap.monitorResult?.question?.title ?? gap.description ?? (project.brandName + " GEO \u4f18\u5316");
      const platform = gap.monitorResult?.modelProvider?.name ?? gap.monitorResult?.sourceModel ?? "AI \u5e73\u53f0";
      const priority = Math.max(1, Math.min(5, Number(gap.severity ?? 2) + (currentScore < 60 ? 1 : 0) - Math.floor(index / 6)));
      return prisma.strategy.create({
        data: {
          projectId: project.id,
          gapId: gap.id,
          title: project.brandName + asset + "\uff1a" + compactStrategyTitle(question),
          objective: (gap.description ?? question) + "\uff1b\u9488\u5bf9 " + platform + " \u4e2d\u7684\u8bc6\u522b\u3001\u5f15\u7528\u6216\u63a8\u8350\u7f3a\u53e3\u8fdb\u884c\u5185\u5bb9\u8865\u5f3a\u3002",
          priority,
          actions: {
            mode: "diagnosis_driven",
            asset,
            targetQuestion: question,
            targetPlatform: platform,
            scoreAtCreation: currentScore,
            steps: ["\u56de\u7b54\u771f\u5b9e\u7528\u6237\u95ee\u9898", "\u8865\u5145\u54c1\u724c\u4f18\u52bf\u4e0e\u8bc1\u636e", "\u751f\u6210 FAQ \u4e0e\u7ed3\u6784\u5316\u7247\u6bb5", "\u4eba\u5de5\u5ba1\u6838\u540e\u518d\u5206\u53d1"]
          },
          status: "draft"
        }
      }).then((strategy) => formatStrategy(strategy, gap, index));
    })
  );

  return {
    strategies,
    overview: {
      name: project.brandName + " GEO \u8bca\u65ad\u9a71\u52a8\u7b56\u7565",
      status: "draft",
      objective: {
        target: Math.max(60, strategies.length * 18),
        current: currentScore,
        progress: Math.min(100, Math.max(5, currentScore))
      },
      keyMetrics: {
        contentPlanned: strategies.length,
        avgPredictedImpact: average(strategies.map((strategy) => strategy.predictedImpact)),
        highPriority: strategies.filter((strategy) => strategy.priority === "high").length,
        roi: Number((1.4 + strategies.filter((strategy) => strategy.priority === "high").length * 0.3).toFixed(1))
      },
      focusAreas: [
        { topic: "AI \u7b54\u6848\u51fa\u73b0\u7387", weight: 30, status: currentScore >= 70 ? "\u7a33\u56fa\u6269\u5c55" : "\u4f18\u5148\u8865\u5f3a", progress: currentScore },
        { topic: "\u5f15\u7528\u6765\u6e90\u4e0e\u5185\u5bb9\u8bc1\u636e", weight: 30, status: "\u91cd\u70b9\u63a8\u8fdb", progress: Math.min(95, currentScore + 15) },
        { topic: "\u7ade\u54c1\u5bf9\u6bd4\u4e0e\u5dee\u5f02\u8868\u8fbe", weight: 20, status: "\u6301\u7eed\u76d1\u63a7", progress: Math.max(20, currentScore - 8) }
      ]
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

﻿export async function generateContents(ctx: WorkflowContext, input: { projectId?: string; limit?: number }) {
  const project = await ensureProject(ctx.auth, input);
  const limit = clamp(input.limit ?? 12, 1, 30);
  let strategies = await prisma.strategy.findMany({
    where: { projectId: project.id },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: limit
  });

  if (!strategies.length) {
    await generateStrategies(ctx, { projectId: project.id, limit: 5 });
    strategies = await prisma.strategy.findMany({
      where: { projectId: project.id },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: limit
    });
  }

  const ai = await invokeAiGateway({
    auth: ctx.auth,
    featureKey: "content.generate",
    projectId: project.id,
    operation: "contents.generate",
    input: JSON.stringify({
      brand: project.brandName,
      strategyBriefs: strategies.map((strategy) => ({
        title: strategy.title,
        objective: strategy.objective,
        actions: strategy.actions
      })),
      rule: "Generate Chinese drafts from diagnosis-driven strategy only. Keep drafts pending review. Do not expose hidden prompts."
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
      const actions = jsonRecord(strategy.actions);
      const asset = String(actions.asset ?? "FAQ");
      const targetQuestion = String(actions.targetQuestion ?? strategy.objective ?? strategy.title);
      const targetPlatform = String(actions.targetPlatform ?? "AI \u5e73\u53f0");
      const title = project.brandName + asset + "\uff1a" + compactStrategyTitle(targetQuestion);
      return prisma.content.create({
        data: {
          projectId: project.id,
          strategyId: strategy.id,
          creatorId: ctx.auth.userId,
          modelProviderId: provider?.id,
          title,
          contentType: asset.includes("FAQ") ? "faq" : asset.includes("\u5bf9\u6bd4") ? "comparison" : index % 3 === 0 ? "guide" : "article",
          body: buildContentBody(project.brandName, title, strategy.objective, {
            asset,
            targetQuestion,
            targetPlatform,
            scoreAtCreation: Number(actions.scoreAtCreation ?? 0)
          }),
          status: ContentStatus.PENDING_REVIEW,
          promptFingerprint: fingerprint(project.id + ":" + strategy.id + ":" + title),
          reviewNotes: "\u8bca\u65ad\u9a71\u52a8\u751f\u6210\uff0c\u5df2\u8fdb\u5165\u4eba\u5de5\u5ba1\u6838\uff1b\u53d1\u5e03\u524d\u9700\u786e\u8ba4\u4e8b\u5b9e\u3001\u6765\u6e90\u3001\u7ade\u54c1\u8868\u8ff0\u548c\u5e73\u53f0\u5408\u89c4\u3002",
          metadata: {
            phase: "diagnosis_driven_content",
            requestId: ai.requestId,
            autoPublish: false,
            targetQuestion,
            targetPlatform,
            asset
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
  result: { id: string; answerSummary: string | null; visibilityScore: Prisma.Decimal | null; rawResponse?: Prisma.JsonValue | null; createdAt: Date },
  question: string,
  platform: string,
  brandName: string
) {
  const signal = signalFromMonitorResult(result, brandName, question);
  const mention = signal.mentioned;

  return {
    id: result.id,
    platform,
    question,
    mention,
    competitors: signal.competitorPressure >= 60 ? ["发现竞品压力"] : [],
    rank: mention ? 1 : "-",
    source: signal.cited ? "可识别引用来源" : "未识别引用来源",
    risk: signal.visibility >= 70 ? "low" : signal.visibility >= 45 ? "medium" : "high",
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
    recommendations: ["生成可审核内容", "补充官网、案例或第三方来源"],
    asset: gap.category === "competition" ? "对比页" : "FAQ / 证据页",
    status: gap.status
  };
}

function jsonRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function matchesProvider(provider: { code: string; name: string }, value: string) {
  const normalized = value.trim().toLowerCase();
  return provider.code.toLowerCase() === normalized || provider.name.toLowerCase() === normalized;
}

interface MonitorSignal {
  mentioned: boolean;
  recommended: boolean;
  cited: boolean;
  competitorMentioned: boolean;
  visibility: number;
  citationScore: number;
  relevance: number;
  freshness: number;
  competitorPressure: number;
}

function signalJson(signal: MonitorSignal): Prisma.InputJsonObject {
  return {
    mentioned: signal.mentioned,
    recommended: signal.recommended,
    cited: signal.cited,
    competitorMentioned: signal.competitorMentioned,
    visibility: signal.visibility,
    citationScore: signal.citationScore,
    relevance: signal.relevance,
    freshness: signal.freshness,
    competitorPressure: signal.competitorPressure
  };
}

function isRealMonitorResult(result: {
  status: MonitorStatus;
  answerSummary: string | null;
  visibilityScore: Prisma.Decimal | null;
  rawResponse: Prisma.JsonValue | null;
}) {
  const raw = jsonRecord(result.rawResponse);
  return result.status === MonitorStatus.SUCCEEDED && raw.mode === "live_summary" && Boolean(result.answerSummary) && result.visibilityScore !== null;
}

function signalFromMonitorResult(
  result: { answerSummary: string | null; rawResponse?: Prisma.JsonValue | null },
  brandName: string,
  question: string
): MonitorSignal {
  const raw = jsonRecord(result.rawResponse);
  const saved = jsonRecord(raw.signal as Prisma.JsonValue | null | undefined);

  if (typeof saved.visibility === "number") {
    return {
      mentioned: Boolean(saved.mentioned),
      recommended: Boolean(saved.recommended),
      cited: Boolean(saved.cited),
      competitorMentioned: Boolean(saved.competitorMentioned),
      visibility: clamp(Number(saved.visibility), 0, 100),
      citationScore: clamp(Number(saved.citationScore ?? 0), 0, 100),
      relevance: clamp(Number(saved.relevance ?? 0), 0, 100),
      freshness: clamp(Number(saved.freshness ?? 0), 0, 100),
      competitorPressure: clamp(Number(saved.competitorPressure ?? 0), 0, 100)
    };
  }

  return scoreMonitorAnswer(result.answerSummary ?? "", brandName, question);
}

function scoreMonitorAnswer(answer: string, brandName: string, question: string): MonitorSignal {
  const normalizedAnswer = answer.toLowerCase();
  const normalizedBrand = brandName.trim().toLowerCase();
  const compactBrand = normalizedBrand.replace(/\s+/g, "");
  const compactAnswer = normalizedAnswer.replace(/\s+/g, "");
  const mentioned = Boolean(normalizedBrand && (normalizedAnswer.includes(normalizedBrand) || compactAnswer.includes(compactBrand)));
  const recommended = /推荐|建议|适合|值得|优先|首选|可以考虑|选择/.test(answer);
  const cited = /(https?:\/\/|www\.|来源|引用|参考|官网|案例|报告|数据|白皮书)/i.test(answer);
  const competitorMentioned = /竞品|替代|对比|相比|不如|优于|其他品牌|同类/.test(answer);
  const questionTerms = question
    .split(/[^\p{L}\p{N}]+/u)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length >= 2)
    .slice(0, 12);
  const overlap = questionTerms.length
    ? questionTerms.filter((term) => normalizedAnswer.includes(term)).length / questionTerms.length
    : 0;
  const answerDepth = answer.length >= 300 ? 20 : answer.length >= 120 ? 12 : answer.length >= 40 ? 6 : 0;
  const visibility = clamp((mentioned ? 62 : 18) + (recommended ? 14 : 0) + (cited ? 10 : 0) - (!mentioned && competitorMentioned ? 10 : 0), 0, 100);
  const citationScore = clamp((cited ? 58 : 22) + (mentioned ? 18 : 0) + answerDepth, 0, 100);
  const relevance = clamp((overlap ? Math.round(overlap * 55) : 25) + (mentioned ? 15 : 0) + answerDepth, 0, 100);
  const freshness = clamp((/(2025|2026|最新|近期|当前|今年|更新)/.test(answer) ? 70 : 45) + (cited ? 15 : 0), 0, 100);
  const competitorPressure = clamp(competitorMentioned ? (mentioned ? 45 : 75) : mentioned ? 20 : 45, 0, 100);

  return {
    mentioned,
    recommended,
    cited,
    competitorMentioned,
    visibility,
    citationScore,
    relevance,
    freshness,
    competitorPressure
  };
}

function gapSeedsFromMonitor(
  monitor: {
    id: string;
    questionId: string;
    question: { title: string };
    answerSummary: string | null;
    rawResponse: Prisma.JsonValue | null;
    sourceModel: string | null;
    visibilityScore: Prisma.Decimal | null;
    status: MonitorStatus;
  },
  brandName: string
) {
  const signal = signalFromMonitorResult(monitor, brandName, monitor.question.title);
  const seeds: Array<{
    monitor: typeof monitor;
    title: string;
    category: string;
    severity: number;
    description: string;
  }> = [];

  if (!signal.mentioned || signal.visibility < 50) {
    seeds.push({
      monitor,
      title: `${brandName} 在该问题回答中未被稳定提及`,
      category: "brand_visibility",
      severity: 3,
      description: `问题「${monitor.question.title}」的真实 AI 回答没有形成稳定品牌露出，需要补充直接回答、适用场景和品牌证据。`
    });
  }

  if (!signal.cited || signal.citationScore < 60) {
    seeds.push({
      monitor,
      title: "引用来源与证据不足",
      category: "citation",
      severity: signal.mentioned ? 2 : 3,
      description: `回答中缺少可被 AI 采信的官网、案例、数据或结构化来源，建议补充 FAQ、案例页、llms.txt 和 Schema。`
    });
  }

  if (!signal.recommended) {
    seeds.push({
      monitor,
      title: "推荐理由不清晰",
      category: "recommendation",
      severity: 2,
      description: `真实回答没有给出明确推荐 ${brandName} 的理由，需要补强目标用户、优势边界和行动建议。`
    });
  }

  if (signal.competitorPressure >= 60) {
    seeds.push({
      monitor,
      title: "竞品压制风险偏高",
      category: "competition",
      severity: 3,
      description: `回答中存在较强竞品或替代方案压力，需要增加客观对比页和第三方证明材料。`
    });
  }

  if (!seeds.length && signal.visibility < 75) {
    seeds.push({
      monitor,
      title: "品牌回答质量仍可提升",
      category: "coverage",
      severity: 1,
      description: `回答已提及品牌，但可继续提升引用、推荐理由和问题覆盖深度。`
    });
  }

  return seeds;
}

function assetForStrategyGap(category: string | null | undefined, severity: number | null | undefined) {
  const value = (category ?? "").toLowerCase();
  if (value.includes("competition") || value.includes("competitor")) return "\u5bf9\u6bd4\u9875";
  if (value.includes("citation") || value.includes("source")) return "\u8bc1\u636e\u578b\u77e5\u8bc6\u9875";
  if (value.includes("recommend")) return "\u9009\u578b\u6307\u5357";
  return Number(severity ?? 1) >= 3 ? "\u6838\u5fc3 FAQ" : "\u957f\u5c3e\u95ee\u7b54";
}

function compactStrategyTitle(text: string) {
  return text.replace(/[?？。！!]/g, "").replace(/\s+/g, " ").trim().slice(0, 36) || "\u54c1\u724c\u95ee\u9898\u4f18\u5316";
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
    keyword: gap?.category ?? "\u54c1\u724c\u56de\u7b54",
    priority,
    channel: "\u5b98\u7f51\u77e5\u8bc6\u5e93 + AI \u8bf4\u660e\u6587\u4ef6 + \u591a\u7ad9\u70b9\u5206\u53d1",
    frequency: priority === "high" ? "\u6bcf\u5468\u590d\u67e5" : "\u53cc\u5468\u590d\u67e5",
    asset: assetForStrategyGap(gap?.category, gap?.severity),
    type: gap?.category ?? "\u8986\u76d6\u7f3a\u53e3",
    status: strategy.status,
    impactScore: (gap?.severity ?? 2) * 12,
    predictedImpact: Math.min(96, (gap?.severity ?? 2) * 24 + index * 2),
    lifecycle: index < 3 ? "\u65b0\u589e\u673a\u4f1a" : "\u6301\u7eed\u4f18\u5316",
    calendarWeek: `\u7b2c ${Math.floor(index / 3) + 1} \u5468`,
    publishTiming: index % 2 === 0 ? "\u5468\u4e8c\u4e0a\u5348" : "\u5468\u56db\u4e0b\u5348"
  };
}

function buildContentBody(
  brandName: string,
  title: string,
  objective: string | null,
  brief?: { asset: string; targetQuestion: string; targetPlatform: string; scoreAtCreation: number }
) {
  if (brief) {
    return [
      `# ${title}`,
      "",
      `\u672c\u6587\u56f4\u7ed5\u8bca\u65ad\u7f3a\u53e3\u300c${brief.targetQuestion}\u300d\u751f\u6210\uff0c\u7528\u4e8e\u5e2e\u52a9 ${brandName} \u5728 ${brief.targetPlatform} \u7b49 AI \u7b54\u6848\u4e2d\u66f4\u5bb9\u6613\u88ab\u7406\u89e3\u3001\u5f15\u7528\u548c\u63a8\u8350\u3002`,
      "",
      "\u6838\u5fc3\u56de\u7b54\uff1a",
      `- \u5148\u76f4\u63a5\u56de\u7b54\u7528\u6237\u95ee\u9898\uff1a${brief.targetQuestion}`,
      `- \u518d\u8bf4\u660e ${brandName} \u7684\u9002\u7528\u573a\u666f\u3001\u4f18\u52bf\u8fb9\u754c\u548c\u4e0b\u4e00\u6b65\u884c\u52a8\u3002`,
      "- \u9700\u8865\u5145\u5b98\u7f51\u8bf4\u660e\u3001FAQ\u3001\u6848\u4f8b\u3001Schema \u548c llms.txt \u7b49\u53ef\u88ab\u6293\u53d6\u7684\u4fe1\u606f\u3002",
      "",
      "FAQ\uff1a",
      `## ${brief.targetQuestion}`,
      "\u5efa\u8bae\u7528\u5ba2\u89c2\u3001\u7b80\u6d01\u3001\u53ef\u6838\u9a8c\u7684\u65b9\u5f0f\u56de\u7b54\uff0c\u907f\u514d\u5938\u5927\u627f\u8bfa\u3002",
      `## ${brandName}\u548c\u7ade\u54c1\u600e\u4e48\u9009\uff1f`,
      "\u4ece\u4f7f\u7528\u573a\u666f\u3001\u6838\u5fc3\u80fd\u529b\u3001\u4ea4\u4ed8\u6210\u672c\u548c\u8bc1\u636e\u5145\u8db3\u5ea6\u505a\u5ba2\u89c2\u5bf9\u6bd4\u3002",
      "",
      "\u53d1\u5e03\u524d\u5ba1\u6838\u6e05\u5355\uff1a",
      "- \u6838\u5bf9\u4e8b\u5b9e\u3001\u6570\u636e\u548c\u6765\u6e90\u662f\u5426\u51c6\u786e\u3002",
      "- \u6838\u5bf9\u7ade\u54c1\u5bf9\u6bd4\u662f\u5426\u5ba2\u89c2\u5408\u89c4\u3002",
      "- \u4eba\u5de5\u5ba1\u6838\u901a\u8fc7\u540e\u518d\u8fdb\u5165\u5206\u53d1\u3002"
    ].join("\n");
  }

  return [
    `# ${title}`,
    "",
    `\u8fd9\u7bc7\u8349\u7a3f\u7528\u4e8e\u5e2e\u52a9 ${brandName} \u56de\u7b54\u7528\u6237\u771f\u5b9e\u5173\u5fc3\u7684\u95ee\u9898\uff0c\u5e76\u6574\u7406\u6210\u4fbf\u4e8e AI \u7406\u89e3\u3001\u5f15\u7528\u548c\u63a8\u8350\u7684\u7ed3\u6784\u5316\u5185\u5bb9\u3002`,
    "",
    `\u4f18\u5316\u76ee\u6807\uff1a${objective ?? "\u63d0\u5347\u54c1\u724c\u5728 AI \u7b54\u6848\u4e2d\u7684\u53ef\u89c1\u5ea6\u548c\u56de\u7b54\u8986\u76d6\u7387\u3002"}`,
    "",
    "\u53d1\u5e03\u524d\u5ba1\u6838\u6e05\u5355\uff1a",
    "- \u6838\u5bf9\u4e8b\u5b9e\u3001\u6570\u636e\u548c\u6765\u6e90\u662f\u5426\u51c6\u786e\u3002",
    "- \u6838\u5bf9\u54c1\u724c\u8868\u8ff0\u3001\u7ade\u54c1\u5bf9\u6bd4\u548c\u63a8\u8350\u7406\u7531\u662f\u5426\u5408\u89c4\u3002",
    "- \u786e\u8ba4\u901a\u8fc7\u4eba\u5de5\u5ba1\u6838\u540e\uff0c\u518d\u8fdb\u5165\u5206\u53d1\u6d41\u7a0b\u3002"
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
    channels: ["\u5b98\u7f51\u77e5\u8bc6\u5e93"],
    body: content.body ?? "",
    seo: {
      metaTitle: content.title,
      metaDescription: "\u8bca\u65ad\u9a71\u52a8\u751f\u6210\u7684\u5185\u5bb9\u8349\u7a3f\uff0c\u7b49\u5f85\u4eba\u5de5\u5ba1\u6838\u540e\u53d1\u5e03\u3002"
    },
    author: "\u7cfb\u7edf\u751f\u6210",
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
