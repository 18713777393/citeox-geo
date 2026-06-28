import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth.js";
import {
  adminAuditLogs,
  adminDashboard,
  adminOrders,
  adminPermissions,
  adminRoles,
  adminTenants,
  adminUserStats,
  adminUsers,
  decideContentModeration,
  getSystemConfig,
  moderationQueue,
  requestOrderRefund,
  saveSystemConfig
} from "../services/admin.js";
import { asyncHandler, parseBody, parseQuery } from "./routeHelpers.js";

export const adminRouter = Router();

const listUsersQuery = z.object({
  q: z.string().trim().max(120).optional(),
  type: z.string().trim().max(40).optional(),
  take: z.coerce.number().int().min(1).max(200).optional()
});

const listOrdersQuery = z.object({
  status: z.string().trim().max(40).optional(),
  take: z.coerce.number().int().min(1).max(200).optional()
});

const refundSchema = z.object({
  orderId: z.string().trim().min(1).max(120),
  reason: z.string().trim().max(500).optional()
});

const moderationDecisionSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(1000).optional()
});

const configSchema = z.object({
  platformName: z.string().trim().max(120).optional(),
  siteDomain: z.string().trim().max(240).optional(),
  freeTrialDays: z.number().int().min(0).max(365).optional(),
  inviteReward: z.string().trim().max(240).optional(),
  defaultPlan: z.string().trim().max(80).optional(),
  supportEmail: z.string().trim().email().max(160).optional(),
  contentReviewRequired: z.boolean().optional()
});

const auditQuery = z.object({
  category: z.string().trim().max(40).optional(),
  keyword: z.string().trim().max(120).optional(),
  take: z.coerce.number().int().min(1).max(300).optional()
});

adminRouter.use(requireAdmin);

adminRouter.get(
  "/overview",
  asyncHandler(async (req, res) => {
    res.json(await adminDashboard(req.auth!));
  })
);

adminRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    res.json(await adminDashboard(req.auth!));
  })
);

adminRouter.get(
  "/users",
  asyncHandler(async (req, res) => {
    const query = parseQuery(listUsersQuery, req);
    res.json(await adminUsers(req.auth!, query));
  })
);

adminRouter.get(
  "/tenants",
  asyncHandler(async (req, res) => {
    res.json(await adminTenants(req.auth!));
  })
);

adminRouter.get(
  "/roles",
  asyncHandler(async (_req, res) => {
    res.json(adminRoles());
  })
);

adminRouter.get(
  "/user-stats",
  asyncHandler(async (req, res) => {
    res.json(await adminUserStats(req.auth!));
  })
);

adminRouter.get(
  "/orders",
  asyncHandler(async (req, res) => {
    const query = parseQuery(listOrdersQuery, req);
    res.json(await adminOrders(req.auth!, query));
  })
);

adminRouter.post(
  "/orders/refund",
  asyncHandler(async (req, res) => {
    const body = parseBody(refundSchema, req);
    res.json(await requestOrderRefund(req.auth!, body));
  })
);

adminRouter.get(
  "/moderation/queue",
  asyncHandler(async (req, res) => {
    res.json(await moderationQueue(req.auth!));
  })
);

adminRouter.post(
  "/moderation/decision",
  asyncHandler(async (req, res) => {
    const body = parseBody(moderationDecisionSchema, req);
    res.json(await decideContentModeration(req.auth!, body));
  })
);

adminRouter.get(
  "/permissions",
  asyncHandler(async (_req, res) => {
    res.json(adminPermissions());
  })
);

adminRouter.get(
  "/config",
  asyncHandler(async (req, res) => {
    res.json(await getSystemConfig(req.auth!));
  })
);

adminRouter.post(
  "/config",
  asyncHandler(async (req, res) => {
    const body = parseBody(configSchema, req);
    res.json(await saveSystemConfig(req.auth!, body));
  })
);

adminRouter.get(
  "/audit",
  asyncHandler(async (req, res) => {
    const query = parseQuery(auditQuery, req);
    res.json(await adminAuditLogs(req.auth!, query));
  })
);

adminRouter.get(
  "/audit-logs",
  asyncHandler(async (req, res) => {
    const query = parseQuery(auditQuery, req);
    res.json(await adminAuditLogs(req.auth!, query));
  })
);
