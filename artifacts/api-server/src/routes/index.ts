import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import devicesRouter from "./devices";
import messagesRouter from "./messages";
import contactsRouter from "./contacts";
import autoreplyRouter from "./autoreply";
import apikeysRouter from "./apikeys";
import billingRouter from "./billing";
import scheduleRouter from "./schedule";
import webhookRouter from "./webhook";
import pluginsRouter from "./plugins";
import adminRouter from "./admin";
import paymentGatewayRouter from "./payment-gateway";
import csBotRouter from "./cs-bot";
import antiBannedRouter from "./anti-banned";
import apiPublicRouter from "./api-public";
import { notificationsRouter } from "./notifications";
import uploadRouter from "./upload";
import chatRouter from "./chat";
import templatesRouter from "./templates";
import contactGroupsRouter from "./contact-groups";
import twoFaRouter from "./two-fa";
import otpAuthRouter from "./otp-auth";
import analyticsRouter from "./analytics";
import cleanupRouter from "./cleanup";
import cannedResponsesRouter from "./canned-responses";
import publicRouter from "./public";
import dripRouter from "./drip";
import resellerRouter from "./reseller";
import blacklistRouter from "./blacklist";
import linksRouter from "./links";
import botOrdersRouter from "./bot-orders";
import adminWaBotRouter from "./admin-wa-bot";
import groupsRouter from "./groups";
import { requireAuth } from "../middlewares/require-auth";
import { globalRateLimit, publicApiRateLimit } from "../lib/rate-limiters";

const router: IRouter = Router();

// Global Limiter for all routes
router.use(globalRateLimit);

// Public routes (no auth required)
router.use(healthRouter);
router.use(authRouter);
router.use(otpAuthRouter);
router.use(publicRouter);
router.use(linksRouter); // /l/:code is public redirect

// Public API Layer — with stricter rate limit
router.use(publicApiRateLimit);
router.use(apiPublicRouter);

// Webhook receive endpoint is public (called by WA server with API key check internally)
// All other routes require auth
function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for public paths
  const PUBLIC_PATHS = [
    "/health",
    "/auth/login",
    "/auth/register",
    "/auth/google",
    "/auth/otp/send",
    "/auth/password/forgot",
    "/auth/2fa/check",
    "/cs-bot/receive",
  ];
  if (PUBLIC_PATHS.some((p) => req.path.startsWith(p))) {
    next();
    return;
  }
  // SSE endpoints (EventSource) cannot set custom headers — accept token via query param
  if (!req.headers.authorization && req.query?.token) {
    req.headers.authorization = `Bearer ${req.query.token as string}`;
  }
  requireAuth(req, res, next);
}

router.use(authMiddleware);

// Protected routes — req guaranteed to have valid token via authMiddleware above
router.use(dashboardRouter);
router.use(devicesRouter);
router.use(messagesRouter);
router.use(contactsRouter);
router.use(autoreplyRouter);
router.use(apikeysRouter);
router.use(billingRouter);
router.use(scheduleRouter);
router.use(webhookRouter);
router.use(pluginsRouter);
router.use(adminRouter);
router.use(paymentGatewayRouter);
router.use(csBotRouter);
router.use(antiBannedRouter);
router.use(notificationsRouter);
router.use(uploadRouter);
router.use(chatRouter);
router.use(templatesRouter);
router.use(contactGroupsRouter);
router.use(twoFaRouter);
router.use(analyticsRouter);
router.use(cleanupRouter);
router.use(cannedResponsesRouter);
router.use(dripRouter);
router.use(resellerRouter);
router.use(blacklistRouter);
router.use(botOrdersRouter);
router.use(adminWaBotRouter);
router.use(groupsRouter);

export default router;
