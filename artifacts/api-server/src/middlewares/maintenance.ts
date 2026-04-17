import { type Request, type Response, type NextFunction } from "express";
import { db, settingsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUserFromToken } from "../routes/auth";

/**
 * Middleware to block access during maintenance mode.
 * Admins are exempted from this block.
 */
export async function maintenanceGuard(req: Request, res: Response, next: NextFunction) {
  // 1. Skip check for public static assets or auth routes if needed
  if (req.path.startsWith("/api/auth") || req.path.startsWith("/api/public")) {
    return next();
  }

  try {
    // 2. Check maintenance mode from DB
    const [setting] = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, "maintenance_mode"));

    const isMaintenance = setting?.value === "true";

    if (!isMaintenance) {
      return next();
    }

    // 3. Maintenance is ON. Check if the user is an admin.
    const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
    if (token) {
      const userId = getUserFromToken(token);
      if (userId) {
        const [user] = await db
          .select({ role: usersTable.role })
          .from(usersTable)
          .where(eq(usersTable.id, userId));
          
        if (user?.role === "admin") {
          // Allow admins to pass through even in maintenance
          return next();
        }
      }
    }

    // 4. Not an admin and maintenance is active
    return res.status(503).json({
      success: false,
      message: "Server sedang dalam pemeliharaan (Maintenance Mode). Silakan coba lagi nanti.",
      code: "MAINTENANCE_MODE"
    });
  } catch (error) {
    // Fallback if DB fails
    next();
  }
}
