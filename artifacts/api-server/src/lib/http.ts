import type { Response } from "express";
import type { ZodError } from "zod";

/** Send a 400 with a short, safe description of what was wrong (no stack traces). */
export function badRequest(res: Response, error: ZodError | string): void {
  if (typeof error === "string") {
    res.status(400).json({ error });
    return;
  }
  res.status(400).json({
    error: "Invalid request",
    issues: error.issues.slice(0, 20).map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  });
}

/** Postgres unique-violation error code. */
export function isUniqueViolation(err: unknown): boolean {
  // Drizzle wraps the pg error, so look at `cause` too.
  for (let e = err as { code?: string; cause?: unknown } | undefined, i = 0; e && i < 3; e = e.cause as typeof e, i++) {
    if (e.code === "23505") return true;
  }
  return false;
}


