import { ProjectStatus, type Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { asyncHandler, parseBody } from "./routeHelpers.js";

export const projectsRouter = Router();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional()
});

const saveProjectSchema = z.object({
  id: z.string().uuid().optional(),
  brand: z.string().trim().min(1).max(160).optional(),
  brandName: z.string().trim().min(1).max(160).optional(),
  name: z.string().trim().min(1).max(160).optional(),
  site: z.string().trim().max(300).optional(),
  product: z.string().trim().max(1000).optional(),
  productIntro: z.string().trim().max(1000).optional(),
  scenarios: z.union([z.string().trim().max(1000), z.array(z.string().trim().min(1).max(120)).max(20)]).optional(),
  industry: z.string().trim().max(160).optional(),
  targetAudience: z.string().trim().max(500).optional(),
  audience: z.string().trim().max(500).optional(),
  competitors: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  keywords: z.array(z.string().trim().min(1).max(120)).max(30).optional()
});

projectsRouter.use(requireAuth);

projectsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.safeParse(req.query);
    const limit = query.success ? query.data.limit ?? 50 : 50;
    const projects = await prisma.project.findMany({
      where: {
        organizationId: req.auth!.organizationId,
        status: ProjectStatus.ACTIVE
      },
      orderBy: { updatedAt: "desc" },
      take: limit
    });
    const formatted = projects.map(formatProjectForClient);

    res.json({
      projects: formatted,
      data: formatted,
      latest: formatted[0] ?? null
    });
  })
);

projectsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const project = await saveProject(req);
    res.status(201).json({ project, data: project });
  })
);

projectsRouter.post(
  "/save",
  asyncHandler(async (req, res) => {
    const project = await saveProject(req);
    res.status(200).json({ project, data: project });
  })
);

projectsRouter.get(
  "/:projectId",
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.projectId,
        organizationId: req.auth!.organizationId,
        status: ProjectStatus.ACTIVE
      }
    });

    if (!project) {
      throw new HttpError(404, "PROJECT_NOT_FOUND", "Project was not found.");
    }

    res.json({ project: formatProjectForClient(project), data: formatProjectForClient(project) });
  })
);

projectsRouter.get(
  "/:projectId/geo",
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.projectId,
        organizationId: req.auth!.organizationId,
        status: ProjectStatus.ACTIVE
      }
    });

    if (!project) {
      throw new HttpError(404, "PROJECT_NOT_FOUND", "Project was not found.");
    }

    const [latestScore, gaps, questions, monitorResults, contents] = await Promise.all([
      prisma.geoScore.findFirst({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } }),
      prisma.gap.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.question.count({ where: { projectId: project.id } }),
      prisma.monitorResult.count({ where: { projectId: project.id } }),
      prisma.content.count({ where: { projectId: project.id } })
    ]);

    res.json({
      project: formatProjectForClient(project),
      latestScore: latestScore
        ? {
            id: latestScore.id,
            score: Number(latestScore.score),
            visibility: Number(latestScore.visibility ?? 0),
            credibility: Number(latestScore.credibility ?? 0),
            relevance: Number(latestScore.relevance ?? 0),
            freshness: Number(latestScore.freshness ?? 0),
            grade: latestScore.grade,
            createdAt: latestScore.createdAt.toISOString()
          }
        : null,
      gaps: gaps.map((gap) => ({
        id: gap.id,
        title: gap.title,
        category: gap.category,
        severity: gap.severity,
        status: gap.status,
        createdAt: gap.createdAt.toISOString()
      })),
      counts: {
        questions,
        monitorResults,
        gaps: gaps.length,
        contents
      }
    });
  })
);

async function saveProject(req: Parameters<Parameters<typeof asyncHandler>[0]>[0]) {
  const body = parseBody(saveProjectSchema, req);
  const brandName = trimText(body.brandName ?? body.brand ?? body.name, 160);
  const existing = body.id
    ? await prisma.project.findFirst({
        where: {
          id: body.id,
          organizationId: req.auth!.organizationId,
          status: ProjectStatus.ACTIVE
        }
      })
    : await prisma.project.findFirst({
        where: {
          organizationId: req.auth!.organizationId,
          status: ProjectStatus.ACTIVE
        },
        orderBy: { updatedAt: "desc" }
      });

  if (body.id && !existing) {
    throw new HttpError(404, "PROJECT_NOT_FOUND", "Project was not found.");
  }

  if (!existing && !brandName) {
    throw new HttpError(400, "VALIDATION_ERROR", "brandName is required.");
  }

  const previousSettings = settingsRecord(existing?.settings);
  const nextSettings = {
    ...previousSettings,
    site: trimText(body.site, 300) ?? previousSettings.site ?? "",
    productIntro: trimText(body.productIntro ?? body.product, 1000) ?? previousSettings.productIntro ?? "",
    scenarios: normalizeList(body.scenarios) ?? previousSettings.scenarios ?? [],
    targetAudience: trimText(body.targetAudience ?? body.audience, 500) ?? previousSettings.targetAudience ?? "",
    competitors: normalizeList(body.competitors) ?? previousSettings.competitors ?? [],
    keywords: normalizeList(body.keywords) ?? previousSettings.keywords ?? [],
    source: "frontend_project_save",
    updatedBy: req.auth!.userId
  };
  const data = {
    name: brandName ?? existing!.name,
    brandName: brandName ?? existing!.brandName,
    industry: trimText(body.industry, 160) ?? existing?.industry ?? null,
    settings: nextSettings as Prisma.InputJsonValue
  };
  const project = existing
    ? await prisma.project.update({ where: { id: existing.id }, data })
    : await prisma.project.create({
        data: {
          organizationId: req.auth!.organizationId,
          ownerId: req.auth!.userId,
          status: ProjectStatus.ACTIVE,
          ...data
        }
      });

  return formatProjectForClient(project);
}

function formatProjectForClient(project: {
  id: string;
  name: string;
  brandName: string;
  industry: string | null;
  status: ProjectStatus;
  settings: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const settings = settingsRecord(project.settings);
  const competitors = stringArray(settings.competitors);
  const keywords = stringArray(settings.keywords);

  return {
    id: project.id,
    name: project.name,
    brandName: project.brandName,
    site: stringValue(settings.site),
    productIntro: stringValue(settings.productIntro),
    scenarios: stringArray(settings.scenarios),
    industry: project.industry ?? "",
    targetAudience: stringValue(settings.targetAudience),
    competitors,
    keywords,
    health: projectHealth(competitors, keywords, settings),
    status: project.status.toLowerCase(),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString()
  };
}

function projectHealth(competitors: string[], keywords: string[], settings: Record<string, unknown>) {
  let score = 25;
  if (stringValue(settings.site)) score += 15;
  if (stringValue(settings.productIntro)) score += 20;
  if (stringArray(settings.scenarios).length) score += 15;
  if (competitors.length) score += 10;
  if (keywords.length) score += 15;
  return Math.min(score, 100);
}

function settingsRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function trimText(value: string | undefined, maxLength: number) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function normalizeList(value: string | string[] | undefined) {
  if (value === undefined) return undefined;
  const items = Array.isArray(value) ? value : value.split(/[,;，；、\n]/);
  return items.map((item) => item.trim()).filter(Boolean).slice(0, 30);
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
