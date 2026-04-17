import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { rateLimit } from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

// ── Rate Limiting ────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Terlalu banyak permintaan dari IP ini, silakan coba lagi nanti.",
    code: "TOO_MANY_REQUESTS"
  }
});

app.use(limiter);

// ── Security Hardening ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP if it interferes with SPA dist
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Strictly allow only necessary headers and methods
app.use(cors({
  origin: true, // In production, replace with your actual domain
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"]
}));

// Limit JSON body size to prevent DOS
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// Trust the first proxy in the chain
app.set("trust proxy", 1);

// Request Timeout (Anti-Slowloris)
app.use((req, _res, next) => {
  req.setTimeout(30000, () => {
    const err: any = new Error("Request Timeout");
    err.status = 408;
    next(err);
  });
  next();
});

// Frontend dist detection
const frontendDist = path.resolve(__dirname, "../../wa-gateway/dist/public");
const frontendExists = fs.existsSync(path.join(frontendDist, "index.html"));

logger.info({ frontendDist, frontendExists }, "Frontend static path");

// Logging
app.use(
  pinoHttp({
    logger,
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url?.split("?")[0] }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  })
);

// Serve uploads
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));

// Serve frontend
if (frontendExists) {
  app.use(express.static(frontendDist));
}

import { maintenanceGuard } from "./middlewares/maintenance";

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api", maintenanceGuard, router);

// SPA fallback (catch-all for frontend)
if (frontendExists) {
  // Catch all routes that don't start with /api or /uploads
  app.get(/^((?!\/(api|uploads|test-server)).)*$/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.json({ status: "ok", message: "WA Gateway API running", frontend: "not built" });
  });
}

// Global Error Handler (Prevents sensitive data leaks)
app.use((err: any, _req: any, res: any, _next: any) => {
  logger.error({ err }, "Unhandled error");
  res.status(err.status || 500).json({
    message: process.env.NODE_ENV === "production" ? "Internal Server Error" : err.message,
    code: err.code || "INTERNAL_ERROR"
  });
});

export default app;
