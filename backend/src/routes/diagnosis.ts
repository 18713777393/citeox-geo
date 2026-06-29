import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { asyncHandler } from "./routeHelpers.js";
import { getDiagnosisTaskStatus } from "../services/diagnosisQueue.js";

export const diagnosisTasksRouter = Router();

diagnosisTasksRouter.use(requireAuth);

diagnosisTasksRouter.get(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const taskId = requireRouteParam(req.params.id, "diagnosis task id");
    const task = await getDiagnosisTaskStatus(req.auth!.userId, taskId);
    if (!task) {
      throw new HttpError(404, "DIAGNOSIS_TASK_NOT_FOUND", "诊断任务不存在或您没有访问权限。");
    }

    res.json({
      success: true,
      data: { task }
    });
  })
);

function requireRouteParam(value: string | undefined, label: string) {
  if (!value) {
    throw new HttpError(400, "VALIDATION_ERROR", `${label} is required.`);
  }
  return value;
}
