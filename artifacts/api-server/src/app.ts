import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

// Trust the first proxy in the chain (Replit / nginx / CDN)
// Required for express-rate-limit to correctly identify real client IPs
app.set("trust proxy", 1);

// Frontend dist — resolved relative to this file (dist/index.mjs → ../../wa-gateway/dist/public)
const frontendDist = path.resolve(__dirname, "../../wa-gateway/dist/public");
const frontendExists = fs.existsSync(path.join(frontendDist, "index.html"));

logger.info({ frontendDist, frontendExists }, "Frontend static path");

// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));

// Always attempt to serve built frontend assets (skipped automatically if files don't exist)
if (frontendExists) {
  app.use(express.static(frontendDist));
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api", router);

// SPA fallback — serve index.html for all non-API routes when frontend is built
if (frontendExists) {
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"), (err) => {
      if (err) {
        logger.error({ err }, "Failed to send index.html");
        res.status(500).send("Server error");
      }
    });
  });
} else {
  // Dev fallback: API-only mode
  app.get("/", (_req, res) => {
    res.json({ status: "ok", message: "WA Gateway API running", frontend: "not built" });
  });
}

export default app;
