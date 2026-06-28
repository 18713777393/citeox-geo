import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { invokeAiGateway, listAiProviders } from "../services/aiGateway.js";
import { generateReport, runMonitor } from "../services/geoWorkflow.js";
import { asyncHandler, parseBody } from "./routeHelpers.js";
import type { EntitlementKey } from "../services/entitlements.js";

export const aiRouter = Router();

const generateSchema = z.object({
  providerCode: z.string().trim().max(40).optional(),
  model: z.string().trim().max(80).optional(),
  input: z.string().trim().max(8000).optional(),
  operation: z.string().trim().max(80).default("ai.generate"),
  projectId: z.string().uuid().optional(),
  featureKey: z
    .enum([
      "questions.generate",
      "monitor.run",
      "content.generate",
      "reports.generate",
      "models.dispatch"
    ])
    .default("models.dispatch")
});

const monitorSchema = z.object({
  projectId: z.string().uuid().optional(),
  providerCode: z.string().trim().max(40).optional(),
  platforms: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
  limit: z.number().int().min(1).max(50).optional()
});

const reportSchema = z.object({
  projectId: z.string().uuid().optional(),
  period: z.string().trim().max(80).optional()
});

aiRouter.use(requireAuth);

aiRouter.get(
  "/providers",
  asyncHandler(async (_req, res) => {
    res.json({ providers: listAiProviders() });
  })
);

aiRouter.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const body = parseBody(generateSchema, req);
    const result = await invokeAiGateway({
      auth: req.auth!,
      featureKey: body.featureKey as EntitlementKey,
      providerCode: body.providerCode,
      model: body.model,
      input: body.input,
      projectId: body.projectId,
      operation: body.operation,
      metadata: {
        endpoint: "/api/ai/generate"
      }
    });

    res.json(result);
  })
);

aiRouter.post(
  "/monitor",
  asyncHandler(async (req, res) => {
    const body = parseBody(monitorSchema, req);
    res.json(await runMonitor({ auth: req.auth! }, body));
  })
);

aiRouter.post(
  "/report",
  asyncHandler(async (req, res) => {
    const body = parseBody(reportSchema, req);
    res.json(await generateReport({ auth: req.auth! }, body));
  })
);

aiRouter.get(
  "/usage",
  asyncHandler(async (_req, res) => {
    res.json({
      usage: {
        source: "ai_usage_logs",
        note: "Use /api/auth/me for current subscription quota snapshot."
      }
    });
  })
);
