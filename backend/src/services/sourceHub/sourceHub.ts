import { createHash, randomUUID } from "node:crypto";
import {
  CollectionItemStatus,
  CollectionJobStatus,
  CollectionJobTriggerType,
  CollectionSourceStatus,
  CollectionSourceType,
  ProjectStatus,
  type CollectionItem,
  type CollectionSource,
  type Prisma
} from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../middleware/error.js";
import type { AuthContext } from "../../middleware/auth.js";
import { recordAuditEvent } from "../audit.js";
import { getEntitlementSnapshotForUser } from "../entitlements.js";
import {
  redactSourceConfigForResponse,
  sanitizeSecretRefForSourceType,
  sanitizeSourceConfigForStorage
} from "./configPolicy.js";
import { runPendingCollectionJobs } from "./jobRunner.js";
import { sanitizeConfig, sanitizeMetadata } from "./normalizer.js";
import { listSourceAdapters } from "./sourceRegistry.js";
import type { ManualImportItemInput, SourceHubContext } from "./types.js";

interface ListSourcesInput {
  projectId?: string;
  type?: CollectionSourceType;
  status?: CollectionSourceStatus;
}

interface CreateSourceInput {
  name: string;
  code?: string;
  type: CollectionSourceType;
  projectId?: string;
  config?: Record<string, unknown>;
  secretRef?: string;
  rateLimitPerHour?: number;
  scheduleCron?: string;
}

interface UpdateSourceInput {
  name?: string;
  projectId?: string | null;
  config?: Record<string, unknown>;
  secretRef?: string | null;
  rateLimitPerHour?: number | null;
  scheduleCron?: string | null;
  status?: CollectionSourceStatus;
}

interface EnqueueJobInput {
  sourceId: string;
  projectId?: string;
  triggerType?: CollectionJobTriggerType;
  query?: string;
  input?: Record<string, unknown>;
  runNow?: boolean;
  retryCount?: number;
  maxRetries?: number;
}

interface ListJobsInput {
  projectId?: string;
  sourceId?: string;
  status?: CollectionJobStatus;
  limit?: number;
}

interface ListItemsInput {
  projectId?: string;
  sourceId?: string;
  jobId?: string;
  status?: CollectionItemStatus;
  limit?: number;
}

export async function listSources(ctx: SourceHubContext, input: ListSourcesInput) {
  assertEnabled();

  if (input.projectId) {
    await assertProjectAccess(ctx.auth, input.projectId);
  }

  const sources = await prisma.collectionSource.findMany({
    where: {
      organizationId: ctx.auth.organizationId,
      projectId: input.projectId,
      type: input.type,
      status: input.status
    },
    orderBy: { updatedAt: "desc" }
  });

  return {
    sources: sources.map(formatSource),
    adapters: listSourceAdapters()
  };
}

export async function createSource(ctx: SourceHubContext, input: CreateSourceInput) {
  assertEnabled();
  const project = input.projectId ? await assertProjectAccess(ctx.auth, input.projectId) : null;
  await assertSourceConnectorQuota(ctx.auth, 1);

  const source = await createSourceRow(ctx, {
    ...input,
    projectId: project?.id
  });

  await audit(ctx, "source_hub.source.created", "collection_source", source.id, {
    sourceType: source.type,
    projectId: source.projectId
  });

  return { source: formatSource(source) };
}

export async function updateSource(ctx: SourceHubContext, sourceId: string, input: UpdateSourceInput) {
  assertEnabled();
  const source = await getSourceForOrg(ctx.auth, sourceId);
  const data: Prisma.CollectionSourceUncheckedUpdateInput = {};

  if (input.name !== undefined) {
    data.name = input.name;
  }

  if (input.projectId !== undefined) {
    data.projectId = input.projectId ? (await assertProjectAccess(ctx.auth, input.projectId)).id : null;
  }

  if (input.config !== undefined) {
    data.config = sanitizeSourceConfigForStorage(source.type, input.config);
  }

  if (input.secretRef !== undefined) {
    data.secretRef = input.secretRef === null ? null : sanitizeSecretRefForSourceType(source.type, input.secretRef);
  }

  if (input.rateLimitPerHour !== undefined) {
    data.rateLimitPerHour = input.rateLimitPerHour;
  }

  if (input.scheduleCron !== undefined) {
    data.scheduleCron = input.scheduleCron;
  }

  if (input.status !== undefined) {
    data.status = input.status;
  }

  const updated = await prisma.collectionSource.update({
    where: { id: source.id },
    data
  });

  await audit(ctx, "source_hub.source.updated", "collection_source", source.id, {
    changedFields: Object.keys(data)
  });

  return { source: formatSource(updated) };
}

export async function pauseSource(ctx: SourceHubContext, sourceId: string) {
  return setSourceStatus(ctx, sourceId, CollectionSourceStatus.PAUSED, "source_hub.source.paused");
}

export async function resumeSource(ctx: SourceHubContext, sourceId: string) {
  return setSourceStatus(ctx, sourceId, CollectionSourceStatus.ACTIVE, "source_hub.source.resumed");
}

export async function deleteSource(ctx: SourceHubContext, sourceId: string) {
  assertEnabled();
  const source = await getSourceForOrg(ctx.auth, sourceId);

  await prisma.collectionSource.delete({ where: { id: source.id } });
  await audit(ctx, "source_hub.source.deleted", "collection_source", source.id, {
    sourceType: source.type,
    projectId: source.projectId
  });

  return { deleted: true };
}

export async function listJobs(ctx: SourceHubContext, input: ListJobsInput) {
  assertEnabled();

  if (input.projectId) {
    await assertProjectAccess(ctx.auth, input.projectId);
  }

  if (input.sourceId) {
    await getSourceForOrg(ctx.auth, input.sourceId);
  }

  const jobs = await prisma.collectionJob.findMany({
    where: {
      organizationId: ctx.auth.organizationId,
      projectId: input.projectId,
      sourceId: input.sourceId,
      status: input.status
    },
    include: { source: true },
    orderBy: { createdAt: "desc" },
    take: clamp(input.limit ?? 50, 1, 100)
  });

  return { jobs: jobs.map(formatJob) };
}

export async function enqueueCollectionJob(ctx: SourceHubContext, input: EnqueueJobInput) {
  assertEnabled();
  const source = await getSourceForOrg(ctx.auth, input.sourceId);

  if (source.status === CollectionSourceStatus.PAUSED) {
    throw new HttpError(409, "SOURCE_PAUSED", "Collection source is paused.");
  }

  if (source.projectId && input.projectId && source.projectId !== input.projectId) {
    throw new HttpError(400, "PROJECT_SOURCE_MISMATCH", "Source is already bound to another project.");
  }

  const projectId = input.projectId ?? source.projectId ?? undefined;

  if (projectId) {
    await assertProjectAccess(ctx.auth, projectId);
  }

  const safeInput = sanitizeConfig({
    ...(input.input ?? {}),
    actorUserId: ctx.auth.userId
  });
  const job = await prisma.collectionJob.create({
    data: {
      organizationId: ctx.auth.organizationId,
      projectId,
      sourceId: source.id,
      status: CollectionJobStatus.PENDING,
      triggerType: input.triggerType ?? CollectionJobTriggerType.MANUAL,
      query: input.query,
      input: safeInput,
      retryCount: input.retryCount ?? 0,
      maxRetries: input.maxRetries ?? 2
    }
  });

  await audit(ctx, "source_hub.job.created", "collection_job", job.id, {
    sourceId: source.id,
    projectId,
    triggerType: job.triggerType
  });

  if (input.runNow ?? true) {
    await runPendingCollectionJobs({ jobId: job.id, limit: 1 });
  }

  return getJob(ctx, job.id);
}

export async function getJob(ctx: SourceHubContext, jobId: string) {
  assertEnabled();
  const job = await prisma.collectionJob.findFirst({
    where: {
      id: jobId,
      organizationId: ctx.auth.organizationId
    },
    include: {
      source: true,
      items: {
        orderBy: { createdAt: "desc" },
        take: 100
      }
    }
  });

  if (!job) {
    throw new HttpError(404, "JOB_NOT_FOUND", "Collection job was not found.");
  }

  return {
    job: formatJob(job),
    items: job.items.map(formatItem)
  };
}

export async function retryJob(ctx: SourceHubContext, jobId: string) {
  assertEnabled();
  const job = await prisma.collectionJob.findFirst({
    where: {
      id: jobId,
      organizationId: ctx.auth.organizationId
    }
  });

  if (!job) {
    throw new HttpError(404, "JOB_NOT_FOUND", "Collection job was not found.");
  }

  if (job.retryCount >= job.maxRetries) {
    throw new HttpError(409, "JOB_RETRY_EXHAUSTED", "Collection job retry limit has been reached.");
  }

  return enqueueCollectionJob(ctx, {
    sourceId: job.sourceId,
    projectId: job.projectId ?? undefined,
    triggerType: CollectionJobTriggerType.RETRY,
    query: job.query ?? undefined,
    input: jsonObject(job.input),
    retryCount: job.retryCount + 1,
    maxRetries: job.maxRetries,
    runNow: true
  });
}

export async function cancelJob(ctx: SourceHubContext, jobId: string) {
  assertEnabled();
  const job = await prisma.collectionJob.findFirst({
    where: {
      id: jobId,
      organizationId: ctx.auth.organizationId
    }
  });

  if (!job) {
    throw new HttpError(404, "JOB_NOT_FOUND", "Collection job was not found.");
  }

  if (job.status !== CollectionJobStatus.PENDING && job.status !== CollectionJobStatus.RUNNING) {
    throw new HttpError(409, "JOB_NOT_CANCELLABLE", "Only pending or running jobs can be cancelled.");
  }

  const updated = await prisma.collectionJob.update({
    where: { id: job.id },
    data: {
      status: CollectionJobStatus.CANCELLED,
      cancelledAt: new Date(),
      finishedAt: new Date(),
      lockedAt: null,
      lockToken: null
    },
    include: { source: true }
  });

  await audit(ctx, "source_hub.job.cancelled", "collection_job", job.id, {
    sourceId: job.sourceId,
    projectId: job.projectId
  });

  return { job: formatJob(updated) };
}

export async function manualImport(ctx: SourceHubContext, input: {
  projectId: string;
  sourceId?: string;
  items: ManualImportItemInput[];
}) {
  assertEnabled();
  const project = await assertProjectAccess(ctx.auth, input.projectId);
  const source = input.sourceId
    ? await getSourceForOrg(ctx.auth, input.sourceId)
    : await findOrCreateManualImportSource(ctx, project.id);

  if (source.type !== CollectionSourceType.MANUAL_IMPORT) {
    throw new HttpError(400, "SOURCE_TYPE_MISMATCH", "Manual import requires a MANUAL_IMPORT source.");
  }

  const result = await enqueueCollectionJob(ctx, {
    sourceId: source.id,
    projectId: project.id,
    triggerType: CollectionJobTriggerType.MANUAL,
    input: { items: input.items },
    runNow: true
  });

  await audit(ctx, "source_hub.manual_import.completed", "collection_source", source.id, {
    projectId: project.id,
    itemCount: input.items.length,
    jobId: result.job.id
  });

  return result;
}

export async function listItems(ctx: SourceHubContext, input: ListItemsInput) {
  assertEnabled();

  if (input.projectId) {
    await assertProjectAccess(ctx.auth, input.projectId);
  }

  if (input.sourceId) {
    await getSourceForOrg(ctx.auth, input.sourceId);
  }

  const items = await prisma.collectionItem.findMany({
    where: {
      organizationId: ctx.auth.organizationId,
      projectId: input.projectId,
      sourceId: input.sourceId,
      jobId: input.jobId,
      status: input.status
    },
    include: { source: true },
    orderBy: { createdAt: "desc" },
    take: clamp(input.limit ?? 100, 1, 200)
  });

  return { items: items.map(formatItem) };
}

export async function acceptItem(ctx: SourceHubContext, itemId: string) {
  return moderateItem(ctx, itemId, CollectionItemStatus.ACCEPTED, "source_hub.item.accepted");
}

export async function rejectItem(ctx: SourceHubContext, itemId: string, reason?: string) {
  return moderateItem(ctx, itemId, CollectionItemStatus.REJECTED, "source_hub.item.rejected", reason);
}

export async function bulkConvertToQuestions(ctx: SourceHubContext, input: {
  itemIds: string[];
  projectId?: string;
}) {
  assertEnabled();
  const items = await prisma.collectionItem.findMany({
    where: {
      id: { in: input.itemIds },
      organizationId: ctx.auth.organizationId
    },
    include: { source: true }
  });

  if (items.length !== input.itemIds.length) {
    throw new HttpError(404, "ITEM_NOT_FOUND", "One or more collection items were not found.");
  }

  const notAccepted = items.find((item) => item.status !== CollectionItemStatus.ACCEPTED);

  if (notAccepted) {
    throw new HttpError(409, "ITEM_NOT_ACCEPTED", "Only accepted collection items can be converted to questions.");
  }

  const projectIds = new Set(items.map((item) => item.projectId ?? input.projectId).filter(isString));

  if (!projectIds.size) {
    throw new HttpError(400, "PROJECT_REQUIRED", "Project is required to convert collection items to questions.");
  }

  const projects = new Map<string, Awaited<ReturnType<typeof assertProjectAccess>>>();

  for (const projectId of projectIds) {
    projects.set(projectId, await assertProjectAccess(ctx.auth, projectId));
  }

  await assertQuestionQuota(ctx.auth, items.length);

  const converted = [];
  let createdCount = 0;
  let linkedExistingCount = 0;

  for (const item of items) {
    const projectId = item.projectId ?? input.projectId;

    if (!projectId || !projects.has(projectId)) {
      throw new HttpError(400, "PROJECT_REQUIRED", "Project is required to convert collection item.");
    }

    const existing = await prisma.question.findFirst({
      where: {
        projectId,
        title: item.rawTitle
      }
    });
    const question = await prisma.$transaction(async (tx) => {
      const row = existing ?? await tx.question.create({
        data: {
          projectId,
          createdById: ctx.auth.userId,
          title: item.rawTitle,
          prompt: item.rawTitle,
          category: item.intent ?? "faq",
          language: item.language,
          status: "active"
        }
      });

      await tx.questionSource.create({
        data: {
          organizationId: ctx.auth.organizationId,
          projectId,
          questionId: row.id,
          collectionItemId: item.id,
          sourceId: item.sourceId,
          sourceName: item.source.name,
          sourceUrl: item.url,
          confidence: confidenceFromItem(item)
        }
      });

      await tx.collectionItem.update({
        where: { id: item.id },
        data: {
          status: CollectionItemStatus.CONVERTED_TO_QUESTION,
          createdQuestionId: row.id
        }
      });

      return row;
    });

    if (existing) {
      linkedExistingCount += 1;
    } else {
      createdCount += 1;
    }

    converted.push({
      itemId: item.id,
      question: {
        id: question.id,
        title: question.title,
        projectId: question.projectId
      }
    });
  }

  await audit(ctx, "source_hub.items.converted_to_questions", "collection_item", undefined, {
    itemIds: input.itemIds,
    createdCount,
    linkedExistingCount
  });

  return {
    converted,
    summary: {
      requested: input.itemIds.length,
      created: createdCount,
      linkedExisting: linkedExistingCount
    }
  };
}

export async function getSourceHubHealth(ctx: SourceHubContext) {
  assertEnabled();
  const sources = await prisma.collectionSource.findMany({
    where: { organizationId: ctx.auth.organizationId },
    include: {
      healthChecks: {
        orderBy: { checkedAt: "desc" },
        take: 1
      }
    },
    orderBy: { updatedAt: "desc" }
  });

  return {
    sources: sources.map((source) => {
      const latest = source.healthChecks[0];

      return {
        id: source.id,
        name: source.name,
        code: source.code,
        type: source.type,
        status: source.status.toLowerCase(),
        healthStatus: source.healthStatus.toLowerCase(),
        lastRunAt: source.lastRunAt?.toISOString() ?? null,
        lastError: source.lastError,
        latestCheck: latest
          ? {
              status: latest.status.toLowerCase(),
              latencyMs: latest.latencyMs,
              successCount: latest.successCount,
              failureCount: latest.failureCount,
              lastError: latest.lastError,
              checkedAt: latest.checkedAt.toISOString()
            }
          : null
      };
    }),
    adapters: listSourceAdapters()
  };
}

async function setSourceStatus(
  ctx: SourceHubContext,
  sourceId: string,
  status: CollectionSourceStatus,
  action: string
) {
  assertEnabled();
  const source = await getSourceForOrg(ctx.auth, sourceId);
  const updated = await prisma.collectionSource.update({
    where: { id: source.id },
    data: {
      status,
      lastError: status === CollectionSourceStatus.ACTIVE ? null : source.lastError
    }
  });

  await audit(ctx, action, "collection_source", source.id, {
    projectId: source.projectId,
    sourceType: source.type
  });

  return { source: formatSource(updated) };
}

async function createSourceRow(ctx: SourceHubContext, input: CreateSourceInput) {
  const code = await uniqueSourceCode(ctx.auth.organizationId, input.type, input.name, input.code);

  return prisma.collectionSource.create({
    data: {
      organizationId: ctx.auth.organizationId,
      projectId: input.projectId,
      name: input.name,
      code,
      type: input.type,
      status: CollectionSourceStatus.ACTIVE,
      config: sanitizeSourceConfigForStorage(input.type, input.config),
      secretRef: sanitizeSecretRefForSourceType(input.type, input.secretRef),
      rateLimitPerHour: input.rateLimitPerHour,
      scheduleCron: input.scheduleCron
    }
  });
}

async function findOrCreateManualImportSource(ctx: SourceHubContext, projectId: string) {
  const existing = await prisma.collectionSource.findFirst({
    where: {
      organizationId: ctx.auth.organizationId,
      projectId,
      type: CollectionSourceType.MANUAL_IMPORT
    },
    orderBy: { createdAt: "asc" }
  });

  if (existing) {
    return existing;
  }

  await assertSourceConnectorQuota(ctx.auth, 1);
  const source = await createSourceRow(ctx, {
    name: "Manual import",
    code: `manual_import_${projectId.slice(0, 8)}`,
    type: CollectionSourceType.MANUAL_IMPORT,
    projectId,
    config: {
      mode: "user_supplied"
    }
  });

  await audit(ctx, "source_hub.source.created", "collection_source", source.id, {
    sourceType: source.type,
    projectId: source.projectId,
    autoCreated: true
  });

  return source;
}

async function getSourceForOrg(auth: AuthContext, sourceId: string) {
  const source = await prisma.collectionSource.findFirst({
    where: {
      id: sourceId,
      organizationId: auth.organizationId
    }
  });

  if (!source) {
    throw new HttpError(404, "SOURCE_NOT_FOUND", "Collection source was not found.");
  }

  return source;
}

async function moderateItem(
  ctx: SourceHubContext,
  itemId: string,
  status: CollectionItemStatus,
  action: string,
  reason?: string
) {
  assertEnabled();
  const item = await prisma.collectionItem.findFirst({
    where: {
      id: itemId,
      organizationId: ctx.auth.organizationId
    }
  });

  if (!item) {
    throw new HttpError(404, "ITEM_NOT_FOUND", "Collection item was not found.");
  }

  if (item.status === CollectionItemStatus.CONVERTED_TO_QUESTION) {
    throw new HttpError(409, "ITEM_ALREADY_CONVERTED", "Converted items cannot be moderated again.");
  }

  const metadata = {
    ...jsonObject(item.metadata),
    moderatedBy: ctx.auth.userId,
    moderatedAt: new Date().toISOString(),
    rejectedReason: status === CollectionItemStatus.REJECTED ? reason ?? null : undefined
  };
  const updated = await prisma.collectionItem.update({
    where: { id: item.id },
    data: {
      status,
      metadata: sanitizeMetadata(metadata)
    },
    include: { source: true }
  });

  await audit(ctx, action, "collection_item", item.id, {
    projectId: item.projectId,
    sourceId: item.sourceId
  });

  return { item: formatItem(updated) };
}

async function assertProjectAccess(auth: AuthContext, projectId: string) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId: auth.organizationId,
      status: ProjectStatus.ACTIVE
    }
  });

  if (!project) {
    throw new HttpError(404, "PROJECT_NOT_FOUND", "Project was not found.");
  }

  return project;
}

async function assertSourceConnectorQuota(auth: AuthContext, delta: number) {
  const snapshot = await getEntitlementSnapshotForUser(auth.userId);
  const limit = snapshot?.limits.sourceConnectors ?? 0;

  if (limit === null) {
    return;
  }

  const count = await prisma.collectionSource.count({
    where: { organizationId: auth.organizationId }
  });

  if (count + delta > limit) {
    throw new HttpError(403, "ENTITLEMENT_REQUIRED", "The current plan source connector quota has been exhausted.");
  }
}

async function assertQuestionQuota(auth: AuthContext, requested: number) {
  const snapshot = await getEntitlementSnapshotForUser(auth.userId);
  const limit = snapshot?.limits.aiQuestions ?? 0;

  if (limit === null) {
    return;
  }

  const count = await prisma.question.count({
    where: {
      project: {
        organizationId: auth.organizationId
      }
    }
  });

  if (count + requested > limit) {
    throw new HttpError(403, "ENTITLEMENT_REQUIRED", "The current plan AI question quota has been exhausted.");
  }
}

async function uniqueSourceCode(
  organizationId: string,
  type: CollectionSourceType,
  name: string,
  requestedCode?: string
) {
  const base = requestedCode ? normalizeCode(requestedCode) : normalizeCode(`${type.toLowerCase()}-${name}`);

  if (requestedCode) {
    const exists = await prisma.collectionSource.findFirst({
      where: { organizationId, code: base }
    });

    if (exists) {
      throw new HttpError(409, "SOURCE_CODE_EXISTS", "Collection source code already exists.");
    }

    return base;
  }

  for (let index = 0; index < 10; index += 1) {
    const suffix = createHash("sha1").update(`${randomUUID()}:${index}`).digest("hex").slice(0, 6);
    const code = `${base}-${suffix}`.slice(0, 80);
    const exists = await prisma.collectionSource.findFirst({
      where: { organizationId, code }
    });

    if (!exists) {
      return code;
    }
  }

  throw new HttpError(409, "SOURCE_CODE_EXISTS", "Unable to allocate a unique source code.");
}

function normalizeCode(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);

  if (!normalized) {
    throw new HttpError(400, "SOURCE_CODE_INVALID", "Collection source code is invalid.");
  }

  return normalized;
}

export function formatSource(source: CollectionSource) {
  return {
    id: source.id,
    organizationId: source.organizationId,
    projectId: source.projectId,
    name: source.name,
    code: source.code,
    type: source.type,
    status: source.status.toLowerCase(),
    config: redactSourceConfigForResponse(source.type, source.config),
    secretConfigured: Boolean(source.secretRef),
    rateLimitPerHour: source.rateLimitPerHour,
    scheduleCron: source.scheduleCron,
    lastRunAt: source.lastRunAt?.toISOString() ?? null,
    nextRunAt: source.nextRunAt?.toISOString() ?? null,
    healthStatus: source.healthStatus.toLowerCase(),
    lastError: source.lastError,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString()
  };
}

function formatJob(job: CollectionJobWithSource) {
  return {
    id: job.id,
    organizationId: job.organizationId,
    projectId: job.projectId,
    sourceId: job.sourceId,
    source: job.source
      ? {
          id: job.source.id,
          name: job.source.name,
          code: job.source.code,
          type: job.source.type
        }
      : undefined,
    status: job.status.toLowerCase(),
    triggerType: job.triggerType.toLowerCase(),
    query: job.query,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    retryCount: job.retryCount,
    maxRetries: job.maxRetries,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    stats: job.stats ?? {},
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString()
  };
}

function formatItem(item: CollectionItem & { source?: CollectionSource }) {
  return {
    id: item.id,
    organizationId: item.organizationId,
    projectId: item.projectId,
    jobId: item.jobId,
    sourceId: item.sourceId,
    source: item.source
      ? {
          id: item.source.id,
          name: item.source.name,
          code: item.source.code,
          type: item.source.type
        }
      : undefined,
    rawTitle: item.rawTitle,
    rawText: item.rawText,
    url: item.url,
    domain: item.domain,
    author: item.author,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    language: item.language,
    intent: item.intent,
    keywords: item.keywords ?? [],
    qualityScore: item.qualityScore,
    trustScore: item.trustScore,
    status: item.status.toLowerCase(),
    createdQuestionId: item.createdQuestionId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

function confidenceFromItem(item: CollectionItem) {
  return (Math.max(0, Math.min(100, item.qualityScore)) / 100).toFixed(2);
}

async function audit(
  ctx: SourceHubContext,
  action: string,
  resourceType?: string,
  resourceId?: string,
  metadata?: Record<string, unknown>
) {
  await recordAuditEvent({
    organizationId: ctx.auth.organizationId,
    actorUserId: ctx.auth.userId,
    action,
    resourceType,
    resourceId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    metadata
  });
}

function assertEnabled() {
  if (!env.SOURCE_HUB_ENABLED) {
    throw new HttpError(404, "SOURCE_HUB_DISABLED", "Source Hub is disabled.");
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Math.floor(value), min), max);
}

function jsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

type CollectionJobWithSource = Prisma.CollectionJobGetPayload<{
  include: { source: true };
}>;
