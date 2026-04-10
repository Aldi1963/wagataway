import { type Request, type Response, type NextFunction } from "express";
import { getUserFromToken } from "../routes/auth";

/**
 * Express middleware that requires a valid Bearer token.
 * Sets `res.locals.userId` (number) on success; returns 401 otherwise.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  if (!token) {
    res.status(401).json({ message: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }
  const userId = getUserFromToken(token);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }
  res.locals.userId = userId;
  next();
}

/**
 * Extract userId from a request that has already passed `requireAuth`.
 * Safe to use inside route handlers guarded by the middleware.
 */
export function uid(res: Response): number {
  return res.locals.userId as number;
}

/**
 * Extract userId from an unguarded request; returns null if no/invalid token.
 * Use only where auth is truly optional.
 */
export function uidOptional(req: Request): number | null {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  if (!token) return null;
  return getUserFromToken(token);
}
