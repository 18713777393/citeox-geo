import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import { HttpError } from "../middleware/error.js";

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function parseBody<T extends z.ZodTypeAny>(schema: T, req: Request): z.output<T> {
  const parsed = schema.safeParse(req.body ?? {});

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request body.";
    throw new HttpError(400, "VALIDATION_ERROR", message);
  }

  return parsed.data;
}

export function parseQuery<T extends z.ZodTypeAny>(schema: T, req: Request): z.output<T> {
  const parsed = schema.safeParse(req.query ?? {});

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request query.";
    throw new HttpError(400, "VALIDATION_ERROR", message);
  }

  return parsed.data;
}
