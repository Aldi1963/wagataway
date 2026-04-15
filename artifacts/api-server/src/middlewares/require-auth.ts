import { type Request, type Response, type NextFunction } from "express";
import { getUserFromToken } from "../routes/auth";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Express middleware that requires a valid Bearer token.
 * Sets `res.locals.userId` (number) on success; returns 401 otherwise.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
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

  // ── Suspension Check ──
  try {
    const [user] = await db.select({ isSuspended: usersTable.isSuspended })
      .from(usersTable).where(eq(usersTable.id, userId));
    
    if (!user) {
      res.status(401).json({ message: "User not found", code: "UNAUTHORIZED" });
      return;
    }

    if (user.isSuspended) {
      res.status(403).json({ message: "Akun Anda telah disuspend. Hubungi administrator.", code: "ACCOUNT_SUSPENDED" });
      return;
    }
  } catch (err) {
    console.error("[Auth] Midleware error:", err);
    res.status(500).json({ message: "Internal server error" });
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
