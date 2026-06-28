import { Redis } from "ioredis";
import { env } from "../config/env.js";

let client: Redis | null = null;

export function getRedis() {
  if (!env.REDIS_URL) {
    return null;
  }

  if (!client) {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true
    });

    client.on("error", (error: Error) => {
      if (env.NODE_ENV !== "test") {
        console.error("Redis connection error", error);
      }
    });
  }

  return client;
}
