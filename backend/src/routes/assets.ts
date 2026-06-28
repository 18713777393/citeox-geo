import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { listAssets, uploadAssetMetadata } from "../services/geoWorkflow.js";
import { asyncHandler, parseBody, parseQuery } from "./routeHelpers.js";

export const assetsRouter = Router();

const querySchema = z.object({
  projectId: z.string().uuid().optional()
});

const fileSchema = z.object({
  name: z.string().trim().min(1).max(180).optional(),
  filename: z.string().trim().min(1).max(180).optional(),
  mimeType: z.string().trim().min(1).max(120).optional(),
  type: z.string().trim().max(120).optional(),
  size: z.number().int().min(0).max(10 * 1024 * 1024).optional(),
  sizeBytes: z.number().int().min(0).max(10 * 1024 * 1024).optional()
});

const uploadSchema = z.object({
  projectId: z.string().uuid().optional(),
  type: z.string().trim().max(80).optional(),
  text: z.string().max(100_000).optional(),
  filename: z.string().trim().min(1).max(180).optional(),
  mimeType: z.string().trim().min(1).max(120).optional(),
  sizeBytes: z.number().int().min(0).max(10 * 1024 * 1024).optional(),
  files: z.array(fileSchema).max(12).optional()
});

assetsRouter.use(requireAuth);

assetsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = parseQuery(querySchema, req);
    res.json(await listAssets({ auth: req.auth! }, query.projectId));
  })
);

assetsRouter.post(
  "/upload",
  asyncHandler(async (req, res) => {
    const body = parseBody(uploadSchema, req);
    res.status(201).json(await uploadAssetMetadata({ auth: req.auth! }, body));
  })
);
