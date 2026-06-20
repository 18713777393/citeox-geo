import "dotenv/config";
import { z } from "zod";

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}, z.boolean());

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(8787),
    CORS_ORIGIN: z.string().default("http://127.0.0.1:5500"),
    DATABASE_URL: z.string().default("postgresql://geo:geo@127.0.0.1:5432/geo"),
    JWT_SECRET: z.string().optional(),
    JWT_EXPIRES_IN: z.string().default("7d"),
    SESSION_SECRET: z.string().optional(),
    BCRYPT_COST: z.coerce.number().int().min(10).max(14).default(12),
    AUTH_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(10),
    AUTH_CODE_RESEND_SECONDS: z.coerce.number().int().positive().default(60),
    AUTH_DEMO_CODE: z.string().regex(/^\d{6}$/).optional(),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
    SOURCE_HUB_ENABLED: booleanFromEnv.default(true),
    SOURCE_HUB_SCHEDULER_ENABLED: booleanFromEnv.default(false),
    SOURCE_HUB_USER_AGENT: z.string().default("ZhiyinGEO-SourceHub/1.0"),
    SOURCE_HUB_TIMEOUT_MS: z.coerce.number().int().positive().default(12_000),
    SOURCE_HUB_MAX_PAGE_BYTES: z.coerce.number().int().positive().default(1_048_576),
    BING_SEARCH_API_KEY: z.string().optional(),
    BRAVE_SEARCH_API_KEY: z.string().optional(),
    TAVILY_API_KEY: z.string().optional(),
    SERPAPI_API_KEY: z.string().optional(),
    EMAIL_PROVIDER: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    SMS_PROVIDER: z.string().optional(),
    SMS_ACCESS_KEY: z.string().optional(),
    SMS_SECRET_KEY: z.string().optional(),
    SMS_SIGN_NAME: z.string().optional(),
    SMS_TEMPLATE_CODE: z.string().optional()
  })
  .passthrough();

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid backend environment configuration", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

if (env.NODE_ENV === "production" && !env.JWT_SECRET) {
  console.error("JWT_SECRET is required in production.");
  process.exit(1);
}
