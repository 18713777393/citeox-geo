import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { generateReport } from "../services/geoWorkflow.js";
import { asyncHandler, parseBody } from "./routeHelpers.js";

export const reportsRouter = Router();

const generateSchema = z.object({
  projectId: z.string().uuid().optional(),
  period: z.string().trim().max(80).optional()
});

reportsRouter.use(requireAuth);

reportsRouter.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const body = parseBody(generateSchema, req);
    res.status(201).json(await generateReport({ auth: req.auth! }, body));
  })
);
