import { prisma } from "../lib/prisma.js";

export const diagnosisQueueName = "diagnosis-queue";

const progressSteps = [
  { progress: 15, currentStep: "正在保存品牌信息..." },
  { progress: 40, currentStep: "正在启动数据采集..." },
  { progress: 80, currentStep: "正在生成初始诊断任务..." },
  { progress: 100, currentStep: "品牌创建成功，诊断任务已启动。" }
];

export async function enqueueDiagnosisTask(taskId: string) {
  // Production hook: replace this inline fallback with BullMQ diagnosis-queue.
  // Progress events should be pushed to the logged-in user through WebSocket.
  setTimeout(() => {
    runInlineDiagnosisTask(taskId).catch((error) => {
      console.error("DOC-02 diagnosis fallback failed", error);
    });
  }, 0);

  return {
    queueName: diagnosisQueueName,
    transport: "BullMQ-ready WebSocket-progress fallback"
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

async function runInlineDiagnosisTask(taskId: string) {
  const existing = await prisma.diagnosisTask.findUnique({ where: { id: taskId } });
  if (!existing || existing.status === "completed") return;

  await prisma.diagnosisTask.update({
    where: { id: taskId },
    data: {
      status: "running",
      startedAt: existing.startedAt ?? new Date(),
      progress: Math.max(existing.progress, 10),
      currentStep: "正在保存品牌信息..."
    }
  });

  for (const step of progressSteps) {
    await sleep(450);
    await prisma.diagnosisTask.update({
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
  }
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
