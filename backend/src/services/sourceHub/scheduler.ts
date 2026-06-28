import { env } from "../../config/env.js";
import { runPendingCollectionJobs } from "./jobRunner.js";

let timer: NodeJS.Timeout | null = null;

export function startSourceHubScheduler() {
  if (!env.SOURCE_HUB_ENABLED || !env.SOURCE_HUB_SCHEDULER_ENABLED || timer) {
    return;
  }

  timer = setInterval(() => {
    runPendingCollectionJobs({ limit: 5 }).catch((error) => {
      console.error("Source Hub scheduler failed", error);
    });
  }, 60_000);

  timer.unref();
}

export function stopSourceHubScheduler() {
  if (!timer) {
    return;
  }

  clearInterval(timer);
  timer = null;
}
