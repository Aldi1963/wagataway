import ipaddr from "ipaddr.js";
import { URL } from "url";

/**
 * Checks if a URL is safe to fetch (prevents SSRF).
 * Blocks localhost, private IP ranges, and invalid protocols.
 */
export async function validateSafeUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;

    const hostname = parsed.hostname;
    
    // Check if it's an IP
    if (ipaddr.isValid(hostname)) {
      const addr = ipaddr.parse(hostname);
      const range = addr.range();
      if (["loopback", "private", "linkLocal", "multicast", "unspecified"].includes(range)) {
        return false;
      }
    }

    // Block localhost names
    if (hostname === "localhost" || hostname.endsWith(".local")) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
