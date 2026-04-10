import app from "./app";
import { logger } from "./lib/logger";
import { seedDatabase } from "./seed";
import { restoreActiveSessions } from "./lib/wa-manager";
import { startScheduler } from "./lib/scheduler";
import { loadGatewayConfig } from "./routes/payment-gateway";
import { startRetryProcessor } from "./lib/retry-processor";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  seedDatabase();
  loadGatewayConfig().catch((e) => logger.error(e, "Failed to load gateway config"));
  restoreActiveSessions().catch((e) => logger.error(e, "Failed to restore WA sessions"));
  startScheduler();
  startRetryProcessor();
});
