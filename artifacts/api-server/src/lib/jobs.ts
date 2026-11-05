import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { db, ordersTable, paymentsTable, pool } from "@workspace/db";
import { purgeExpiredSessions } from "./auth";
import { env } from "./env";
import { logger } from "./logger";
import { cancelOrder, refreshPayment } from "./orders";
import { isOnline } from "./payments";
import { notifyOrder } from "./notify";
import { loadSettings } from "./settings";

/**
 * Background housekeeping, every JOB_INTERVAL_SECONDS:
 *  - re-checks pending online payments with the provider (in case a webhook got lost)
 *  - cancels unpaid online orders after PAYMENT_TIMEOUT_MINUTES (stock goes back)
 *  - deletes expired sessions
 * With several servers, a Postgres advisory lock makes sure only one runs it.
 */
const LOCK = 724002;
let timer: NodeJS.Timeout | null = null;
let running = false;

export async function runJobsOnce(): Promise<{ checked: number; expired: number }> {
  if (running) return { checked: 0, expired: 0 };
  running = true;
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [LOCK]);
    if (!rows[0]?.ok) return { checked: 0, expired: 0 };
    try {
      const settings = await loadSettings();
      let checked = 0;
      const pending = await db
        .select()
        .from(paymentsTable)
        .where(and(eq(paymentsTable.status, "pending"), lt(paymentsTable.createdAt, new Date(Date.now() - 60_000))))
        .orderBy(asc(paymentsTable.lastCheckedAt))
        .limit(50);
      for (const p of pending) {
        if (!isOnline(p.provider) || !p.checkoutUrl) continue;
        try {
          const r = await refreshPayment(p, "poll");
          checked++;
          if (r?.becamePaid && r.order) notifyOrder("paid", r.order, settings);
        } catch (err) {
          logger.warn({ err: (err as Error).message, payment: p.reference }, "Payment re-check failed");
        }
      }
      const cutoff = new Date(Date.now() - env.paymentTimeoutMinutes * 60_000);
      const stale = await db
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(
          and(
            inArray(ordersTable.paymentMethod, ["flutterwave", "pesapal"]),
            inArray(ordersTable.paymentStatus, ["pending", "failed"]),
            eq(ordersTable.status, "Pending"),
            lt(ordersTable.createdAt, cutoff),
          ),
        )
        .limit(100);
      for (const o of stale) {
        await cancelOrder(o.id, `Not paid within ${env.paymentTimeoutMinutes} minutes`);
        await db.update(paymentsTable).set({ status: "failed", failureReason: "Expired", updatedAt: new Date() }).where(and(eq(paymentsTable.orderId, o.id), eq(paymentsTable.status, "pending")));
      }
      await purgeExpiredSessions();
      if (checked || stale.length) logger.info({ checked, expired: stale.length }, "Payment jobs ran");
      return { checked, expired: stale.length };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK]).catch(() => undefined);
    }
  } finally {
    client.release();
    running = false;
  }
}

export function startJobs(): void {
  if (env.jobIntervalSeconds <= 0 || timer) return;
  timer = setInterval(() => {
    runJobsOnce().catch((err) => logger.error({ err }, "Background jobs failed"));
  }, env.jobIntervalSeconds * 1000);
  timer.unref();
}

export function stopJobs(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
