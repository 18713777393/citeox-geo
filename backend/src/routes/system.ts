import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import { getCommercialReadiness } from "../services/commercialReadiness.js";
import { asyncHandler } from "./routeHelpers.js";

export const systemRouter = Router();

systemRouter.use(requireAdmin);

systemRouter.get(
  "/commercial-readiness",
  asyncHandler(async (_req, res) => {
    const readiness = getCommercialReadiness();
    res.json({
      success: true,
      data: { readiness }
    });
  })
);
