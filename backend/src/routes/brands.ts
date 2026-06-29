import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { asyncHandler, parseBody } from "./routeHelpers.js";
import {
  checkBrandCreateLimit,
  createBrandProject,
  getBrandProject
} from "../services/brands.js";

export const brandsRouter = Router();

const brandCreateSchema = z.object({
  industry: z.string().trim().min(1).max(100),
  subIndustry: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  brandName: z.string().trim().min(2).max(30),
  website: z.string().trim().max(500).optional(),
  goal: z.enum(["exposure", "traffic", "trust", "competitive", "all"]),
  platforms: z.array(z.string().trim().min(1).max(50)).min(1).max(10),
  competitors: z.array(z.string().trim().min(1).max(100)).max(5).optional(),
  keywords: z.array(z.string().trim().min(1).max(100)).max(10).optional()
});

brandsRouter.use(requireAuth);

brandsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(brandCreateSchema, req);
    const data = await createBrandProject(req.auth!, body);
    res.status(201).json({
      success: true,
      data,
      message: "品牌创建成功，系统已启动首次诊断。"
    });
  })
);

brandsRouter.get(
  "/check-limit",
  asyncHandler(async (req, res) => {
    const limit = await checkBrandCreateLimit(req.auth!.userId);
    res.json({
      success: true,
      data: limit
    });
  })
);

brandsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const brandId = requireRouteParam(req.params.id, "brand id");
    const brand = await getBrandProject(req.auth!.userId, brandId);
    res.json({
      success: true,
      data: { brand }
    });
  })
);

function requireRouteParam(value: string | undefined, label: string) {
  if (!value) {
    throw new HttpError(400, "VALIDATION_ERROR", `${label} is required.`);
  }
  return value;
}
