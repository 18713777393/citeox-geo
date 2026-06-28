import { Router, type Request } from "express";
import {
  CollectionItemStatus,
  CollectionJobStatus,
  CollectionJobTriggerType,
  CollectionSourceStatus,
  CollectionSourceType
} from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import {
  acceptItem,
  bulkConvertToQuestions,
  cancelJob,
  createSource,
  deleteSource,
  enqueueCollectionJob,
  getJob,
  getSourceHubHealth,
  listItems,
  listJobs,
  listSources,
  manualImport,
  pauseSource,
  rejectItem,
  resumeSource,
  retryJob,
  updateSource
} from "../services/sourceHub/sourceHub.js";
import { asyncHandler, parseBody, parseQuery } from "./routeHelpers.js";

export const sourceHubRouter = Router();

sourceHubRouter.use(requireAuth);

const uuidParamSchema = z.object({
  id: z.string().uuid()
});

const listSourcesQuerySchema = z.object({
  projectId: optionalUuid(),
  type: optionalEnum(CollectionSourceType),
  status: optionalEnum(CollectionSourceStatus)
});

const sourceBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(80).optional(),
  type: enumValue(CollectionSourceType),
  projectId: z.string().uuid().optional(),
  config: z.record(z.unknown()).optional(),
  secretRef: z.string().trim().max(80).optional(),
  rateLimitPerHour: z.number().int().min(1).max(10_000).optional(),
  scheduleCron: z.string().trim().max(120).optional()
});

const sourcePatchBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  projectId: z.string().uuid().nullable().optional(),
  config: z.record(z.unknown()).optional(),
  secretRef: z.string().trim().max(80).nullable().optional(),
  rateLimitPerHour: z.number().int().min(1).max(10_000).nullable().optional(),
  scheduleCron: z.string().trim().max(120).nullable().optional(),
  status: enumValue(CollectionSourceStatus).optional()
});

const listJobsQuerySchema = z.object({
  projectId: optionalUuid(),
  sourceId: optionalUuid(),
  status: optionalEnum(CollectionJobStatus),
  limit: optionalInt(1, 100)
});

const createJobBodySchema = z.object({
  sourceId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  triggerType: enumValue(CollectionJobTriggerType).optional(),
  query: z.string().trim().max(500).optional(),
  input: z.record(z.unknown()).optional(),
  runNow: z.boolean().optional()
});

const listItemsQuerySchema = z.object({
  projectId: optionalUuid(),
  sourceId: optionalUuid(),
  jobId: optionalUuid(),
  status: optionalEnum(CollectionItemStatus),
  limit: optionalInt(1, 200)
});

const manualImportBodySchema = z.object({
  projectId: z.string().uuid(),
  sourceId: z.string().uuid().optional(),
  items: z.array(z.object({
    title: z.string().trim().min(1).max(240),
    text: z.string().trim().max(5_000).optional(),
    sourceUrl: z.string().trim().max(2_000).optional(),
    url: z.string().trim().max(2_000).optional(),
    author: z.string().trim().max(120).optional(),
    language: z.string().trim().max(20).optional(),
    intent: z.string().trim().max(80).optional(),
    keywords: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    publishedAt: z.string().trim().max(80).optional(),
    metadata: z.record(z.unknown()).optional()
  })).min(1).max(100)
});

const rejectBodySchema = z.object({
  reason: z.string().trim().max(300).optional()
});

const bulkConvertBodySchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(100),
  projectId: z.string().uuid().optional()
});

sourceHubRouter.get(
  "/sources",
  asyncHandler(async (req, res) => {
    const query = parseQuery(listSourcesQuerySchema, req);
    res.json(await listSources(contextFromRequest(req), query));
  })
);

sourceHubRouter.post(
  "/sources",
  asyncHandler(async (req, res) => {
    const body = parseBody(sourceBodySchema, req);
    res.status(201).json(await createSource(contextFromRequest(req), body));
  })
);

sourceHubRouter.patch(
  "/sources/:id",
  asyncHandler(async (req, res) => {
    const { id } = parseParams(uuidParamSchema, req);
    const body = parseBody(sourcePatchBodySchema, req);
    res.json(await updateSource(contextFromRequest(req), id, body));
  })
);

sourceHubRouter.post(
  "/sources/:id/pause",
  asyncHandler(async (req, res) => {
    const { id } = parseParams(uuidParamSchema, req);
    res.json(await pauseSource(contextFromRequest(req), id));
  })
);

sourceHubRouter.post(
  "/sources/:id/resume",
  asyncHandler(async (req, res) => {
    const { id } = parseParams(uuidParamSchema, req);
    res.json(await resumeSource(contextFromRequest(req), id));
  })
);

sourceHubRouter.delete(
  "/sources/:id",
  asyncHandler(async (req, res) => {
    const { id } = parseParams(uuidParamSchema, req);
    res.json(await deleteSource(contextFromRequest(req), id));
  })
);

sourceHubRouter.get(
  "/jobs",
  asyncHandler(async (req, res) => {
    const query = parseQuery(listJobsQuerySchema, req);
    res.json(await listJobs(contextFromRequest(req), query));
  })
);

sourceHubRouter.post(
  "/jobs",
  asyncHandler(async (req, res) => {
    const body = parseBody(createJobBodySchema, req);
    res.status(201).json(await enqueueCollectionJob(contextFromRequest(req), body));
  })
);

sourceHubRouter.get(
  "/jobs/:id",
  asyncHandler(async (req, res) => {
    const { id } = parseParams(uuidParamSchema, req);
    res.json(await getJob(contextFromRequest(req), id));
  })
);

sourceHubRouter.post(
  "/jobs/:id/retry",
  asyncHandler(async (req, res) => {
    const { id } = parseParams(uuidParamSchema, req);
    res.status(201).json(await retryJob(contextFromRequest(req), id));
  })
);

sourceHubRouter.post(
  "/jobs/:id/cancel",
  asyncHandler(async (req, res) => {
    const { id } = parseParams(uuidParamSchema, req);
    res.json(await cancelJob(contextFromRequest(req), id));
  })
);

sourceHubRouter.get(
  "/items",
  asyncHandler(async (req, res) => {
    const query = parseQuery(listItemsQuerySchema, req);
    res.json(await listItems(contextFromRequest(req), query));
  })
);

sourceHubRouter.post(
  "/items/:id/accept",
  asyncHandler(async (req, res) => {
    const { id } = parseParams(uuidParamSchema, req);
    res.json(await acceptItem(contextFromRequest(req), id));
  })
);

sourceHubRouter.post(
  "/items/:id/reject",
  asyncHandler(async (req, res) => {
    const { id } = parseParams(uuidParamSchema, req);
    const body = parseBody(rejectBodySchema, req);
    res.json(await rejectItem(contextFromRequest(req), id, body.reason));
  })
);

sourceHubRouter.post(
  "/items/bulk-convert-to-questions",
  asyncHandler(async (req, res) => {
    const body = parseBody(bulkConvertBodySchema, req);
    res.status(201).json(await bulkConvertToQuestions(contextFromRequest(req), body));
  })
);

sourceHubRouter.post(
  "/manual-import",
  asyncHandler(async (req, res) => {
    const body = parseBody(manualImportBodySchema, req);
    res.status(201).json(await manualImport(contextFromRequest(req), body));
  })
);

sourceHubRouter.get(
  "/health",
  asyncHandler(async (req, res) => {
    res.json(await getSourceHubHealth(contextFromRequest(req)));
  })
);

function contextFromRequest(req: Request) {
  return {
    auth: req.auth!,
    ipAddress: req.ip,
    userAgent: req.header("user-agent")
  };
}

function parseParams<T extends z.ZodTypeAny>(schema: T, req: Request): z.output<T> {
  const parsed = schema.safeParse(req.params ?? {});

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid route parameters.";
    throw new HttpError(400, "VALIDATION_ERROR", message);
  }

  return parsed.data;
}

function enumValue<T extends Record<string, string>>(values: T) {
  const allowed = new Set(Object.values(values));

  return z.string().transform((value, ctx) => {
    const normalized = value.trim().toUpperCase();
    const aliased = normalized === "WEBSITE_PUBLIC" ? "WEBSITE" : normalized;

    if (!allowed.has(aliased)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid enum value."
      });
      return z.NEVER;
    }

    return aliased as T[keyof T];
  });
}

function optionalEnum<T extends Record<string, string>>(values: T) {
  return z.preprocess(firstQueryValue, enumValue(values).optional());
}

function optionalUuid() {
  return z.preprocess(firstQueryValue, z.string().uuid().optional());
}

function optionalInt(min: number, max: number) {
  return z.preprocess((value) => {
    const first = firstQueryValue(value);
    return first === undefined ? undefined : Number(first);
  }, z.number().int().min(min).max(max).optional());
}

function firstQueryValue(value: unknown) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value === "" ? undefined : value;
}
