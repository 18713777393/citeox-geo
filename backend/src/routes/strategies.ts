import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { generateStrategies } from "../services/geoWorkflow.js";
import { asyncHandler, parseBody } from "./routeHelpers.js";

export const strategiesRouter = Router();

const generateSchema = z.object({
  projectId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(30).optional()
});

strategiesRouter.use(requireAuth);

strategiesRouter.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const body = parseBody(generateSchema, req);
    res.status(201).json(await generateStrategies({ auth: req.auth! }, body));
  })
);
