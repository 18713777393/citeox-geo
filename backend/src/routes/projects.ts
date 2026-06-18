import { Router } from "express";
import { requireAuth, requireEntitlement } from "../middleware/auth.js";
import { notImplemented } from "../middleware/error.js";

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

projectsRouter.get("/", (_req, _res, next) => {
  next(notImplemented("Project listing"));
});

projectsRouter.post("/", requireEntitlement("projects.create"), (_req, _res, next) => {
  next(notImplemented("Project creation"));
});

projectsRouter.get("/:projectId", (_req, _res, next) => {
  next(notImplemented("Project detail"));
});

projectsRouter.get("/:projectId/geo", (_req, _res, next) => {
  next(notImplemented("GEO closed-loop project data"));
});
