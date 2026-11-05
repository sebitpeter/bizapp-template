import type { Request } from "express";
import { auditLogTable, db } from "@workspace/db";
import { logger } from "./logger";

/** Never store secrets in the audit log, even by accident. */
const SECRET_KEYS = /pass|secret|token|key|hash/i;
function scrub(details: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!details) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) out[k] = SECRET_KEYS.test(k) ? "[redacted]" : v;
  return out;
}

/**
 * Records who did what. Failures to write the audit log are logged but never
 * break the request itself.
 */
export async function audit(
  req: Request,
  action: string,
  entity?: string | null,
  entityId?: string | number | null,
  details?: Record<string, unknown>,
  actor?: { id: number; email: string } | null,
): Promise<void> {
  const who = actor ?? (req.user ? { id: req.user.id, email: req.user.email } : null);
  try {
    await db.insert(auditLogTable).values({
      userId: who?.id ?? null,
      userEmail: who?.email ?? null,
      action,
      entity: entity ?? null,
      entityId: entityId === undefined || entityId === null ? null : String(entityId),
      details: scrub(details),
      ip: req.ip ?? null,
    });
  } catch (err) {
    logger.error({ err, action }, "Could not write audit log");
  }
}
