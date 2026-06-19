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
          message: "请先登录后再继续操作。"
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
        message: "请先登录后再继续操作。"
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
            message: "当前账号没有权限访问该功能。"
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
              message: "请先登录后再继续操作。"
            }
          });
          return;
        }

        const decision = await checkEntitlement(req.auth.userId, featureKey);

        if (!decision.allowed) {
          res.status(403).json({
            error: {
              code: "ENTITLEMENT_REQUIRED",
              message: decision.reason ?? "当前套餐暂未开通该功能，请升级套餐后使用。",
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
