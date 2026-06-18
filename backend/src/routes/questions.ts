import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { expandQuestions, getQuestions } from "../services/geoWorkflow.js";
import { asyncHandler, parseBody, parseQuery } from "./routeHelpers.js";

export const questionsRouter = Router();

const projectQuerySchema = z.object({
  projectId: z.string().uuid().optional()
});

const expandSchema = z.object({
  projectId: z.string().uuid().optional(),
  brandName: z.string().trim().max(120).optional(),
  keywords: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  scenarios: z.union([z.string().trim().max(2000), z.array(z.string().trim().min(1).max(160)).max(20)]).optional(),
  limit: z.number().int().min(1).max(30).optional()
});

questionsRouter.use(requireAuth);

questionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = parseQuery(projectQuerySchema, req);
    res.json(await getQuestions({ auth: req.auth! }, query.projectId));
  })
);

questionsRouter.post(
  "/expand",
  asyncHandler(async (req, res) => {
    const body = parseBody(expandSchema, req);
    res.status(201).json(await expandQuestions({ auth: req.auth! }, body));
  })
);
