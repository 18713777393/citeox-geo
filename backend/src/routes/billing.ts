import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import {
  formatEntitlementsForClient,
  formatPlanForClient,
  getEntitlementSnapshotForUser,
  listPlans
} from "../services/entitlements.js";
import {
  listOrganizationOrders
} from "../services/billing.js";
import { asyncHandler } from "./routeHelpers.js";

export const billingRouter = Router();

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
    deprecatedBillingWrite("/api/v1/payment/callback");
    res.status(410).end();
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
    deprecatedBillingWrite("/api/v1/subscriptions/orders");
    res.status(410).end();
  })
);

billingRouter.post(
  "/invoice",
  asyncHandler(async (req, res) => {
    deprecatedBillingWrite("/api/v1/account/billing");
    res.status(410).end();
  })
);

function deprecatedBillingWrite(targetRoute: string): never {
  throw new HttpError(
    410,
    "BILLING_ROUTE_DEPRECATED",
    `旧版 /api/billing 写接口已停用，请使用 ${targetRoute}。`
  );
}
