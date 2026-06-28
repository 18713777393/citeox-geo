import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { apiRateLimit } from "./middleware/rateLimit.js";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import { aiRouter } from "./routes/ai.js";
import {
  accountRouter,
  paymentCallbackRouter,
  plansRouter,
  rechargeRouter,
  subscriptionsRouter
} from "./routes/account.js";
import { assetsRouter } from "./routes/assets.js";
import { billingRouter } from "./routes/billing.js";
import { contentsRouter } from "./routes/contents.js";
import { compatibilityRouter } from "./routes/compat.js";
import { gapsRouter } from "./routes/gaps.js";
import { healthRouter } from "./routes/health.js";
import { monitorRouter } from "./routes/monitor.js";
import { projectsRouter } from "./routes/projects.js";
import { questionsRouter } from "./routes/questions.js";
import { reportsRouter } from "./routes/reports.js";
import { scoresRouter } from "./routes/scores.js";
import { sourceHubRouter } from "./routes/sourceHub.js";
import { strategiesRouter } from "./routes/strategies.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      const allowedOrigins = env.CORS_ORIGIN.split(",").map((item) => item.trim()).filter(Boolean);
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS origin is not allowed."));
    },
    credentials: true
  }));
  app.use(express.json({ limit: "1mb" }));
  app.use(apiRateLimit);

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/account", accountRouter);
  app.use("/api/v1/plans", plansRouter);
  app.use("/api/v1/recharge", rechargeRouter);
  app.use("/api/v1/subscriptions", subscriptionsRouter);
  app.use("/api/v1/payment/callback", paymentCallbackRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/project", projectsRouter);
  app.use("/api/billing", billingRouter);
  app.use("/api/ai", aiRouter);
  app.use("/api/questions", questionsRouter);
  app.use("/api/source-hub", sourceHubRouter);
  app.use("/api/monitor", monitorRouter);
  app.use("/api/scores", scoresRouter);
  app.use("/api/gaps", gapsRouter);
  app.use("/api/strategies", strategiesRouter);
  app.use("/api/contents", contentsRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/assets", assetsRouter);
  app.use("/api/content", contentsRouter);
  app.use("/api/strategy", strategiesRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api", compatibilityRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
