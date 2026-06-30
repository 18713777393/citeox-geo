import { Queue, QueueEvents, Worker, type ConnectionOptions, type Job } from "bullmq";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { broadcastDiagnosisProgress } from "./diagnosisRealtime.js";

export const diagnosisQueueName = "diagnosis-queue";

type DiagnosisJob = {
  taskId: string;
};

const progressSteps = [
  { progress: 15, currentStep: "正在保存品牌信息..." },
  { progress: 40, currentStep: "正在启动数据采集..." },
  { progress: 80, currentStep: "正在生成初始诊断任务..." },
  { progress: 100, currentStep: "品牌创建成功，诊断任务已启动。" }
];

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
  const existing = await prisma.diagnosisTask.findUnique({ where: { id: taskId } });
  if (!existing || existing.status === "completed") return;

  const started = await prisma.diagnosisTask.update({
    where: { id: taskId },
    data: {
      status: "running",
      startedAt: existing.startedAt ?? new Date(),
      progress: Math.max(existing.progress, 10),
      currentStep: "正在保存品牌信息..."
    }
  });
  publishDiagnosisProgress(started);

  for (const step of progressSteps) {
    await sleep(450);
    const updated = await prisma.diagnosisTask.update({
      where: { id: taskId },
      data: {
        progress: step.progress,
        currentStep: step.currentStep,
        ...(step.progress >= 100
          ? {
              status: "completed",
              completedAt: new Date()
            }
          : {})
      }
    });
    publishDiagnosisProgress(updated);
  }
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

function getDiagnosisQueue() {
  if (diagnosisQueue) return diagnosisQueue;
  const connection = createRedisConnection();
  if (!connection) return null;
  diagnosisQueue = new Queue<DiagnosisJob, void, "run-diagnosis">(diagnosisQueueName, {
    connection
  });
  return diagnosisQueue;
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
