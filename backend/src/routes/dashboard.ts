import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { asyncHandler, parseBody, parseQuery } from "./routeHelpers.js";
import {
  getDashboardOverview,
  getDashboardRefreshStatus,
  startDashboardRefresh
} from "../services/dashboard.js";

export const dashboardRouter = Router();

const overviewQuerySchema = z.object({
  range: z.enum(["today", "d7", "d30", "custom"]).optional(),
  refresh: z.coerce.boolean().optional()
});

const refreshSchema = z.object({
  force: z.boolean().optional()
});

dashboardRouter.use(requireAuth);

dashboardRouter.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const query = parseQuery(overviewQuerySchema, req);
    const overview = await getDashboardOverview(req.auth!, {
      range: query.range,
      bypassCache: query.refresh
    });
    res.json(overview);
  })
);

dashboardRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const body = parseBody(refreshSchema, req);
    const data = await startDashboardRefresh(req.auth!, body);
    res.status(202).json({
      success: true,
      data
    });
  })
);

dashboardRouter.get(
  "/refresh/:taskId",
  asyncHandler(async (req, res) => {
    const taskId = requireRouteParam(req.params.taskId, "dashboard refresh task id");
    const task = await getDashboardRefreshStatus(req.auth!.userId, taskId);
    if (!task) {
      throw new HttpError(404, "DASHBOARD_REFRESH_NOT_FOUND", "刷新任务不存在或您没有访问权限。");
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
