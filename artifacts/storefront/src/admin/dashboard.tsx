import { DollarSign, Package, ReceiptText, ShoppingBag, Trophy } from "lucide-react";
import { Link } from "wouter";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useGetDashboardSummary, useListOrders } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMoney } from "@/lib/theme";
import { ErrorBlock, StatusBadge } from "./common";

export default function DashboardPage() {
  const money = useMoney();
  const summary = useGetDashboardSummary();
  const orders = useListOrders();

  if (summary.isError) return <ErrorBlock onRetry={() => summary.refetch()} />;
  const s = summary.data;
  const stats = [
    { label: "Revenue today", value: s ? money(s.revenueToday) : null, icon: DollarSign },
    { label: "Orders today", value: s ? String(s.ordersToday) : null, icon: ShoppingBag },
    { label: "Open orders", value: s ? String(s.openOrders) : null, icon: ReceiptText, hint: "Pending, preparing or out for delivery" },
    { label: "Avg. order (30 days)", value: s ? money(s.averageOrderValue) : null, icon: Package },
  ];
  const recent = (orders.data ?? []).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="font-medium text-foreground/80">{stat.label}</CardDescription>
              <stat.icon className="h-4 w-4 text-muted-foreground" aria-hidden />
            </CardHeader>
            <CardContent>
              {stat.value === null ? <Skeleton className="h-8 w-24" /> : <p className="text-2xl font-bold tabular-nums" data-testid={`stat-${stat.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{stat.value}</p>}
              {stat.hint && <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue, last 7 days</CardTitle>
            <CardDescription>Cancelled orders are not counted.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {!s ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={s.revenueTrend} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={84} tickFormatter={(v: number) => money(v).replace(/\.00$/, "")} />
                  <Tooltip cursor={{ fill: "var(--muted)" }} formatter={(v: number) => [money(v), "Revenue"]} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }} />
                  <Bar dataKey="value" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">At a glance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary/30 text-foreground"><Trophy className="h-4 w-4" /></span>
              <div>
                <p className="text-muted-foreground">Best seller</p>
                <p className="font-semibold">{s ? s.bestSellingProduct ?? "No sales yet" : <Skeleton className="h-4 w-28" />}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary/30 text-foreground"><ReceiptText className="h-4 w-4" /></span>
              <div>
                <p className="text-muted-foreground">All-time orders</p>
                <p className="font-semibold">{s ? s.totalOrders : <Skeleton className="h-4 w-12" />}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Latest orders</CardTitle>
            <CardDescription>The five most recent orders.</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm"><Link href="/admin/orders">View all</Link></Button>
        </CardHeader>
        <CardContent>
          {orders.isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No orders yet. They'll show up here as soon as customers check out.</p>
          ) : (
            <ul className="divide-y">
              {recent.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">#{o.id} · {o.customerName}</p>
                    <p className="truncate text-xs text-muted-foreground">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <StatusBadge status={o.status} />
                    <span className="w-20 text-right font-mono tabular-nums">{money(o.total)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
