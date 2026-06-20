import { Router } from "express";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { generateContents } from "../services/geoWorkflow.js";
import { decideContentModeration } from "../services/admin.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";
import { asyncHandler, parseBody, parseQuery } from "./routeHelpers.js";

export const contentsRouter = Router();

const querySchema = z.object({
  status: z.string().trim().max(40).optional()
});

const generateSchema = z.object({
  projectId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(30).optional()
});

const reviewSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject", "publish", "draft"]).default("approve"),
  note: z.string().trim().max(1000).optional()
});

const deleteSchema = z.object({
  id: z.string().uuid()
});

contentsRouter.use(requireAuth);

contentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    parseQuery(querySchema, req);
    const contents = await prisma.content.findMany({
      where: {
        project: {
          organizationId: req.auth!.organizationId
        }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    const rows = contents.map((content) => ({
      id: content.id,
      title: content.title,
      contentType: content.contentType,
      status: content.status === "PENDING_REVIEW" ? "review" : content.status.toLowerCase(),
      reviewNote: content.reviewNotes,
      qualityScore: 82,
      channels: ["官网知识库"],
      body: content.body ?? "",
      seo: { metaTitle: content.title },
      author: "系统生成",
      createdAt: content.createdAt.toISOString()
    }));

    res.json({
      contents: rows,
      statistics: {
        total: rows.length,
        draft: rows.filter((content) => content.status === "draft").length,
        review: rows.filter((content) => content.status === "review").length,
        published: rows.filter((content) => content.status === "published").length,
        avgQuality: rows.length ? 82 : 0
      }
    });
  })
);

contentsRouter.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const body = parseBody(generateSchema, req);
    res.status(201).json(await generateContents({ auth: req.auth! }, body));
  })
);

contentsRouter.post(
  "/review",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parseBody(reviewSchema, req);
    const decision = body.action === "reject" || body.action === "draft" ? "reject" : "approve";
    res.json(await decideContentModeration(req.auth!, { id: body.id, decision, note: body.note }));
  })
);

contentsRouter.post(
  "/delete",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parseBody(deleteSchema, req);
    const existing = await prisma.content.findUnique({ where: { id: body.id } });

    if (!existing) {
      throw new HttpError(404, "CONTENT_NOT_FOUND", "Content was not found.");
    }

    await prisma.content.update({
      where: { id: body.id },
      data: {
        status: "ARCHIVED",
        reviewNotes: "Archived by admin."
      }
    });

    res.json({ deleted: true });
  })
);
