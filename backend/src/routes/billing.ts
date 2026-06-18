import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import {
  formatEntitlementsForClient,
  formatPlanForClient,
  getEntitlementSnapshotForUser,
  listPlans
} from "../services/entitlements.js";
import {
  createBillingOrder,
  listOrganizationOrders,
  processPaymentCallback,
  requestInvoicePlaceholder
} from "../services/billing.js";
import { asyncHandler, parseBody } from "./routeHelpers.js";

export const billingRouter = Router();

const createOrderSchema = z.object({
  planCode: z.string().trim().max(80).optional(),
  plan: z.string().trim().max(120).optional(),
  provider: z.string().trim().max(40).optional(),
  channel: z.string().trim().max(40).optional()
});

const callbackSchema = z.record(z.unknown());

const invoiceSchema = z.object({
  title: z.string().trim().min(1).max(160),
  amount: z.string().trim().max(80).optional(),
  orderId: z.string().trim().max(80).optional()
});

billingRouter.get(
  "/plans",
  asyncHandler(async (_req, res) => {
    const plans = await listPlans();

    res.json({
      plans: plans.map(formatPlanForClient)
    });
  })
);

billingRouter.post(
  "/callbacks/:provider",
  asyncHandler(async (req, res) => {
    const provider = req.params.provider;

    if (!provider) {
      throw new HttpError(400, "VALIDATION_ERROR", "Payment provider is required.");
    }

    const body = parseBody(callbackSchema, req);
    res.json(await processPaymentCallback({ provider, body }));
  })
);

billingRouter.use(requireAuth);

billingRouter.get(
  "/subscription",
  asyncHandler(async (req, res) => {
    const snapshot = await getEntitlementSnapshotForUser(req.auth!.userId);

    if (!snapshot) {
      res.json({
        subscription: null,
        entitlements: null
      });
      return;
    }

    res.json({
      subscription: snapshot.subscription,
      entitlements: formatEntitlementsForClient(snapshot),
      usage: snapshot.usage
    });
  })
);

billingRouter.get(
  "/entitlements",
  asyncHandler(async (req, res) => {
    const snapshot = await getEntitlementSnapshotForUser(req.auth!.userId);

    res.json({
      entitlements: formatEntitlementsForClient(snapshot),
      usage: snapshot?.usage ?? {}
    });
  })
);

billingRouter.get(
  "/orders",
  asyncHandler(async (req, res) => {
    res.json(await listOrganizationOrders(req.auth!));
  })
);

billingRouter.post(
  "/orders",
  asyncHandler(async (req, res) => {
    const body = parseBody(createOrderSchema, req);
    res.status(201).json(await createBillingOrder(req.auth!, body));
  })
);

billingRouter.post(
  "/invoice",
  asyncHandler(async (req, res) => {
    const body = parseBody(invoiceSchema, req);
    res.status(201).json(await requestInvoicePlaceholder(req.auth!, body));
  })
);
