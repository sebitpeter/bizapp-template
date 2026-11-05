import { Router, type IRouter } from "express";
import { count, gte, ne, notInArray, and } from "drizzle-orm";
import { db, ordersTable, type OrderLine } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { roundFor } from "../lib/money";
import { loadSettings } from "../lib/settings";

const router: IRouter = Router();

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Real numbers (the original returned made-up percentages). Cancelled orders don't count as revenue. */
router.get("/dashboard/summary", requireAuth("dashboard.view"), async (_req, res): Promise<void> => {
  const code = (await loadSettings()).currency.code;
  const roundMoney = (v: number) => roundFor(code, v);
  const today = startOfDay(new Date());
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = new Date(today);
  monthStart.setDate(monthStart.getDate() - 29);

  const [[{ value: totalOrders }], [{ value: openOrders }], recent] = await Promise.all([
    db.select({ value: count() }).from(ordersTable),
    db.select({ value: count() }).from(ordersTable).where(notInArray(ordersTable.status, ["Completed", "Cancelled"])),
    db
      .select()
      .from(ordersTable)
      .where(and(gte(ordersTable.createdAt, monthStart), ne(ordersTable.status, "Cancelled"))),
  ]);

  const todays = recent.filter((o) => o.createdAt >= today);
  const revenueToday = roundMoney(todays.reduce((s, o) => s + o.total, 0));
  const revenue30 = recent.reduce((s, o) => s + o.total, 0);

  const sold = new Map<string, number>();
  for (const order of recent) {
    for (const line of order.items as OrderLine[]) sold.set(line.name, (sold.get(line.name) ?? 0) + line.quantity);
  }
  const best = [...sold.entries()].sort((a, b) => b[1] - a[1])[0];

  const revenueTrend = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const value = recent.filter((o) => o.createdAt >= day && o.createdAt < next).reduce((s, o) => s + o.total, 0);
    return { label: day.toLocaleDateString("en-US", { weekday: "short" }), value: roundMoney(value) };
  });

  res.set("Cache-Control", "no-store");
  res.json({
    revenueToday,
    ordersToday: todays.length,
    totalOrders,
    openOrders,
    averageOrderValue: recent.length ? roundMoney(revenue30 / recent.length) : 0,
    bestSellingProduct: best ? best[0] : null,
    revenueTrend,
  });
});

export default router;
