import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { analyzeGaps } from "../services/geoWorkflow.js";
import { asyncHandler, parseBody } from "./routeHelpers.js";

export const gapsRouter = Router();

const analyzeSchema = z.object({
  projectId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(30).optional()
});

gapsRouter.use(requireAuth);

gapsRouter.post(
  "/analyze",
  asyncHandler(async (req, res) => {
    const body = parseBody(analyzeSchema, req);
    res.status(201).json(await analyzeGaps({ auth: req.auth! }, body));
  })
);
