import type { NextFunction, Request, Response } from "express";
import { checkEntitlement, type EntitlementKey } from "../services/entitlements.js";
import { verifyAuthToken, type ApiRole, type TokenContext } from "../services/auth.js";

export type UserRole = ApiRole;
export type AuthContext = TokenContext;

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const adminRoles: UserRole[] = ["admin", "super_admin"];

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authorization = req.header("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Authentication is required."
        }
      });
      return;
    }

    req.auth = await verifyAuthToken(authorization.slice("Bearer ".length).trim());
    next();
  } catch {
    res.status(401).json({
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication is required."
      }
    });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    requireAuth(req, res, () => {
      if (!req.auth || !roles.includes(req.auth.role)) {
        res.status(403).json({
          error: {
            code: "FORBIDDEN",
            message: "Required role is missing."
          }
        });
        return;
      }

      next();
    });
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  return requireRole(...adminRoles)(req, res, next);
}

export function requireEntitlement(featureKey: EntitlementKey) {
  return (req: Request, res: Response, next: NextFunction) => {
    requireAuth(req, res, async () => {
      try {
        if (!req.auth) {
          res.status(401).json({
            error: {
              code: "UNAUTHENTICATED",
              message: "Authentication is required."
            }
          });
          return;
        }

        const decision = await checkEntitlement(req.auth.userId, featureKey);

        if (!decision.allowed) {
          res.status(403).json({
            error: {
              code: "ENTITLEMENT_REQUIRED",
              message: decision.reason ?? "The current plan does not include this feature.",
              featureKey,
              remaining: decision.remaining ?? 0,
              planCode: decision.planCode
            }
          });
          return;
        }

        next();
      } catch (error) {
        next(error);
      }
    });
  };
}
