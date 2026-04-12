import rateLimit from "express-rate-limit";

/**
 * Global API rate limit - 100 requests per 1 minute
 * Baseline protection for general browsing.
 */
export const globalRateLimit = rateLimit({
  windowMs: 60 * 1000, 
  max: 100, 
  message: { message: "Terlalu banyak request. Harap tunggu sebentar.", code: "TOO_MANY_REQUESTS" },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Public API rate limit - 30 requests per 1 minute
 * Stricter limit for external API integrations to prevent abuse.
 */
export const publicApiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { message: "API limit tercapai. Harap kurangi frekuensi pengiriman.", code: "API_LIMIT_REACHED" },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Sensitive actions rate limit - 5 requests per 1 minute
 * For password changes, profile updates, etc.
 */
export const sensitiveActionLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { message: "Terlalu banyak upaya. Coba lagi dalam semenit.", code: "SLOW_DOWN" },
  standardHeaders: true,
  legacyHeaders: false,
});
