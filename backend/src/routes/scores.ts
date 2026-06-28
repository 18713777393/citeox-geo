import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { calculateScores } from "../services/geoWorkflow.js";
import { asyncHandler, parseBody } from "./routeHelpers.js";

export const scoresRouter = Router();

const calculateSchema = z.object({
  projectId: z.string().uuid().optional(),
  timeRange: z.string().trim().max(80).optional()
});

scoresRouter.use(requireAuth);

scoresRouter.post(
  "/calculate",
  asyncHandler(async (req, res) => {
    const body = parseBody(calculateSchema, req);
    res.status(201).json(await calculateScores({ auth: req.auth! }, body));
  })
);
