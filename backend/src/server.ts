import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { startSourceHubScheduler } from "./services/sourceHub/scheduler.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Zhiyin GEO API listening on port ${env.PORT}`);
});

startSourceHubScheduler();
