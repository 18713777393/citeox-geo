import { randomUUID } from "node:crypto";
import {
  CollectionHealthStatus,
  CollectionJobStatus,
  CollectionSourceStatus,
  type CollectionJob,
  type Prisma
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../middleware/error.js";
import { recordAuditEvent } from "../audit.js";
import { filterDuplicateCollectionItems } from "./deduper.js";
import { normalizeRawCollectionItem } from "./normalizer.js";
import { getAdapterForSource } from "./sourceRegistry.js";

interface RunPendingOptions {
  jobId?: string;
  limit?: number;
}

export async function runPendingCollectionJobs(options: RunPendingOptions = {}) {
  const jobs = await prisma.collectionJob.findMany({
    where: {
      id: options.jobId,
      status: CollectionJobStatus.PENDING
    },
    include: {
      source: true
    },
    orderBy: { createdAt: "asc" },
    take: options.limit ?? 5
  });

  const results = [];

  for (const job of jobs) {
    results.push(await runCollectionJob(job));
  }

  return { jobs: results };
}

async function runCollectionJob(job: Awaited<ReturnType<typeof loadJobForRun>>) {
  if (job.status !== CollectionJobStatus.PENDING) {
    return job;
  }

  const runningForSource = await prisma.collectionJob.count({
    where: {
      sourceId: job.sourceId,
      status: CollectionJobStatus.RUNNING,
      id: { not: job.id }
    }
  });

  if (runningForSource > 0) {
    return job;
  }

  const lockToken = randomUUID();
  const claimed = await prisma.collectionJob.updateMany({
    where: {
      id: job.id,
      status: CollectionJobStatus.PENDING
    },
    data: {
      status: CollectionJobStatus.RUNNING,
      startedAt: new Date(),
      lockedAt: new Date(),
      lockToken
    }
  });

  if (claimed.count !== 1) {
    return job;
  }

  const startedAt = Date.now();
  const input = jsonObject(job.input);
  const actorUserId = stringFrom(input.actorUserId);

  try {
    if (job.source.status === CollectionSourceStatus.PAUSED) {
      throw new HttpError(409, "SOURCE_PAUSED", "Collection source is paused.");
    }

    const adapter = getAdapterForSource(job.source);
    const rawItems = await adapter.collect({
      source: job.source,
      job,
      input
    });
    const normalized = rawItems
      .map((item) =>
        normalizeRawCollectionItem(item, {
          organizationId: job.organizationId,
          projectId: job.projectId,
          sourceId: job.sourceId,
          jobId: job.id
        })
      )
      .filter((item): item is Prisma.CollectionItemCreateManyInput => item !== null);
    const deduped = await filterDuplicateCollectionItems(normalized);
    const created = deduped.items.length
      ? await prisma.collectionItem.createMany({
          data: deduped.items,
          skipDuplicates: true
        })
      : { count: 0 };
    const stats = {
      collected: rawItems.length,
      normalized: normalized.length,
      inserted: created.count,
      deduped: rawItems.length - created.count,
      explicitDeduped: deduped.dedupedCount,
      latencyMs: Date.now() - startedAt
    };

    const [updated] = await prisma.$transaction([
      prisma.collectionJob.update({
        where: { id: job.id },
        data: {
          status: CollectionJobStatus.SUCCEEDED,
          finishedAt: new Date(),
          lockedAt: null,
          lockToken: null,
          stats,
          errorCode: null,
          errorMessage: null
        }
      }),
      prisma.collectionSource.update({
        where: { id: job.sourceId },
        data: {
          status: CollectionSourceStatus.ACTIVE,
          lastRunAt: new Date(),
          healthStatus: CollectionHealthStatus.HEALTHY,
          lastError: null
        }
      }),
      prisma.collectionSourceHealth.create({
        data: {
          organizationId: job.organizationId,
          sourceId: job.sourceId,
          status: CollectionHealthStatus.HEALTHY,
          latencyMs: stats.latencyMs,
          successCount: created.count,
          failureCount: 0
        }
      })
    ]);

    await recordAuditEvent({
      organizationId: job.organizationId,
      actorUserId,
      action: "source_hub.job.succeeded",
      resourceType: "collection_job",
      resourceId: job.id,
      metadata: {
        sourceId: job.sourceId,
        projectId: job.projectId,
        stats
      }
    });

    return updated;
  } catch (error) {
    return failJob(job, error, Date.now() - startedAt, actorUserId);
  }
}

async function failJob(
  job: CollectionJob,
  error: unknown,
  latencyMs: number,
  actorUserId: string | undefined
) {
  const normalized = normalizeError(error);

  const [updated] = await prisma.$transaction([
    prisma.collectionJob.update({
      where: { id: job.id },
      data: {
        status: CollectionJobStatus.FAILED,
        finishedAt: new Date(),
        lockedAt: null,
        lockToken: null,
        errorCode: normalized.code,
        errorMessage: normalized.message,
        stats: {
          collected: 0,
          inserted: 0,
          deduped: 0,
          latencyMs
        }
      }
    }),
    prisma.collectionSource.update({
      where: { id: job.sourceId },
      data: {
        status: CollectionSourceStatus.ERROR,
        healthStatus: CollectionHealthStatus.DOWN,
        lastError: normalized.message,
        lastRunAt: new Date()
      }
    }),
    prisma.collectionSourceHealth.create({
      data: {
        organizationId: job.organizationId,
        sourceId: job.sourceId,
        status: CollectionHealthStatus.DOWN,
        latencyMs,
        successCount: 0,
        failureCount: 1,
        lastError: normalized.message
      }
    })
  ]);

  await recordAuditEvent({
    organizationId: job.organizationId,
    actorUserId,
    action: "source_hub.job.failed",
    resourceType: "collection_job",
    resourceId: job.id,
    severity: "warning",
    metadata: {
      sourceId: job.sourceId,
      projectId: job.projectId,
      errorCode: normalized.code
    }
  });

  return updated;
}

async function loadJobForRun(id: string) {
  return prisma.collectionJob.findUniqueOrThrow({
    where: { id },
    include: { source: true }
  });
}

function normalizeError(error: unknown) {
  if (error instanceof HttpError) {
    return {
      code: error.code,
      message: error.message
    };
  }

  return {
    code: "COLLECTION_JOB_FAILED",
    message: "Collection job failed."
  };
}

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function stringFrom(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}
