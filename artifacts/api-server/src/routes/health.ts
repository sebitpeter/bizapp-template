import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";

const router: IRouter = Router();

/** Liveness: the process is up (no database call, cheap). */
router.get("/healthz", (_req, res) => {
  res.json(HealthCheckResponse.parse({ status: "ok" }));
});

/** Readiness: the database answers. Use this as the health check on Render / Docker. */
router.get("/readyz", async (req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.json({ status: "ready" });
  } catch (err) {
    req.log.warn({ err: (err as Error).message }, "readyz: database not reachable");
    res.status(503).json({ status: "database unavailable" });
  }
});

export default router;
