import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { runMonitor } from "../services/geoWorkflow.js";
import { asyncHandler, parseBody } from "./routeHelpers.js";

export const monitorRouter = Router();

const runSchema = z.object({
  projectId: z.string().uuid().optional(),
  providerCode: z.string().trim().max(40).optional(),
  platforms: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
  limit: z.number().int().min(1).max(50).optional()
});

monitorRouter.use(requireAuth);

monitorRouter.post(
  "/run",
  asyncHandler(async (req, res) => {
    const body = parseBody(runSchema, req);
    res.status(201).json(await runMonitor({ auth: req.auth! }, body));
  })
);
