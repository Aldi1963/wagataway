import { Router, type IRouter } from "express";
import { db, apiKeysTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { getUserFromToken } from "./auth";

const router: IRouter = Router();

function getUser(req: any): number {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  return (token ? getUserFromToken(token) : null) ?? 1;
}

router.get("/api-keys", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const keys = await db.select().from(apiKeysTable).where(eq(apiKeysTable.userId, uid));

  res.json(keys.map((k) => ({
    id: String(k.id),
    name: k.name,
    prefix: k.prefix,
    key: k.key,
    lastUsed: k.lastUsed?.toISOString(),
    createdAt: k.createdAt?.toISOString(),
    permissions: k.permissions ?? [],
  })));
});

router.post("/api-keys", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { name, permissions } = req.body;

  if (!name) {
    res.status(400).json({ message: "Name is required", code: "INVALID_REQUEST" });
    return;
  }

  const rawKey = `wag_${crypto.randomBytes(32).toString("hex")}`;
  const prefix = rawKey.substring(0, 12);

  const [key] = await db.insert(apiKeysTable)
    .values({ userId: uid, name, key: rawKey, prefix, permissions: permissions ?? ["read", "write"] })
    .returning();

  res.status(201).json({
    id: String(key.id),
    name: key.name,
    prefix: key.prefix,
    key: rawKey,
    lastUsed: key.lastUsed?.toISOString(),
    createdAt: key.createdAt?.toISOString(),
    permissions: key.permissions ?? [],
  });
});

router.delete("/api-keys/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  await db.delete(apiKeysTable).where(and(eq(apiKeysTable.id, id), eq(apiKeysTable.userId, uid)));
  res.sendStatus(204);
});

/* Atomic regenerate: delete all existing keys → create one fresh key */
router.put("/api-keys/regenerate", async (req, res): Promise<void> => {
  const uid = getUser(req);

  await db.delete(apiKeysTable).where(eq(apiKeysTable.userId, uid));

  const rawKey = `wag_${crypto.randomBytes(32).toString("hex")}`;
  const prefix = rawKey.substring(0, 12);

  const [key] = await db.insert(apiKeysTable)
    .values({ userId: uid, name: "Default API Key", key: rawKey, prefix, permissions: ["read", "write"] })
    .returning();

  res.status(201).json({
    id: String(key.id),
    name: key.name,
    prefix: key.prefix,
    key: rawKey,
    createdAt: key.createdAt?.toISOString(),
    permissions: key.permissions ?? [],
  });
});

export default router;
