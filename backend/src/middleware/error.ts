import type { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "请求的接口不存在或暂不可用，请检查地址后重试。"
    }
  });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message
      }
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "服务暂时不可用，请稍后重试。"
    }
  });
}

export function notImplemented(feature: string) {
  return new HttpError(
    501,
    "NOT_IMPLEMENTED",
    `${feature} 正在接入中，请稍后再试。`
  );
}
