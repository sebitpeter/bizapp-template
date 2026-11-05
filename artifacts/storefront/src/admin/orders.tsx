import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, Bike, Phone, Search, Store, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  OrderStatus, PaymentStatus, getGetDashboardSummaryQueryKey, getListOrdersQueryKey, useListOrders, useUpdateOrderStatus, type ListOrdersParams, type Order,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/api-error";
import { statusLabel } from "@/lib/business";
import { useMoney } from "@/lib/theme";
import { EmptyBlock, ErrorBlock, StatusBadge } from "./common";
import { useAdmin } from "./session";

const STATUSES = Object.values(OrderStatus);
const PAYMENT_STATUSES = Object.values(PaymentStatus);
const METHOD_LABEL: Record<string, string> = { cod: "Cash / on delivery", flutterwave: "Flutterwave", pesapal: "Pesapal" };
const PAY_STYLE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-900 border-emerald-200",
  pending: "bg-amber-50 text-amber-900 border-amber-200",
  failed: "bg-red-100 text-red-900 border-red-200",
  refunded: "bg-zinc-100 text-zinc-700 border-zinc-200",
};
const PAY_LABEL: Record<string, string> = { paid: "Paid", pending: "Not paid yet", failed: "Payment failed", refunded: "Refunded" };

export function PaymentBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={`whitespace-nowrap ${PAY_STYLE[status] ?? ""}`} data-testid={`payment-${status}`}>{PAY_LABEL[status] ?? status}</Badge>;
}

export default function OrdersPage() {
  const money = useMoney();
  const { can } = useAdmin();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>("all");
  const [payment, setPayment] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState<Order | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().slice(0, 60)), 300);
    return () => clearTimeout(t);
  }, [search]);

  const params: ListOrdersParams = {
    ...(status !== "all" ? { status: status as ListOrdersParams["status"] } : {}),
    ...(payment !== "all" ? { paymentStatus: payment as ListOrdersParams["paymentStatus"] } : {}),
    ...(debounced ? { search: debounced } : {}),
  };
  const orders = useListOrders(params);
  const update = useUpdateOrderStatus();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  };
  const pay = useMutation({
    mutationFn: ({ order, action }: { order: Order; action: "mark_paid" | "mark_refunded" }) => api<Order>("POST", `/orders/${order.id}/payment`, { action }),
    onSuccess: (o, v) => { toast.success(`${o.code}: ${v.action === "mark_paid" ? "marked as paid" : "marked as refunded"}`); setOpen(o); refresh(); },
    onError: (err) => toast.error("Couldn't record the payment", { description: errorMessage(err) }),
  });

  const changeStatus = (order: Order, next: Order["status"]) =>
    update.mutate(
      { id: order.id, data: { status: next } },
      {
        onSuccess: (o) => { toast.success(`${order.code ?? `#${order.id}`} → ${statusLabel(next)}`); if (open?.id === o.id) setOpen(o); refresh(); },
        onError: (err) => toast.error("Couldn't update the order", { description: errorMessage(err) }),
      },
    );

  if (orders.isError) return <ErrorBlock onRetry={() => orders.refetch()} />;
  const rows = orders.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative md:w-80">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order code, name or phone" className="pl-8" aria-label="Search orders" data-testid="input-order-search" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="md:w-48" aria-label="Filter by status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={payment} onValueChange={setPayment}>
          <SelectTrigger className="md:w-48" aria-label="Filter by payment" data-testid="select-payment-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payments</SelectItem>
            {PAYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{PAY_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {orders.isLoading ? (
        <Card className="space-y-2 p-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</Card>
      ) : rows.length === 0 ? (
        <EmptyBlock title="No orders here" description={Object.keys(params).length ? "Try other filters or search." : "When customers check out, their orders appear here."} />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden lg:table-cell">Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="hidden md:table-cell">Payment</TableHead>
                <TableHead className="w-48">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.id} data-testid={`row-order-${o.code ?? o.id}`}>
                  <TableCell>
                    <button type="button" className="font-mono text-xs font-semibold underline-offset-2 hover:underline" onClick={() => setOpen(o)} data-testid={`button-open-order-${o.code ?? o.id}`}>{o.code ?? `#${o.id}`}</button>
                    <p className="text-[11px] text-muted-foreground">{new Date(o.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</p>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{o.customerName}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      {o.fulfillment === "pickup" ? <Store className="h-3 w-3" /> : <Bike className="h-3 w-3" />}
                      {o.fulfillment === "pickup" ? "Pickup" : o.deliveryZone ?? "Delivery"} · {o.customerPhone}
                    </p>
                  </TableCell>
                  <TableCell className="hidden max-w-xs text-sm lg:table-cell">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{money(o.total)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <PaymentBadge status={o.paymentStatus} />
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod}</p>
                  </TableCell>
                  <TableCell>
                    <Select value={o.status} onValueChange={(v) => changeStatus(o, v as Order["status"])} disabled={!can("orders.update") || (update.isPending && update.variables?.id === o.id)}>
                      <SelectTrigger className="h-8" aria-label={`Status of order ${o.code}`} data-testid={`select-order-status-${o.code ?? o.id}`}>
                        <SelectValue><StatusBadge status={o.status} /></SelectValue>
                      </SelectTrigger>
                      <SelectContent>{STATUSES.map((st) => <SelectItem key={st} value={st}>{statusLabel(st)}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2"><span className="font-mono">{open.code ?? `#${open.id}`}</span> <StatusBadge status={open.status} /> <PaymentBadge status={open.paymentStatus} /></DialogTitle>
                <DialogDescription>{new Date(open.createdAt).toLocaleString()} · {METHOD_LABEL[open.paymentMethod] ?? open.paymentMethod}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="rounded-md border p-3">
                  <p className="font-medium">{open.customerName}</p>
                  <p className="flex items-center gap-1 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> <a href={`tel:${open.customerPhone}`} className="hover:underline">{open.customerPhone}</a></p>
                  {open.customerEmail && <p className="text-muted-foreground"><a href={`mailto:${open.customerEmail}`} className="hover:underline">{open.customerEmail}</a></p>}
                  <p className="mt-2">{open.fulfillment === "pickup" ? "Pickup at the shop" : `Delivery — ${open.deliveryZone ?? ""}`}</p>
                  {open.deliveryAddress && <p className="text-muted-foreground">{open.deliveryAddress}</p>}
                  {open.deliveryNote && <p className="mt-1 italic text-muted-foreground">“{open.deliveryNote}”</p>}
                </div>
                <table className="w-full">
                  <tbody>
                    {open.items.map((i, n) => <tr key={n}><td className="py-0.5">{i.quantity}× {i.name}</td><td className="text-right font-mono tabular-nums">{money(i.unitPrice * i.quantity)}</td></tr>)}
                    <tr className="border-t"><td className="pt-1 text-muted-foreground">Delivery</td><td className="pt-1 text-right font-mono tabular-nums">{money(open.deliveryFee)}</td></tr>
                    <tr className="font-semibold"><td>Total</td><td className="text-right font-mono tabular-nums">{money(open.total)}</td></tr>
                  </tbody>
                </table>
                <div className="flex flex-wrap gap-2">
                  {can("orders.markPaid") && open.paymentStatus !== "paid" && open.paymentStatus !== "refunded" && (
                    <Button size="sm" onClick={() => pay.mutate({ order: open, action: "mark_paid" })} disabled={pay.isPending} data-testid="button-mark-paid"><Banknote className="mr-1 h-4 w-4" /> Mark as paid</Button>
                  )}
                  {can("orders.refund") && open.paymentStatus === "paid" && (
                    <Button size="sm" variant="outline" onClick={() => pay.mutate({ order: open, action: "mark_refunded" })} disabled={pay.isPending} data-testid="button-mark-refunded"><Undo2 className="mr-1 h-4 w-4" /> Record refund</Button>
                  )}
                </div>
                {open.paymentStatus === "paid" && can("orders.refund") && <p className="text-xs text-muted-foreground">“Record refund” only notes a refund you made in the provider dashboard or by hand — it doesn't send money.</p>}
                {open.history.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">History</p>
                    <ol className="space-y-1 border-l pl-3 text-xs">
                      {open.history.map((h, n) => <li key={n}><span className="text-muted-foreground">{new Date(h.at).toLocaleString()}</span> — {h.type === "status" ? statusLabel(h.value) : h.value}{h.by ? <span className="text-muted-foreground"> · {h.by}</span> : null}</li>)}
                    </ol>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
