import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, parseBody, parseQuery } from "./routeHelpers.js";
import {
  createRechargeOrder,
  createSubscriptionOrder,
  getAccountCreditSummary,
  getConsumptionTrend,
  getRechargeOrderStatus,
  getTransactions,
  processRechargeCallback,
  startRechargePayment,
  startSubscriptionPayment
} from "../services/credits.js";
import {
  formatEntitlementsForClient,
  formatPlanForClient,
  getEntitlementSnapshotForUser,
  listPlans
} from "../services/entitlements.js";
import {
  assertPasswordAllowed,
  publicEmail,
  publicPhone
} from "../services/authSecurity.js";

export const accountRouter = Router();
export const plansRouter = Router();
export const rechargeRouter = Router();
export const subscriptionsRouter = Router();
export const paymentCallbackRouter = Router();

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  industry: z.string().trim().min(1).max(100).optional()
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(32)
});

const transactionQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  type: z.string().trim().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional()
});

const trendQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(90).default(30)
});

const rechargeOrderSchema = z.object({
  amount: z.union([z.number(), z.string()]),
  paymentMethod: z.string().trim().max(40).optional()
});

const subscriptionOrderSchema = z.object({
  planCode: z.string().trim().min(1).max(80),
  billingCycle: z.enum(["monthly", "yearly"]).optional(),
  paymentMethod: z.string().trim().max(40).optional()
});

function requireRouteParam(value: string | undefined, label: string) {
  if (!value) {
    throw new HttpError(400, "VALIDATION_ERROR", `${label} is required.`);
  }
  return value;
}

plansRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const plans = await listPlans();
    res.json({
      success: true,
      data: {
        plans: plans.map(formatPlanForClient)
      }
    });
  })
);

accountRouter.use(requireAuth);
rechargeRouter.use(requireAuth);
subscriptionsRouter.use(requireAuth);

accountRouter.get(
  "/profile",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.auth!.userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        phone: true,
        industry: true,
        role: true,
        status: true,
        createdAt: true,
        lastLoginAt: true
      }
    });

    res.json({
      success: true,
      data: {
        profile: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          email: publicEmail(user.email),
          phone: publicPhone(user.phone),
          industry: user.industry,
          role: user.role.toLowerCase(),
          status: user.status.toLowerCase(),
          createdAt: user.createdAt.toISOString(),
          lastLoginAt: user.lastLoginAt?.toISOString() ?? null
        }
      }
    });
  })
);

accountRouter.put(
  "/profile",
  asyncHandler(async (req, res) => {
    const body = parseBody(profileSchema, req);
    const user = await prisma.user.update({
      where: { id: req.auth!.userId },
      data: {
        ...(body.displayName ? { displayName: body.displayName } : {}),
        ...(body.industry ? { industry: body.industry } : {})
      },
      select: {
        id: true,
        displayName: true,
        industry: true,
        updatedAt: true
      }
    });

    res.json({
      success: true,
      data: { profile: { ...user, updatedAt: user.updatedAt.toISOString() } },
      message: "个人资料已更新。"
    });
  })
);

accountRouter.put(
  "/password",
  asyncHandler(async (req, res) => {
    const body = parseBody(passwordSchema, req);
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: { id: true, username: true, passwordHash: true }
    });

    if (!user?.passwordHash || !(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
      throw new HttpError(400, "INVALID_CREDENTIALS", "当前密码不正确，请检查后重试。");
    }

    assertPasswordAllowed(body.newPassword, user.username ?? undefined);
    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });

    res.json({
      success: true,
      message: "密码已更新，请妥善保管新密码。"
    });
  })
);

accountRouter.get(
  "/plan",
  asyncHandler(async (req, res) => {
    const snapshot = await getEntitlementSnapshotForUser(req.auth!.userId);
    res.json({
      success: true,
      data: {
        plan: snapshot ? formatEntitlementsForClient(snapshot) : null
      }
    });
  })
);

accountRouter.get(
  "/usage",
  asyncHandler(async (req, res) => {
    const snapshot = await getEntitlementSnapshotForUser(req.auth!.userId);
    const entitlements = formatEntitlementsForClient(snapshot);
    const usage = snapshot?.usage ?? {};

    res.json({
      success: true,
      data: {
        usage: {
          brandProjects: usage.projects ?? 0,
          brandProjectsLimit: snapshot?.limits.projects ?? null,
          dailyRefresh: usage.dailyRefresh ?? 0,
          dailyRefreshLimit: snapshot?.limits.aiMonitorRuns ?? null,
          materials: usage.materials ?? 0,
          materialsLimit: snapshot?.limits.sourceConnectors ?? null,
          contentGeneration: usage.contentGeneration ?? 0,
          contentGenerationLimit: snapshot?.limits.contentGeneration ?? null
        },
        entitlements
      }
    });
  })
);

accountRouter.get(
  "/credits",
  asyncHandler(async (req, res) => {
    const credits = await getAccountCreditSummary(req.auth!.userId);
    const snapshot = await getEntitlementSnapshotForUser(req.auth!.userId);

    res.json({
      success: true,
      data: {
        credits,
        entitlements: formatEntitlementsForClient(snapshot)
      }
    });
  })
);

accountRouter.get(
  "/credits/transactions",
  asyncHandler(async (req, res) => {
    const query = parseQuery(transactionQuerySchema, req);
    const data = await getTransactions(req.auth!.userId, {
      page: query.page,
      pageSize: query.pageSize,
      type: query.type,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined
    });

    res.json({ success: true, data });
  })
);

accountRouter.get(
  "/credits/consumption-trend",
  asyncHandler(async (req, res) => {
    const query = parseQuery(trendQuerySchema, req);
    const trend = await getConsumptionTrend(req.auth!.userId, query.days);
    res.json({
      success: true,
      data: { trend }
    });
  })
);

rechargeRouter.post(
  "/orders",
  asyncHandler(async (req, res) => {
    const body = parseBody(rechargeOrderSchema, req);
    const order = await createRechargeOrder(req.auth!.userId, body);
    res.status(201).json({
      success: true,
      data: { order },
      message: "充值订单已创建。"
    });
  })
);

rechargeRouter.post(
  "/orders/:id/pay",
  asyncHandler(async (req, res) => {
    const orderId = requireRouteParam(req.params.id, "order id");
    const data = await startRechargePayment(req.auth!.userId, orderId);
    res.json({ success: true, data });
  })
);

rechargeRouter.get(
  "/orders/:id/status",
  asyncHandler(async (req, res) => {
    const orderId = requireRouteParam(req.params.id, "order id");
    const order = await getRechargeOrderStatus(req.auth!.userId, orderId);
    res.json({
      success: true,
      data: { order }
    });
  })
);

paymentCallbackRouter.post(
  "/:provider",
  asyncHandler(async (req, res) => {
    const provider = requireRouteParam(req.params.provider, "payment provider");
    const data = await processRechargeCallback(provider, req.body ?? {});
    res.json({
      success: true,
      data
    });
  })
);

subscriptionsRouter.post(
  "/orders",
  asyncHandler(async (req, res) => {
    const body = parseBody(subscriptionOrderSchema, req);
    const order = await createSubscriptionOrder(req.auth!.userId, body);
    res.status(201).json({
      success: true,
      data: { order },
      message: "套餐订单已创建。"
    });
  })
);

subscriptionsRouter.post(
  "/orders/:id/pay",
  asyncHandler(async (req, res) => {
    const orderId = requireRouteParam(req.params.id, "order id");
    const data = await startSubscriptionPayment(req.auth!.userId, orderId);
    res.json({
      success: true,
      data
    });
  })
);
