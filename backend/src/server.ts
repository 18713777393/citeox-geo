import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { startDiagnosisWorker } from "./services/diagnosisQueue.js";
import { attachDiagnosisProgressServer } from "./services/diagnosisRealtime.js";
import { startSourceHubScheduler } from "./services/sourceHub/scheduler.js";

const app = createApp();
const httpServer = createServer(app);

attachDiagnosisProgressServer(httpServer);

httpServer.listen(env.PORT, () => {
  console.log(`Zhiyin GEO API listening on port ${env.PORT}`);
});

startDiagnosisWorker();
startSourceHubScheduler();
